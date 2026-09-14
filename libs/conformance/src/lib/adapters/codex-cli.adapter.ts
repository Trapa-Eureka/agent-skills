import type { AgentAdapter } from '../ports/agent-adapter.port'
import type { ProcessRunner } from '../ports/process-runner.port'
import type { RawAgentExecution, Scenario, ToolKind } from '../types'

import { parseToolCallTranscript } from './tool-call-transcript'

/**
 * Best-effort mapping from Codex's own tool names to the harness's {@link ToolKind} vocabulary.
 * Verify against the installed CLI version's actual JSON output before relying on this in a
 * live run — see {@link parseToolCallTranscript}.
 */
const CODEX_TOOL_NAME_MAP: Record<string, ToolKind> = {
  shell: 'bash',
  read_file: 'read_file',
  apply_patch: 'edit_file',
}

/**
 * Real {@link AgentAdapter} that runs a scenario's prompt through the `codex` CLI in
 * non-interactive automation mode (`codex exec`). Not exercised against a live binary by this
 * package's default test suite (no CLI/API key available in CI) — command assembly is
 * unit-tested against a mocked {@link ProcessRunner}; transcript parsing is best-effort (see
 * {@link parseToolCallTranscript}).
 */
export class CodexCliAdapter implements AgentAdapter {
  public readonly id = 'codex'

  constructor(
    private readonly runner: ProcessRunner,
    private readonly binary: string = 'codex',
  ) {}

  public async execute(scenario: Scenario): Promise<RawAgentExecution> {
    const { stdout } = await this.runner.run(this.binary, ['exec', scenario.prompt, '--json'])
    return {
      agentId: this.id,
      rawOutput: stdout,
      toolCalls: parseToolCallTranscript(stdout, CODEX_TOOL_NAME_MAP),
    }
  }
}
