import { join } from 'node:path'

import { SKILLS_SUBDIR } from '../constants'
import type { CorePorts } from '../ports'
import type { SkillMetadata, SkillsRegistry } from '../types'

import { migrateRegistrySchema } from './registry-schema.service'
import { downloadSkill, fetchRegistry, getSkillCachePath } from './registry.service'

/** File name a snapshot's registry payload is written under, matching the CDN's own artifact
 * name (`packages/skills-catalog/skills-registry.json`) so a snapshot directory is recognizable
 * at a glance. */
const SNAPSHOT_REGISTRY_FILENAME = 'skills-registry.json'

export interface SnapshotExportOptions {
  /** Directory to write the snapshot into. Created if missing. */
  outputDir: string
  /** Skill names to include. Omit (or leave empty) to export the entire catalog. */
  skills?: string[]
}

export interface SnapshotExportResult {
  outputDir: string
  /** Skills successfully written to the snapshot. */
  exportedSkills: string[]
  /** Skills that failed to download and were left out of the snapshot. */
  failedSkills: string[]
  /** The source registry's `version` (CDN ref), for reference in the export summary. */
  registryVersion: string
}

/**
 * Downloads the full skills catalog (or a named subset) into a self-contained local directory
 * that {@link readSnapshotRegistry} and {@link installSkillFromSnapshot} can install from with
 * zero network access — for air-gapped environments, reproducible CI, or a private mirror
 * (`agent-skills snapshot export`, TASK 8).
 *
 * Layout mirrors the CDN's own: `<outputDir>/skills-registry.json` (filtered to the exported
 * skills) plus `<outputDir>/skills/<skill.path>/<files...>` for each one. Re-running with a
 * narrower `skills` filter does not prune skills a previous, broader export already wrote —
 * remove `outputDir` first for a clean re-export.
 *
 * **Not signed.** A snapshot carries no Sigstore bundle (see TASK 3's `SignatureVerifierPort`) —
 * `install --registry <path>` trusts it exactly as much as it trusts any other local path you
 * point it at. Don't distribute a snapshot as though it were more authenticated than its source.
 *
 * @throws {Error} When the live registry can't be fetched, or `skills` names one that doesn't
 *   exist in it.
 *
 * @example
 * ```ts
 * const result = await exportRegistrySnapshot(ports, { outputDir: './offline-mirror' })
 * ```
 */
export async function exportRegistrySnapshot(
  ports: CorePorts,
  options: SnapshotExportOptions,
): Promise<SnapshotExportResult> {
  const registry = await fetchRegistry(ports, true)
  if (!registry) {
    throw new Error('Failed to fetch the skills registry — check your network connection and try again.')
  }

  const requestedNames = options.skills?.length ? new Set(options.skills) : null
  if (requestedNames) {
    const knownNames = new Set(registry.skills.map((skill) => skill.name))
    const unknown = [...requestedNames].filter((name) => !knownNames.has(name))
    if (unknown.length > 0) {
      throw new Error(`Unknown skill(s): ${unknown.join(', ')}`)
    }
  }

  const skillsToExport = requestedNames
    ? registry.skills.filter((skill) => requestedNames.has(skill.name))
    : registry.skills

  await ports.fs.mkdir(join(options.outputDir, SKILLS_SUBDIR), { recursive: true })

  const exportedSkills: string[] = []
  const failedSkills: string[] = []

  for (const skill of skillsToExport) {
    const cachedPath = await downloadSkill(ports, skill)
    if (!cachedPath) {
      failedSkills.push(skill.name)
      continue
    }

    // Copy only the skill's declared files, not the whole cache directory — the cache also
    // holds `.skill-meta.json` bookkeeping (content hash, download time) that isn't part of the
    // skill and would otherwise leak into the snapshot with export-time-stale values.
    const destDir = join(options.outputDir, SKILLS_SUBDIR, skill.path)
    for (const file of skill.files) {
      const destFile = join(destDir, file)
      await ports.fs.mkdir(join(destFile, '..'), { recursive: true })
      await ports.fs.cp(join(cachedPath, file), destFile, { recursive: true })
    }
    exportedSkills.push(skill.name)
  }

  const exportedRegistry: SkillsRegistry = {
    ...registry,
    skills: skillsToExport.filter((skill) => exportedSkills.includes(skill.name)),
  }
  await ports.fs.writeFile(
    join(options.outputDir, SNAPSHOT_REGISTRY_FILENAME),
    JSON.stringify(exportedRegistry, null, 2),
    'utf-8',
  )

  return { outputDir: options.outputDir, exportedSkills, failedSkills, registryVersion: registry.version }
}

/**
 * Reads a registry snapshot written by {@link exportRegistrySnapshot} directly from disk — no
 * network, no cache TTL. Runs the same {@link migrateRegistrySchema} a live fetch does (TASK 7),
 * so an offline install is never a second, divergent code path for schema handling.
 *
 * @returns The snapshot's registry, or `null` when `snapshotDir` has no `skills-registry.json`
 *   or it fails to parse.
 *
 * @example
 * ```ts
 * const registry = readSnapshotRegistry(ports, './offline-mirror')
 * ```
 */
export function readSnapshotRegistry(ports: CorePorts, snapshotDir: string): SkillsRegistry | null {
  const registryPath = join(snapshotDir, SNAPSHOT_REGISTRY_FILENAME)
  if (!ports.fs.existsSync(registryPath)) return null

  try {
    const raw = JSON.parse(ports.fs.readFileSync(registryPath, 'utf-8')) as SkillsRegistry
    return migrateRegistrySchema(raw).registry
  } catch {
    return null
  }
}

/**
 * Installs one skill from a registry snapshot directory into the normal skill cache (the same
 * path `downloadSkill` writes to), so every downstream step (`installSkills`, lockfile, update
 * detection) works identically whether a skill arrived from the CDN or a local snapshot.
 *
 * @returns The cache directory path on success, or `null` when the snapshot has no files for
 *   this skill (missing/incomplete snapshot).
 *
 * @example
 * ```ts
 * const cachePath = await installSkillFromSnapshot(ports, metadata, './offline-mirror')
 * ```
 */
export async function installSkillFromSnapshot(
  ports: CorePorts,
  skill: SkillMetadata,
  snapshotDir: string,
): Promise<string | null> {
  const sourceDir = join(snapshotDir, SKILLS_SUBDIR, skill.path)
  if (!ports.fs.existsSync(sourceDir)) return null

  const cachePath = getSkillCachePath(ports, skill.name)
  await ports.fs.mkdir(cachePath, { recursive: true })
  await ports.fs.cp(sourceDir, cachePath, { recursive: true })
  return cachePath
}
