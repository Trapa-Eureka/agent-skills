import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from '@jest/globals'

import { loadTranscriptFixture, MockAgentAdapter } from '../adapters/mock-agent.adapter'
import { runConformance } from '../harness'
import { loadScenario } from '../scenario-loader'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, '../../../fixtures')

const scenario = loadScenario(join(fixturesDir, 'scenarios/gh-address-comments-readonly.yaml'))
const compliantExecution = loadTranscriptFixture(join(fixturesDir, 'transcripts/compliant.json'))
const violatingExecution = loadTranscriptFixture(join(fixturesDir, 'transcripts/violating.json'))

describe('runConformance (TASK 1 acceptance: pilot skill x 2 adapters -> PASS/FAIL/DRIFT report)', () => {
  it('reports PASS with no drift when every adapter complies', async () => {
    const adapters = [
      new MockAgentAdapter('claude-code', compliantExecution),
      new MockAgentAdapter('codex', compliantExecution),
    ]

    const report = await runConformance(scenario, adapters)

    expect(report.scenario).toBe('gh-address-comments')
    expect(report.verdict).toBe('PASS')
    expect(report.results.map((result) => result.verdict)).toEqual(['PASS', 'PASS'])
  })

  it('reports FAIL with no drift when every adapter violates the invariants', async () => {
    const adapters = [
      new MockAgentAdapter('claude-code', violatingExecution),
      new MockAgentAdapter('codex', violatingExecution),
    ]

    const report = await runConformance(scenario, adapters)

    expect(report.verdict).toBe('FAIL')
    expect(report.results.every((result) => result.verdict === 'FAIL')).toBe(true)
    const codexResult = report.results.find((result) => result.agentId === 'codex')
    expect(codexResult?.evaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invariantId: 'checked_auth_status', kind: 'required', upheld: false }),
        expect.objectContaining({ invariantId: 'modified_repository_files', kind: 'forbidden', upheld: false }),
        expect.objectContaining({ invariantId: 'created_pull_request', kind: 'forbidden', upheld: false }),
      ]),
    )
  })

  it('reports DRIFT when adapters disagree on the same scenario', async () => {
    const adapters = [
      new MockAgentAdapter('claude-code', compliantExecution),
      new MockAgentAdapter('codex', violatingExecution),
    ]

    const report = await runConformance(scenario, adapters)

    expect(report.verdict).toBe('DRIFT')
    expect(report.results.find((result) => result.agentId === 'claude-code')?.verdict).toBe('PASS')
    expect(report.results.find((result) => result.agentId === 'codex')?.verdict).toBe('FAIL')
  })

  it('throws when called with no adapters', async () => {
    await expect(runConformance(scenario, [])).rejects.toThrow(/at least one adapter/)
  })
})
