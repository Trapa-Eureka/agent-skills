import { evaluateInvariants } from './evaluator'
import { normalizeExecution } from './normalizer'
import type { AgentAdapter } from './ports/agent-adapter.port'
import type { AdapterResult, ConformanceReport, Scenario, ScenarioVerdict } from './types'

/**
 * Runs a scenario through every given adapter and evaluates each execution against the
 * scenario's invariants, producing a scenario-level PASS/FAIL/DRIFT report.
 *
 * The scenario verdict is `DRIFT` when adapters disagree on PASS/FAIL for the same scenario —
 * the signal this harness exists to surface — otherwise it is the shared PASS/FAIL.
 *
 * @param scenario - Scenario to run.
 * @param adapters - Agent adapters to run the scenario through; at least one is required.
 * @throws {Error} When `adapters` is empty.
 */
export async function runConformance(scenario: Scenario, adapters: AgentAdapter[]): Promise<ConformanceReport> {
  if (adapters.length === 0) {
    throw new Error('runConformance requires at least one adapter')
  }

  const results: AdapterResult[] = []
  for (const adapter of adapters) {
    const raw = await adapter.execute(scenario)
    const execution = normalizeExecution(raw)
    const { verdict, evaluations } = evaluateInvariants(execution, scenario.invariants)
    results.push({ agentId: adapter.id, verdict, evaluations, execution })
  }

  const verdicts = new Set(results.map((result) => result.verdict))
  const verdict: ScenarioVerdict = verdicts.size > 1 ? 'DRIFT' : (results[0].verdict as ScenarioVerdict)

  return { scenario: scenario.skill, results, verdict }
}
