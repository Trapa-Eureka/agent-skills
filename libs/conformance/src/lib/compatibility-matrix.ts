import type { RegressionResult } from './regression-runner'

/**
 * A single agent's derived compatibility entry for a skill. Only `'tested'` exists today — see
 * {@link deriveCompatibility} for exactly what earns it.
 */
export interface RawCompatibilityEntry {
  status: 'tested'
}

/**
 * Raw, unvalidated per-agent compatibility for one skill, keyed by whatever `agentId` string
 * appeared in a recording — callers that care about real agent identifiers (e.g.
 * `generate-registry.ts`) are expected to filter these keys against their own `AgentType` list;
 * this package intentionally has no dependency on `@tech-leads-club/core` to check that itself.
 */
export type RawSkillCompatibility = Record<string, RawCompatibilityEntry>

/**
 * Derives a per-skill, per-agent compatibility signal from {@link RegressionResult}s: an agent
 * is marked `'tested'` for a skill when at least one of its recordings both declares
 * `expected: 'pass'` and actually matched that expectation (no regression) — i.e. we have a
 * recorded execution, attributed to that agent, that verifiably complies with the skill's
 * invariants right now.
 *
 * Deliberately excludes two cases: recordings expected to `'fail'` (negative/regression
 * fixtures — proving an agent violates a scenario is not a compatibility claim about it), and
 * matched-or-not results where `matched` is `false` (a currently-regressed recording says
 * nothing trustworthy about the agent it's attributed to).
 *
 * @param results - Regression results from {@link runRecordedRegressions}, across any number of
 *   suites/skills — this function groups them by `skillDir` itself.
 */
export function deriveCompatibility(results: RegressionResult[]): Map<string, RawSkillCompatibility> {
  const bySkill = new Map<string, RawSkillCompatibility>()

  for (const result of results) {
    if (!result.matched || result.expected !== 'pass') continue

    const existing = bySkill.get(result.skillDir) ?? {}
    existing[result.agentId] = { status: 'tested' }
    bySkill.set(result.skillDir, existing)
  }

  return bySkill
}
