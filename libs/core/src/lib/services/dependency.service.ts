import type { SkillInfo } from '../types'

/**
 * Result of resolving a requested set of skills against their declared `requires.skills`
 * dependencies.
 */
export interface DependencyResolution {
  /**
   * Every requested skill plus every skill it transitively requires, deduplicated, in
   * topological order (a skill always appears after the skills it depends on).
   */
  resolved: SkillInfo[]
  /** Names pulled in only because another selected skill's `requires.skills` needed them. */
  autoIncluded: string[]
  /** Names referenced by some `requires.skills` that don't exist among `allSkills`. */
  missing: string[]
  /**
   * Circular `requires.skills` chains found while resolving, each as the cycle path ending
   * back where it started (e.g. `['a', 'b', 'a']`). Resolution still completes when a cycle is
   * found — each skill on the cycle is still resolved exactly once — this is purely a diagnostic
   * for callers to warn about, since a legitimate skill graph should never need one.
   */
  cycles: string[][]
}

/**
 * Expands a requested list of skill names into the full set that must be installed together,
 * by walking each skill's `requires.skills` (see {@link SkillRequirements}) transitively.
 *
 * Traversal is depth-first with cycle detection: a name reached while it is still on the
 * current path is reported in {@link DependencyResolution.cycles} and not re-entered, so a
 * circular `requires.skills` declaration can never cause infinite recursion. A referenced name
 * absent from `allSkills` is reported in {@link DependencyResolution.missing} and simply
 * excluded from `resolved` — the caller decides whether that's fatal.
 *
 * @param allSkills - Full catalog to resolve `requires.skills` names against (e.g. every skill
 *   in the fetched registry) — not just the requested ones.
 * @param requestedNames - Names of the skills the user explicitly selected.
 *
 * @example
 * ```ts
 * const { resolved, autoIncluded } = resolveSkillDependencies(allSkills, ['figma-implement-design'])
 * // resolved: [figma, figma-implement-design] if figma-implement-design requires figma
 * // autoIncluded: ['figma']
 * ```
 */
export function resolveSkillDependencies(allSkills: SkillInfo[], requestedNames: string[]): DependencyResolution {
  const byName = new Map(allSkills.map((skill) => [skill.name, skill]))
  const resolved: SkillInfo[] = []
  const resolvedNames = new Set<string>()
  const missing = new Set<string>()
  const cycles: string[][] = []
  const visiting = new Set<string>()
  const path: string[] = []

  function visit(name: string): void {
    if (resolvedNames.has(name)) return
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name)
      cycles.push([...path.slice(cycleStart), name])
      return
    }

    const skill = byName.get(name)
    if (!skill) {
      missing.add(name)
      return
    }

    visiting.add(name)
    path.push(name)
    for (const dependencyName of skill.requires?.skills ?? []) {
      visit(dependencyName)
    }
    path.pop()
    visiting.delete(name)

    resolvedNames.add(name)
    resolved.push(skill)
  }

  for (const name of requestedNames) visit(name)

  const requestedSet = new Set(requestedNames)
  const autoIncluded = resolved.filter((skill) => !requestedSet.has(skill.name)).map((skill) => skill.name)

  return { resolved, autoIncluded, missing: [...missing], cycles }
}
