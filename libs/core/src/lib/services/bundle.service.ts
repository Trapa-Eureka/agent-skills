import { createHash } from 'node:crypto'

import type { CorePorts } from '../ports'
import type { SkillMetadata } from '../types'

const BLOCK_SIZE = 512
/** Baked into every entry instead of read from the filesystem/clock, so two builds from the
 * same source files always produce byte-identical output. */
const FIXED_MODE = 0o644
const FIXED_MTIME = 0
const FIXED_UID = 0
const FIXED_GID = 0

export interface BundleFile {
  /** POSIX-style relative path inside the archive (e.g. `references/WCAG.md`). */
  path: string
  content: Buffer
}

function octal(value: number, fieldLength: number): string {
  return value.toString(8).padStart(fieldLength - 1, '0') + '\0'
}

function writeAscii(buf: Buffer, offset: number, value: string, fieldLength: number): void {
  buf.write(value, offset, fieldLength, 'utf-8')
}

/**
 * Builds one 512-byte USTAR header block for a regular file entry, with a correctly computed
 * checksum. Paths over 100 bytes are split across the `name`/`prefix` fields the way real `tar`
 * does, so archives stay extractable by standard tools.
 */
function buildHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(BLOCK_SIZE)

  let name = path
  let prefix = ''
  if (Buffer.byteLength(path, 'utf-8') > 100) {
    // The rightmost '/' gives the shortest possible suffix — any earlier slash only makes the
    // suffix (and so the chance it still doesn't fit in 100 bytes) longer, never shorter.
    const splitIndex = path.lastIndexOf('/')
    if (splitIndex === -1 || path.length - splitIndex - 1 > 100) {
      throw new Error(`Path segment too long for a tar entry: ${path}`)
    }
    prefix = path.slice(0, splitIndex)
    name = path.slice(splitIndex + 1)
  }

  writeAscii(header, 0, name, 100)
  header.write(octal(FIXED_MODE, 8), 100, 8, 'ascii')
  header.write(octal(FIXED_UID, 8), 108, 8, 'ascii')
  header.write(octal(FIXED_GID, 8), 116, 8, 'ascii')
  header.write(octal(size, 12), 124, 12, 'ascii')
  header.write(octal(FIXED_MTIME, 12), 136, 12, 'ascii')
  header.write('        ', 148, 8, 'ascii') // checksum field, filled with spaces while computing
  header.write('0', 156, 1, 'ascii') // typeflag: regular file
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  writeAscii(header, 345, prefix, 155)

  let checksum = 0
  for (let i = 0; i < BLOCK_SIZE; i += 1) checksum += header[i]
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')

  return header
}

/**
 * Builds a deterministic, uncompressed USTAR tar archive from a set of files: the same input
 * (path + bytes, regardless of the order they're given in) always produces byte-identical
 * output. A normal tar writer fills mtime/uid/gid/permissions from the filesystem or clock at
 * build time — every one of those fields is a fixed constant here instead, and entries are
 * always written in path-sorted order, so *when* or *where* a bundle is built never affects it.
 * This is the property "reproducible builds" means: rebuild from the same source, get the same
 * bytes, independent of anyone's claim about what they published.
 *
 * @example
 * ```ts
 * const bundle = createDeterministicTarball([{ path: 'SKILL.md', content: Buffer.from('...') }])
 * const hash = hashBundle(bundle)
 * ```
 */
export function createDeterministicTarball(files: BundleFile[]): Buffer {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const chunks: Buffer[] = []

  for (const file of sorted) {
    chunks.push(buildHeader(file.path, file.content.length))
    chunks.push(file.content)
    const padding = (BLOCK_SIZE - (file.content.length % BLOCK_SIZE)) % BLOCK_SIZE
    if (padding > 0) chunks.push(Buffer.alloc(padding))
  }

  // USTAR end-of-archive marker: two zeroed 512-byte blocks.
  chunks.push(Buffer.alloc(BLOCK_SIZE * 2))

  return Buffer.concat(chunks)
}

/** SHA-256 of a bundle's bytes — what {@link SkillMetadata.bundleHash} is checked against. */
export function hashBundle(bundle: Buffer): string {
  return createHash('sha256').update(bundle).digest('hex')
}

/**
 * Reads a skill's declared `files` from `sourceDir` (a skill cache directory, or a snapshot's
 * `skills/<skill.path>` directory — anywhere {@link installSkillFromSnapshot} or `downloadSkill`
 * would leave them) and builds its deterministic bundle.
 *
 * @returns The bundle bytes and their hash, or `null` when any declared file is missing from
 *   `sourceDir` (an incomplete download/snapshot).
 *
 * @example
 * ```ts
 * const result = await createSkillBundle(ports, metadata, getSkillCachePath(ports, metadata.name))
 * ```
 */
export async function createSkillBundle(
  ports: CorePorts,
  skill: SkillMetadata,
  sourceDir: string,
): Promise<{ bundle: Buffer; hash: string } | null> {
  const files: BundleFile[] = []

  for (const file of skill.files) {
    const filePath = `${sourceDir}/${file}`
    if (!ports.fs.existsSync(filePath)) return null
    // FileSystemPort only reads text (utf-8) — the same assumption downloadSkillFile already
    // makes (`response.text()`), not a new limitation. Every file in the catalog today is text;
    // a binary skill asset would need FileSystemPort to grow a raw-bytes read first.
    files.push({ path: file, content: Buffer.from(ports.fs.readFileSync(filePath, 'utf-8'), 'utf-8') })
  }

  const bundle = createDeterministicTarball(files)
  return { bundle, hash: hashBundle(bundle) }
}
