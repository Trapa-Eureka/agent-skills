import type { RawAgentExecution, Scenario } from '../types'

/**
 * A single AI coding agent integration the conformance harness can run a {@link Scenario}
 * against — one implementation per agent (e.g. Claude Code, Codex), plus a fixture-replay
 * implementation for deterministic tests.
 */
export interface AgentAdapter {
  /** Stable id identifying the adapter/agent in reports (e.g. `'claude-code'`, `'codex'`). */
  readonly id: string

  /**
   * Runs the scenario's prompt against the agent and returns its raw execution, already
   * translated into the harness's common tool-call vocabulary.
   *
   * @param scenario - Scenario to execute.
   */
  execute(scenario: Scenario): Promise<RawAgentExecution>
}
