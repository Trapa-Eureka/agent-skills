import { describe, expect, it, jest } from '@jest/globals'

import type { ProcessRunner, ProcessRunnerResult } from '../../ports/process-runner.port'
import type { Scenario } from '../../types'
import { ClaudeCodeCliAdapter } from '../claude-code-cli.adapter'

const scenario: Scenario = {
  skill: 'gh-address-comments',
  prompt: 'Summarize comments without making changes.',
  invariants: { required: [], forbidden: [] },
}

function createRunner(result: ProcessRunnerResult): { runner: ProcessRunner; runMock: jest.Mock } {
  const runMock = jest.fn<ProcessRunner['run']>().mockResolvedValue(result)
  return { runner: { run: runMock }, runMock }
}

describe('ClaudeCodeCliAdapter', () => {
  it('invokes the claude binary with a non-interactive JSON-output command', async () => {
    const { runner, runMock } = createRunner({ stdout: '{}', stderr: '', exitCode: 0 })
    const adapter = new ClaudeCodeCliAdapter(runner)

    await adapter.execute(scenario)

    expect(runMock).toHaveBeenCalledWith('claude', ['-p', scenario.prompt, '--output-format', 'json'])
  })

  it('respects a custom binary override', async () => {
    const { runner, runMock } = createRunner({ stdout: '{}', stderr: '', exitCode: 0 })
    const adapter = new ClaudeCodeCliAdapter(runner, 'claude-canary')

    await adapter.execute(scenario)

    expect(runMock).toHaveBeenCalledWith('claude-canary', expect.any(Array))
  })

  it('parses tool calls from stdout using the Claude Code tool name map', async () => {
    const stdout = JSON.stringify({ tool_calls: [{ name: 'Bash', input: { command: 'gh auth status' } }] })
    const { runner } = createRunner({ stdout, stderr: '', exitCode: 0 })
    const adapter = new ClaudeCodeCliAdapter(runner)

    const result = await adapter.execute(scenario)

    expect(result.agentId).toBe('claude-code')
    expect(result.toolCalls).toEqual([{ kind: 'bash', detail: 'gh auth status' }])
    expect(result.rawOutput).toBe(stdout)
  })
})
