import { getInvariantChecker } from './invariants/registry'
import type { InvariantEvaluation, NormalizedExecution, ScenarioInvariants, Verdict } from './types'

/**
 * Result of evaluating every declared invariant against one execution.
 */
export interface EvaluationResult {
  /** PASS when every invariant was upheld, FAIL otherwise. */
  verdict: Verdict
  /** Per-invariant evaluation detail, in `required` then `forbidden` order. */
  evaluations: InvariantEvaluation[]
}

/**
 * Evaluates a scenario's declared invariants against one normalized execution.
 *
 * A `required` invariant is upheld when its checker observes the condition; a `forbidden`
 * invariant is upheld when its checker does NOT observe the condition.
 *
 * @param execution - Normalized execution to evaluate.
 * @param invariants - Scenario's required/forbidden invariant ids.
 * @throws {Error} When an invariant id has no registered checker.
 */
export function evaluateInvariants(execution: NormalizedExecution, invariants: ScenarioInvariants): EvaluationResult {
  const evaluations: InvariantEvaluation[] = []

  for (const invariantId of invariants.required) {
    const { observed, evidence } = getInvariantChecker(invariantId)(execution)
    evaluations.push({ invariantId, kind: 'required', upheld: observed, evidence })
  }

  for (const invariantId of invariants.forbidden) {
    const { observed, evidence } = getInvariantChecker(invariantId)(execution)
    evaluations.push({ invariantId, kind: 'forbidden', upheld: !observed, evidence })
  }

  const verdict: Verdict = evaluations.every((evaluation) => evaluation.upheld) ? 'PASS' : 'FAIL'
  return { verdict, evaluations }
}
