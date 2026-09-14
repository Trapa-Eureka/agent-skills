import type { SkillPermissions, SkillRequirements } from '../types'

/**
 * Tri-state result of checking one declared capability: `granted`/`denied` when the skill's
 * frontmatter explicitly declares it, or `unspecified` when the skill has no `permissions`
 * block (or omits that specific field) — never collapsed into `denied`, so an undeclared skill
 * is never shown as if it had been vetted and found safe.
 */
export type PermissionState = 'granted' | 'denied' | 'unspecified'

/**
 * One capability line ready for display, e.g. in a CLI permission summary.
 */
export interface PermissionSummaryLine {
  /** Human-readable capability label, e.g. `'Read files'`. */
  label: string
  /** Declared state of this capability. */
  state: PermissionState
}

function stateOf(value: boolean | undefined): PermissionState {
  if (value === true) return 'granted'
  if (value === false) return 'denied'
  return 'unspecified'
}

/**
 * Builds a fixed-order permission summary from a skill's declared {@link SkillPermissions}.
 * Safe to call with `undefined` (a skill with no `permissions` block) — every line comes back
 * `unspecified` rather than `denied`.
 *
 * @param permissions - Skill's declared capability manifest, if any.
 */
export function summarizePermissions(permissions?: SkillPermissions): PermissionSummaryLine[] {
  return [
    { label: 'Read files', state: stateOf(permissions?.filesystem?.read) },
    { label: 'Write files', state: stateOf(permissions?.filesystem?.write) },
    { label: 'Shell commands', state: stateOf(permissions?.shell?.enabled) },
    { label: 'Network access', state: stateOf(permissions?.network?.enabled) },
    { label: 'Read git history', state: stateOf(permissions?.git?.read) },
    { label: 'Write git history', state: stateOf(permissions?.git?.write) },
  ]
}

/**
 * Lists the MCP server names a skill declares it requires. Safe to call with `undefined`.
 *
 * @param requires - Skill's declared requirements, if any.
 */
export function summarizeMcpRequirements(requires?: SkillRequirements): string[] {
  return requires?.mcp ?? []
}
