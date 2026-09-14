import { describe, expect, it } from '@jest/globals'

import { normalizeExecution } from '../normalizer'
import type { RawAgentExecution } from '../types'

describe('normalizeExecution', () => {
  it('splits tool calls into commandsRun/filesRead/filesWritten by kind', () => {
    const raw: RawAgentExecution = {
      agentId: 'test-agent',
      rawOutput: 'raw transcript',
      toolCalls: [
        { kind: 'bash', detail: 'gh auth status' },
        { kind: 'read_file', detail: 'README.md' },
        { kind: 'write_file', detail: 'src/new-file.ts' },
        { kind: 'edit_file', detail: 'src/existing-file.ts' },
        { kind: 'other', detail: 'unclassified action' },
      ],
    }

    const normalized = normalizeExecution(raw)

    expect(normalized.agentId).toBe('test-agent')
    expect(normalized.commandsRun).toEqual(['gh auth status'])
    expect(normalized.filesRead).toEqual(['README.md'])
    expect(normalized.filesWritten).toEqual(['src/new-file.ts', 'src/existing-file.ts'])
    expect(normalized.rawOutput).toBe('raw transcript')
  })

  it('produces empty arrays for an execution with no tool calls', () => {
    const normalized = normalizeExecution({ agentId: 'idle-agent', rawOutput: '', toolCalls: [] })

    expect(normalized.commandsRun).toEqual([])
    expect(normalized.filesRead).toEqual([])
    expect(normalized.filesWritten).toEqual([])
  })
})
