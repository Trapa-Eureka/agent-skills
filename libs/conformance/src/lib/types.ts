/**
 * A behavioral test case for the conformance harness: a skill, the prompt used to invoke it,
 * and the invariants every compliant agent execution must satisfy.
 *
 * @example
 * ```ts
 * const scenario: Scenario = {
 *   skill: 'gh-address-comments',
 *   prompt: 'Check open PR review comments and summarize them without making any changes.',
 *   invariants: {
 *     required: ['checked_auth_status'],
 *     forbidden: ['modified_repository_files', 'created_pull_request'],
 *   },
 * }
 * ```
 */
export interface Scenario {
  /** Name of the skill under test, matching a `SKILL.md` folder name. */
  skill: string
  /** Prompt sent to each agent adapter for this scenario. */
  prompt: string
  /** Behavioral invariants the resulting execution is evaluated against. */
  invariants: ScenarioInvariants
}

/**
 * Required and forbidden behavioral invariant ids for a {@link Scenario}.
 */
export interface ScenarioInvariants {
  /** Invariant ids that MUST be observed in a compliant execution. */
  required: string[]
  /** Invariant ids that MUST NOT be observed in a compliant execution. */
  forbidden: string[]
}

/**
 * The coarse-grained action an agent took, as reported by an {@link AgentAdapter}.
 *
 * `bash` covers any shell command execution; `read_file`/`write_file`/`edit_file` cover
 * filesystem access; `other` covers actions the normalizer cannot classify (kept for
 * evidence/debugging, but ignored by invariant checkers).
 */
export type ToolKind = 'bash' | 'read_file' | 'write_file' | 'edit_file' | 'other'

/**
 * A single tool invocation reported by an adapter, already translated into the harness's
 * controlled {@link ToolKind} vocabulary so the normalizer can treat every adapter uniformly.
 */
export interface RawToolCall {
  /** Coarse-grained action kind. */
  kind: ToolKind
  /** Command text (for `bash`) or file path (for the file-access kinds). */
  detail: string
}

/**
 * Raw output an {@link AgentAdapter} returns after running a {@link Scenario} — the agent's own
 * transcript plus tool calls already mapped into the common {@link RawToolCall} vocabulary.
 */
export interface RawAgentExecution {
  /** Id of the adapter/agent that produced this execution. */
  agentId: string
  /** Raw transcript or stdout, kept for evidence and debugging. */
  rawOutput: string
  /** Tool calls observed during execution, in the common {@link RawToolCall} shape. */
  toolCalls: RawToolCall[]
}

/**
 * Adapter-agnostic view of an execution, produced by {@link normalizeExecution}. Invariant
 * checkers only ever look at this shape, never at adapter-specific raw output.
 */
export interface NormalizedExecution {
  /** Id of the adapter/agent that produced this execution. */
  agentId: string
  /** Shell commands the agent ran. */
  commandsRun: string[]
  /** File paths the agent read. */
  filesRead: string[]
  /** File paths the agent wrote or edited. */
  filesWritten: string[]
  /** Raw transcript or stdout, kept for evidence and debugging. */
  rawOutput: string
}

/**
 * Outcome of checking a single invariant against a {@link NormalizedExecution}, independent of
 * whether that invariant was declared `required` or `forbidden` for the scenario.
 */
export interface InvariantCheckResult {
  /** Whether the underlying condition (e.g. "files were written") was observed. */
  observed: boolean
  /** Optional human-readable evidence explaining the verdict. */
  evidence?: string
}

/**
 * Evaluates one invariant against a {@link NormalizedExecution}.
 */
export type InvariantChecker = (execution: NormalizedExecution) => InvariantCheckResult

/**
 * Result of evaluating one declared invariant for a scenario, with `observed` reinterpreted as
 * `upheld` relative to whether the invariant was `required` or `forbidden`.
 */
export interface InvariantEvaluation {
  /** Id of the evaluated invariant. */
  invariantId: string
  /** Whether the scenario declared this invariant as `required` or `forbidden`. */
  kind: 'required' | 'forbidden'
  /** Whether the invariant held (required: observed; forbidden: not observed). */
  upheld: boolean
  /** Optional human-readable evidence explaining the verdict. */
  evidence?: string
}

/** Pass/fail verdict for a single adapter's execution of a scenario. */
export type Verdict = 'PASS' | 'FAIL'

/**
 * Scenario-level verdict across all adapters: `DRIFT` when adapters disagree on the verdict for
 * the same scenario, otherwise the shared `PASS`/`FAIL`.
 */
export type ScenarioVerdict = Verdict | 'DRIFT'

/**
 * Per-adapter result of running a scenario: its {@link Verdict}, the evaluated invariants, and
 * the normalized execution they were evaluated against.
 */
export interface AdapterResult {
  /** Id of the adapter/agent that produced this result. */
  agentId: string
  /** Pass/fail verdict for this adapter's execution. */
  verdict: Verdict
  /** Per-invariant evaluation detail. */
  evaluations: InvariantEvaluation[]
  /** The normalized execution the evaluation was based on. */
  execution: NormalizedExecution
}

/**
 * Full conformance report for a scenario across every adapter it was run against.
 *
 * @example
 * ```ts
 * const report: ConformanceReport = {
 *   scenario: 'gh-address-comments',
 *   results: [],
 *   verdict: 'DRIFT',
 * }
 * ```
 */
export interface ConformanceReport {
  /** Skill/scenario name this report covers. */
  scenario: string
  /** Per-adapter results, in the order adapters were provided. */
  results: AdapterResult[]
  /** Scenario-level verdict: shared PASS/FAIL, or DRIFT on disagreement. */
  verdict: ScenarioVerdict
}
