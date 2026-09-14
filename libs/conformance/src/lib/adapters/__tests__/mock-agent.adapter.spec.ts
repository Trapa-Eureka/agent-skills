import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from '@jest/globals'

import { loadTranscriptFixture, MockAgentAdapter } from '../mock-agent.adapter'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, '../../../../fixtures')

describe('loadTranscriptFixture', () => {
  it('reads and validates the compliant fixture', () => {
    const execution = loadTranscriptFixture(join(fixturesDir, 'transcripts/compliant.json'))

    expect(execution.agentId).toBe('mock-compliant')
    expect(execution.toolCalls).toEqual(expect.arrayContaining([{ kind: 'bash', detail: 'gh auth status' }]))
  })

  it('rejects a fixture with an invalid tool call kind', () => {
    const tmpPath = join(fixturesDir, 'transcripts/__invalid_for_test.json')
    writeFileSync(
      tmpPath,
      JSON.stringify({ agentId: 'x', rawOutput: '', toolCalls: [{ kind: 'not-a-kind', detail: '' }] }),
    )

    try {
      expect(() => loadTranscriptFixture(tmpPath)).toThrow()
    } finally {
      rmSync(tmpPath)
    }
  })
})

describe('MockAgentAdapter', () => {
  it('replays the exact execution it was constructed with', async () => {
    const execution = loadTranscriptFixture(join(fixturesDir, 'transcripts/violating.json'))
    const adapter = new MockAgentAdapter('mock-violating', execution)

    const result = await adapter.execute()

    expect(adapter.id).toBe('mock-violating')
    expect(result).toEqual(execution)
  })
})
