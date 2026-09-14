import type { NormalizedExecution, RawAgentExecution } from './types'

/**
 * Converts an adapter's {@link RawAgentExecution} (already using the common tool-call
 * vocabulary) into the flat {@link NormalizedExecution} shape invariant checkers operate on.
 * This is the one place adapter-specific shapes are collapsed into a uniform structure, so
 * every future invariant checker only needs to reason about one shape.
 */
export function normalizeExecution(raw: RawAgentExecution): NormalizedExecution {
  const commandsRun: string[] = []
  const filesRead: string[] = []
  const filesWritten: string[] = []

  for (const call of raw.toolCalls) {
    switch (call.kind) {
      case 'bash':
        commandsRun.push(call.detail)
        break
      case 'read_file':
        filesRead.push(call.detail)
        break
      case 'write_file':
      case 'edit_file':
        filesWritten.push(call.detail)
        break
      case 'other':
        break
    }
  }

  return {
    agentId: raw.agentId,
    commandsRun,
    filesRead,
    filesWritten,
    rawOutput: raw.rawOutput,
  }
}
