import { describe, expect, it } from '@jest/globals'

import { NodeProcessRunnerAdapter } from '../node-process-runner.adapter'

describe('NodeProcessRunnerAdapter', () => {
  it('runs a process and captures stdout and exit code', async () => {
    const adapter = new NodeProcessRunnerAdapter()

    const result = await adapter.run('node', ['-e', "process.stdout.write('hello')"])

    expect(result.stdout).toBe('hello')
    expect(result.exitCode).toBe(0)
  })

  it('captures stderr and a non-zero exit code', async () => {
    const adapter = new NodeProcessRunnerAdapter()

    const result = await adapter.run('node', ['-e', "process.stderr.write('boom'); process.exit(2)"])

    expect(result.stderr).toBe('boom')
    expect(result.exitCode).toBe(2)
  })
})
