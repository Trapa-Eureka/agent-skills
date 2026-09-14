import type { AgentType, SkillCompatibility } from '../types'

/**
 * Lists the agents a skill's declared {@link SkillCompatibility} marks as tested, in whatever
 * order they were declared. Safe to call with `undefined` — returns `[]`.
 *
 * Unlike {@link summarizePermissions}, this deliberately does not enumerate every possible
 * {@link AgentType} in a fixed order: with 19 supported agents and (today) very few skills
 * carrying any compatibility data, a full fixed-order list would mostly read as noise. Callers
 * that want a full matrix across all agents can build one from {@link AGENT_TYPES} themselves.
 *
 * @param compatibility - Skill's declared compatibility signal, if any.
 */
export function summarizeCompatibility(compatibility?: SkillCompatibility): AgentType[] {
  if (!compatibility) return []
  return (Object.keys(compatibility) as AgentType[]).filter((agentId) => compatibility[agentId]?.status === 'tested')
}
