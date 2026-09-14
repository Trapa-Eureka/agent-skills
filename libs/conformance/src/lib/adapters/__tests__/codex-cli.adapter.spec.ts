import { describe, expect, it, jest } from '@jest/globals'

import type { ProcessRunner, ProcessRunnerResult } from '../../ports/process-runner.port'
import type { Scenario } from '../../types'
import { CodexCliAdapter } from '../codex-cli.adapter'

const scenario: Scenario = {
  skill: 'gh-address-comments',
  prompt: 'Summarize comments without making changes.',
  invariants: { required: [], forbidden: [] },
}

function createRunner(result: ProcessRunnerResult): { runner: ProcessRunner; runMock: jest.Mock } {
  const runMock = jest.fn<ProcessRunner['run']>().mockResolvedValue(result)
  return { runner: { run: runMock }, runMock }
}

describe('CodexCliAdapter', () => {
  it('invokes the codex binary in non-interactive exec mode', async () => {
    const { runner, runMock } = createRunner({ stdout: '{}', stderr: '', exitCode: 0 })
    const adapter = new CodexCliAdapter(runner)

    await adapter.execute(scenario)

    expect(runMock).toHaveBeenCalledWith('codex', ['exec', scenario.prompt, '--json'])
  })

  it('respects a custom binary override', async () => {
    const { runner, runMock } = createRunner({ stdout: '{}', stderr: '', exitCode: 0 })
    const adapter = new CodexCliAdapter(runner, 'codex-canary')

    await adapter.execute(scenario)

    expect(runMock).toHaveBeenCalledWith('codex-canary', expect.any(Array))
  })

  it('parses tool calls from stdout using the Codex tool name map', async () => {
    const stdout = JSON.stringify({ tool_calls: [{ name: 'shell', input: { command: 'gh pr create' } }] })
    const { runner } = createRunner({ stdout, stderr: '', exitCode: 0 })
    const adapter = new CodexCliAdapter(runner)

    const result = await adapter.execute(scenario)

    expect(result.agentId).toBe('codex')
    expect(result.toolCalls).toEqual([{ kind: 'bash', detail: 'gh pr create' }])
  })
})
