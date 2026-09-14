import type { AgentAdapter } from '../ports/agent-adapter.port'
import type { ProcessRunner } from '../ports/process-runner.port'
import type { RawAgentExecution, Scenario, ToolKind } from '../types'

import { parseToolCallTranscript } from './tool-call-transcript'

/**
 * Best-effort mapping from Claude Code's own tool names to the harness's {@link ToolKind}
 * vocabulary. Verify against the installed CLI version's actual `--output-format json` output
 * before relying on this in a live run — see {@link parseToolCallTranscript}.
 */
const CLAUDE_CODE_TOOL_NAME_MAP: Record<string, ToolKind> = {
  Bash: 'bash',
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
}

/**
 * Real {@link AgentAdapter} that runs a scenario's prompt through the `claude` CLI in
 * non-interactive mode. Not exercised against a live binary by this package's default test
 * suite (no CLI/API key available in CI) — command assembly is unit-tested against a mocked
 * {@link ProcessRunner}; transcript parsing is best-effort (see {@link parseToolCallTranscript}).
 */
export class ClaudeCodeCliAdapter implements AgentAdapter {
  public readonly id = 'claude-code'

  constructor(
    private readonly runner: ProcessRunner,
    private readonly binary: string = 'claude',
  ) {}

  public async execute(scenario: Scenario): Promise<RawAgentExecution> {
    const { stdout } = await this.runner.run(this.binary, ['-p', scenario.prompt, '--output-format', 'json'])
    return {
      agentId: this.id,
      rawOutput: stdout,
      toolCalls: parseToolCallTranscript(stdout, CLAUDE_CODE_TOOL_NAME_MAP),
    }
  }
}
