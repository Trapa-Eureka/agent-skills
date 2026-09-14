import { describe, expect, it } from '@jest/globals'

import type { ToolKind } from '../../types'
import { parseToolCallTranscript } from '../tool-call-transcript'

const toolNameMap: Record<string, ToolKind> = { Bash: 'bash', Read: 'read_file' }

describe('parseToolCallTranscript', () => {
  it('maps known tool names using the provided map', () => {
    const raw = JSON.stringify({
      tool_calls: [
        { name: 'Bash', input: { command: 'gh auth status' } },
        { name: 'Read', input: { file_path: 'README.md' } },
      ],
    })

    expect(parseToolCallTranscript(raw, toolNameMap)).toEqual([
      { kind: 'bash', detail: 'gh auth status' },
      { kind: 'read_file', detail: 'README.md' },
    ])
  })

  it('drops tool calls whose name is not in the map', () => {
    const raw = JSON.stringify({ tool_calls: [{ name: 'UnknownTool', input: {} }] })
    expect(parseToolCallTranscript(raw, toolNameMap)).toEqual([])
  })

  it('returns an empty list for unparsable JSON instead of throwing', () => {
    expect(parseToolCallTranscript('not json at all', toolNameMap)).toEqual([])
  })

  it('returns an empty list when tool_calls is missing or not an array', () => {
    expect(parseToolCallTranscript(JSON.stringify({ result: 'ok' }), toolNameMap)).toEqual([])
  })

  it('falls back to a JSON-stringified detail when no known input field is present', () => {
    const raw = JSON.stringify({ tool_calls: [{ name: 'Bash', input: { weird: 'shape' } }] })
    expect(parseToolCallTranscript(raw, toolNameMap)).toEqual([{ kind: 'bash', detail: '{"weird":"shape"}' }])
  })
})
