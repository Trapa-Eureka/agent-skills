import type { RawToolCall, ToolKind } from '../types'

interface RawToolCallJson {
  name?: string
  input?: Record<string, unknown>
}

interface RawTranscriptJson {
  tool_calls?: RawToolCallJson[]
}

/**
 * Best-effort parser for a JSON transcript shaped like `{ tool_calls: [{ name, input }] }`, as
 * several agent CLIs' non-interactive JSON output modes emit. The exact schema varies by CLI
 * and version — pass a `toolNameMap` matching the installed binary's actual tool names, and
 * treat an empty result as "could not confidently parse this transcript" rather than as
 * evidence that no tools were used. Never throws: unparsable input yields `[]`.
 *
 * @param rawOutput - Raw stdout captured from the agent CLI.
 * @param toolNameMap - Maps the CLI's own tool names to the harness's {@link ToolKind} vocabulary.
 */
export function parseToolCallTranscript(rawOutput: string, toolNameMap: Record<string, ToolKind>): RawToolCall[] {
  let parsed: RawTranscriptJson
  try {
    parsed = JSON.parse(rawOutput) as RawTranscriptJson
  } catch {
    return []
  }

  if (!Array.isArray(parsed.tool_calls)) {
    return []
  }

  const calls: RawToolCall[] = []
  for (const call of parsed.tool_calls) {
    const kind = call.name ? toolNameMap[call.name] : undefined
    if (!kind) continue
    calls.push({ kind, detail: extractDetail(call.input) })
  }
  return calls
}

function extractDetail(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  if (typeof input['command'] === 'string') return input['command']
  if (typeof input['file_path'] === 'string') return input['file_path']
  if (typeof input['path'] === 'string') return input['path']
  return JSON.stringify(input)
}
