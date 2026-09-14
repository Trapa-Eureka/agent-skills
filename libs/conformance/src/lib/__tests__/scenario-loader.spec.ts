import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from '@jest/globals'

import { loadScenario, parseScenario } from '../scenario-loader'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, '../../../fixtures')

describe('parseScenario', () => {
  it('accepts a well-formed scenario object', () => {
    const scenario = parseScenario({
      skill: 'gh-address-comments',
      prompt: 'Summarize comments without making changes.',
      invariants: { required: ['checked_auth_status'], forbidden: ['modified_repository_files'] },
    })

    expect(scenario.skill).toBe('gh-address-comments')
    expect(scenario.invariants.required).toEqual(['checked_auth_status'])
  })

  it('defaults missing required/forbidden lists to empty arrays', () => {
    const scenario = parseScenario({
      skill: 'gh-address-comments',
      prompt: 'Summarize comments without making changes.',
      invariants: {},
    })

    expect(scenario.invariants.required).toEqual([])
    expect(scenario.invariants.forbidden).toEqual([])
  })

  it('rejects a scenario missing required fields', () => {
    expect(() => parseScenario({ skill: 'gh-address-comments' })).toThrow()
  })

  it('rejects a scenario with the wrong field types', () => {
    expect(() =>
      parseScenario({ skill: 'gh-address-comments', prompt: 'x', invariants: { required: 'not-an-array' } }),
    ).toThrow()
  })
})

describe('loadScenario', () => {
  it('reads and validates the pilot fixture scenario from disk', () => {
    const scenario = loadScenario(join(fixturesDir, 'scenarios/gh-address-comments-readonly.yaml'))

    expect(scenario.skill).toBe('gh-address-comments')
    expect(scenario.invariants.required).toContain('checked_auth_status')
    expect(scenario.invariants.forbidden).toEqual(
      expect.arrayContaining(['modified_repository_files', 'created_pull_request']),
    )
  })
})
