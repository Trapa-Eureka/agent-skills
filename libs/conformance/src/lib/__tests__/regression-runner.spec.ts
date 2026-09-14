import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from '@jest/globals'

import type { SkillEvalSuite } from '../catalog-discovery'
import { runRecordedRegressions } from '../regression-runner'
import { loadScenario } from '../scenario-loader'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, '../../../fixtures')

const scenario = loadScenario(join(fixturesDir, 'scenarios/gh-address-comments-readonly.yaml'))
const scenarioPath = join(fixturesDir, 'scenarios/gh-address-comments-readonly.yaml')
const compliantPath = join(fixturesDir, 'transcripts/compliant.json')
const violatingPath = join(fixturesDir, 'transcripts/violating.json')

describe('runRecordedRegressions', () => {
  it('returns an empty list for a suite with no recordings', async () => {
    const suite: SkillEvalSuite = { skillDir: 'gh-address-comments', scenarioPath, scenario, recordings: [] }
    expect(await runRecordedRegressions(suite)).toEqual([])
  })

  it('matches when every recording produces its declared expected verdict', async () => {
    const suite: SkillEvalSuite = {
      skillDir: 'gh-address-comments',
      scenarioPath,
      scenario,
      recordings: [
        { path: compliantPath, recordingId: 'compliant-agent', expected: 'pass' },
        { path: violatingPath, recordingId: 'violating-agent', expected: 'fail' },
      ],
    }

    const results = await runRecordedRegressions(suite)

    expect(results).toHaveLength(2)
    expect(results.every((result) => result.matched)).toBe(true)
    expect(results.find((r) => r.recordingId === 'compliant-agent')?.actual).toBe('PASS')
    expect(results.find((r) => r.recordingId === 'violating-agent')?.actual).toBe('FAIL')
    // agentId comes from the recorded transcript's own field, not the filename-derived recordingId.
    expect(results.find((r) => r.recordingId === 'compliant-agent')?.agentId).toBe('mock-compliant')
    expect(results.find((r) => r.recordingId === 'violating-agent')?.agentId).toBe('mock-violating')
  })

  it('flags a mismatch as a regression when the actual verdict disagrees with the filename', async () => {
    const suite: SkillEvalSuite = {
      skillDir: 'gh-address-comments',
      scenarioPath,
      scenario,
      // Wrong on purpose: the compliant transcript actually evaluates to PASS, not FAIL.
      recordings: [{ path: compliantPath, recordingId: 'compliant-agent', expected: 'fail' }],
    }

    const [result] = await runRecordedRegressions(suite)

    expect(result.matched).toBe(false)
    expect(result.expected).toBe('fail')
    expect(result.actual).toBe('PASS')
    expect(result.evaluations.length).toBeGreaterThan(0)
  })
})
