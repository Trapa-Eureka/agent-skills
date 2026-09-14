import { readFileSync } from 'node:fs'

import { z } from 'zod'

import type { AgentAdapter } from '../ports/agent-adapter.port'
import type { RawAgentExecution } from '../types'

const RawToolCallSchema = z.object({
  kind: z.enum(['bash', 'read_file', 'write_file', 'edit_file', 'other']),
  detail: z.string(),
})

const RawAgentExecutionSchema = z.object({
  agentId: z.string(),
  rawOutput: z.string(),
  toolCalls: z.array(RawToolCallSchema),
})

/**
 * Deterministic {@link AgentAdapter} that replays a canned {@link RawAgentExecution} instead of
 * invoking a real agent CLI. This is the default adapter used by the harness's own test suite,
 * so pipeline logic (loader → normalizer → evaluator → report) can be verified without live
 * API keys or installed CLIs.
 */
export class MockAgentAdapter implements AgentAdapter {
  public readonly id: string
  private readonly execution: RawAgentExecution

  constructor(id: string, execution: RawAgentExecution) {
    this.id = id
    this.execution = execution
  }

  public async execute(): Promise<RawAgentExecution> {
    return this.execution
  }
}

/**
 * Loads and validates a canned {@link RawAgentExecution} fixture, e.g. one under
 * `fixtures/transcripts/`.
 *
 * @param path - Path to a transcript fixture JSON file.
 */
export function loadTranscriptFixture(path: string): RawAgentExecution {
  const contents = readFileSync(path, 'utf-8')
  return RawAgentExecutionSchema.parse(JSON.parse(contents))
}
