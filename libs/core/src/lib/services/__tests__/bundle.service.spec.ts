import { createHash } from 'node:crypto'

import { describe, expect, it } from '@jest/globals'

import type { CorePorts, FileSystemPort } from '../../ports'
import type { SkillMetadata } from '../../types'
import { createDeterministicTarball, createSkillBundle, hashBundle } from '../bundle.service'

function file(path: string, content: string) {
  return { path, content: Buffer.from(content, 'utf-8') }
}

describe('createDeterministicTarball', () => {
  it('produces byte-identical output across repeated builds of the same input', () => {
    const files = [file('SKILL.md', '# Hello'), file('references/notes.md', 'notes')]

    const first = createDeterministicTarball(files)
    const second = createDeterministicTarball(files)

    expect(first.equals(second)).toBe(true)
  })

  it('is independent of input array order', () => {
    const a = createDeterministicTarball([file('b.md', 'B'), file('a.md', 'A')])
    const b = createDeterministicTarball([file('a.md', 'A'), file('b.md', 'B')])

    expect(a.equals(b)).toBe(true)
  })

  it('produces different output for different content', () => {
    const a = createDeterministicTarball([file('SKILL.md', 'v1')])
    const b = createDeterministicTarball([file('SKILL.md', 'v2')])

    expect(a.equals(b)).toBe(false)
  })

  it('produces different output for different file names, same content', () => {
    const a = createDeterministicTarball([file('a.md', 'same')])
    const b = createDeterministicTarball([file('b.md', 'same')])

    expect(a.equals(b)).toBe(false)
  })

  it('produces a well-formed empty archive (just the two EOF blocks) for no files', () => {
    const bundle = createDeterministicTarball([])
    expect(bundle.length).toBe(1024)
    expect(bundle.equals(Buffer.alloc(1024))).toBe(true)
  })

  it('pads every entry to a 512-byte boundary', () => {
    const bundle = createDeterministicTarball([file('SKILL.md', 'not a multiple of 512 bytes')])
    // header (512) + content padded to 512 + two 512-byte EOF blocks
    expect(bundle.length).toBe(512 + 512 + 1024)
  })

  it('writes a header whose USTAR magic, name, and checksum fields are correct', () => {
    const content = Buffer.from('# Hello', 'utf-8')
    const bundle = createDeterministicTarball([{ path: 'SKILL.md', content }])
    const header = bundle.subarray(0, 512)

    expect(header.toString('utf-8', 0, 8).replace(/\0/g, '')).toBe('SKILL.md')
    expect(header.toString('ascii', 257, 263)).toBe('ustar\0')
    expect(header.toString('ascii', 263, 265)).toBe('00')
    expect(parseInt(header.toString('ascii', 124, 135).replace(/\0/g, ''), 8)).toBe(content.length)

    // Recompute the checksum the same way tar readers do (sum of all bytes with the checksum
    // field itself treated as 8 spaces) and confirm it matches what was written.
    const recomputed = Buffer.from(header)
    recomputed.write('        ', 148, 8, 'ascii')
    let expectedChecksum = 0
    for (const byte of recomputed) expectedChecksum += byte
    const writtenChecksum = parseInt(header.toString('ascii', 148, 154).replace(/\0/g, ''), 8)
    expect(writtenChecksum).toBe(expectedChecksum)
  })

  it('splits a path over 100 bytes across the USTAR name/prefix fields without throwing', () => {
    const longPath = `references/${'a'.repeat(95)}.md`
    expect(longPath.length).toBeGreaterThan(100)
    expect(() => createDeterministicTarball([file(longPath, 'x')])).not.toThrow()
  })
})

describe('hashBundle', () => {
  it('is the sha256 of the bundle bytes', () => {
    const bundle = createDeterministicTarball([file('SKILL.md', 'content')])
    expect(hashBundle(bundle)).toBe(createHash('sha256').update(bundle).digest('hex'))
  })

  it('matches for two builds of the same source, and differs when source changes', () => {
    const a = createDeterministicTarball([file('SKILL.md', 'v1')])
    const b = createDeterministicTarball([file('SKILL.md', 'v1')])
    const c = createDeterministicTarball([file('SKILL.md', 'v2')])

    expect(hashBundle(a)).toBe(hashBundle(b))
    expect(hashBundle(a)).not.toBe(hashBundle(c))
  })
})

describe('createSkillBundle', () => {
  function fakePorts(files: Record<string, string>): CorePorts {
    const fs = {
      existsSync: (path: string) => path in files,
      readFileSync: (path: string) => {
        if (!(path in files)) throw new Error(`ENOENT: ${path}`)
        return files[path]
      },
    } as unknown as FileSystemPort

    return { fs } as unknown as CorePorts
  }

  const skill: SkillMetadata = {
    name: 'accessibility',
    description: 'Improve accessibility',
    category: 'quality',
    path: '(quality)/accessibility',
    files: ['SKILL.md', 'references/WCAG.md'],
  }

  it('builds a bundle and hash from a source directory', async () => {
    const ports = fakePorts({
      '/cache/accessibility/SKILL.md': '# Accessibility',
      '/cache/accessibility/references/WCAG.md': '# WCAG',
    })

    const result = await createSkillBundle(ports, skill, '/cache/accessibility')

    expect(result).not.toBeNull()
    expect(result?.hash).toBe(hashBundle(result?.bundle as Buffer))
  })

  it('is reproducible: the same source directory always yields the same hash', async () => {
    const ports = fakePorts({
      '/cache/accessibility/SKILL.md': '# Accessibility',
      '/cache/accessibility/references/WCAG.md': '# WCAG',
    })

    const first = await createSkillBundle(ports, skill, '/cache/accessibility')
    const second = await createSkillBundle(ports, skill, '/cache/accessibility')

    expect(first?.hash).toBe(second?.hash)
  })

  it('returns null when a declared file is missing from the source directory', async () => {
    const ports = fakePorts({ '/cache/accessibility/SKILL.md': '# Accessibility' })

    const result = await createSkillBundle(ports, skill, '/cache/accessibility')

    expect(result).toBeNull()
  })
})
