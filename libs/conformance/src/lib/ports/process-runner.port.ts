/**
 * Result of running an external process to completion.
 */
export interface ProcessRunnerResult {
  /** Captured standard output. */
  stdout: string
  /** Captured standard error. */
  stderr: string
  /** Process exit code, or `-1` if it could not be determined. */
  exitCode: number
}

/**
 * Minimal async process execution port used by real agent-CLI adapters, kept separate from
 * `@tech-leads-club/core`'s synchronous `ShellPort` since invoking an agent CLI is long-running
 * and benefits from an argv array (no shell string interpolation) rather than a shell command.
 */
export interface ProcessRunner {
  /**
   * Spawns `command` with `args` and resolves once the process exits.
   *
   * @param command - Executable to run (e.g. `'claude'`, `'codex'`).
   * @param args - Argument vector passed to the process (never shell-interpolated).
   */
  run(command: string, args: string[]): Promise<ProcessRunnerResult>
}
