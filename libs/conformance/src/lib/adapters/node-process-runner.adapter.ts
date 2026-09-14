import { spawn } from 'node:child_process'

import type { ProcessRunner, ProcessRunnerResult } from '../ports/process-runner.port'

/**
 * Node.js implementation of {@link ProcessRunner} using `child_process.spawn`, with `shell:
 * false` so `args` are passed as an argv array rather than shell-interpolated.
 */
export class NodeProcessRunnerAdapter implements ProcessRunner {
  /**
   * @inheritdoc
   */
  public run(command: string, args: string[]): Promise<ProcessRunnerResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { shell: false })
      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode: exitCode ?? -1 })
      })
    })
  }
}
