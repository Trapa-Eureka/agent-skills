import type { SkillsRegistry } from '../types'

/**
 * Newest `skills-registry.json` `schemaVersion` this CLI build has explicit knowledge of. Bump
 * this alongside `REGISTRY_SCHEMA_VERSION` in `packages/skills-catalog/src/utils.ts` whenever
 * the registry schema changes, and add a migration step to {@link REGISTRY_SCHEMA_MIGRATIONS} if
 * the change isn't purely additive.
 */
export const MAX_KNOWN_REGISTRY_SCHEMA_VERSION = 1

/**
 * Transforms a registry payload from the schemaVersion it declares up to the next one. Keyed by
 * the schemaVersion a step upgrades *from*.
 *
 * Empty today: every schemaVersion this project has shipped — the implicit pre-`schemaVersion`
 * shape (treated as version 1, see {@link resolveRegistrySchemaVersion}) and explicit version 1
 * itself — only ever adds optional fields (`permissions`, `requires`, `compatibility`, ...), and
 * TypeScript's structural typing means a CLI built before such a field existed already ignores it
 * safely at runtime. Nothing needs reshaping yet. This map exists so that the day a schema
 * version *isn't* purely additive, the fix is one more entry here — mirroring
 * `migrateLockFile` in `lockfile.service.ts` — rather than reworking `fetchRegistry` itself.
 *
 * @example
 * ```ts
 * // when schema v2 needs one:
 * const REGISTRY_SCHEMA_MIGRATIONS: Partial<Record<number, RegistrySchemaMigrationStep>> = {
 *   1: (registry) => ({ ...registry, schemaVersion: 2, skills: registry.skills.map(upgradeSkillShape) }),
 * }
 * ```
 */
type RegistrySchemaMigrationStep = (registry: SkillsRegistry) => SkillsRegistry

const REGISTRY_SCHEMA_MIGRATIONS: Partial<Record<number, RegistrySchemaMigrationStep>> = {}

/**
 * Reads a registry's effective schemaVersion. A registry fetched before the `schemaVersion`
 * field existed (introduced alongside schema v1's `permissions`/`requires`) predates it by
 * definition, and its shape is a strict subset of v1's — so absence resolves to `1`, not `0` or
 * `undefined`. This never mutates the registry: it's a pure read.
 */
export function resolveRegistrySchemaVersion(registry: SkillsRegistry): number {
  return registry.schemaVersion ?? 1
}

export interface RegistrySchemaMigrationResult {
  /** The registry, migrated up to the newest schemaVersion a step exists for. Same object
   * reference as the input when no migration step applied — which, as of today, is always. */
  registry: SkillsRegistry
  /** The migrated registry's effective schemaVersion (see {@link resolveRegistrySchemaVersion}). */
  schemaVersion: number
  /** True when `schemaVersion` is newer than {@link MAX_KNOWN_REGISTRY_SCHEMA_VERSION} — this
   * CLI build doesn't have explicit knowledge of it. Not necessarily an error: every schema
   * change so far has been additive, so parsing still succeeds and only genuinely new fields go
   * unused. Callers should warn, not block, on this. */
  isNewerThanKnown: boolean
}

/**
 * Runs a freshly-fetched registry through any applicable {@link REGISTRY_SCHEMA_MIGRATIONS}
 * steps and reports whether it's newer than this CLI build knows how to fully interpret.
 *
 * @param registry - Registry payload as parsed from the fetched JSON, before caching.
 *
 * @example
 * ```ts
 * const { registry: migrated, isNewerThanKnown, schemaVersion } = migrateRegistrySchema(registry)
 * if (isNewerThanKnown) {
 *   ports.logger.warn(`registry schema v${schemaVersion} is newer than this CLI supports`)
 * }
 * ```
 */
export function migrateRegistrySchema(registry: SkillsRegistry): RegistrySchemaMigrationResult {
  let current = registry
  let version = resolveRegistrySchemaVersion(registry)

  while (version < MAX_KNOWN_REGISTRY_SCHEMA_VERSION) {
    const step = REGISTRY_SCHEMA_MIGRATIONS[version]
    if (!step) break
    current = step(current)
    version = resolveRegistrySchemaVersion(current)
  }

  return { registry: current, schemaVersion: version, isNewerThanKnown: version > MAX_KNOWN_REGISTRY_SCHEMA_VERSION }
}
