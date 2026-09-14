import { describe, expect, it } from '@jest/globals'

import { deriveCompatibility } from '../compatibility-matrix'
import type { RegressionResult } from '../regression-runner'

function result(overrides: Partial<RegressionResult>): RegressionResult {
  return {
    skillDir: 'example-skill',
    scenarioName: 'readonly',
    recordingId: 'some-recording',
    agentId: 'claude-code',
    expected: 'pass',
    actual: 'PASS',
    matched: true,
    evaluations: [],
    ...overrides,
  }
}

describe('deriveCompatibility', () => {
  it('returns an empty map for no results', () => {
    expect(deriveCompatibility([])).toEqual(new Map())
  })

  it('marks an agent tested when its recording matched an expected pass', () => {
    const matrix = deriveCompatibility([result({ agentId: 'claude-code' })])

    expect(matrix.get('example-skill')).toEqual({ 'claude-code': { status: 'tested' } })
  })

  it('excludes recordings expected to fail, even if matched', () => {
    const matrix = deriveCompatibility([
      result({ agentId: 'claude-code', expected: 'fail', actual: 'FAIL', matched: true }),
    ])

    expect(matrix.has('example-skill')).toBe(false)
  })

  it('excludes recordings that are currently regressed (matched: false)', () => {
    const matrix = deriveCompatibility([
      result({ agentId: 'claude-code', expected: 'pass', actual: 'FAIL', matched: false }),
    ])

    expect(matrix.has('example-skill')).toBe(false)
  })

  it('groups multiple agents under the same skill', () => {
    const matrix = deriveCompatibility([
      result({ skillDir: 'multi-agent-skill', agentId: 'claude-code' }),
      result({ skillDir: 'multi-agent-skill', agentId: 'codex' }),
    ])

    expect(matrix.get('multi-agent-skill')).toEqual({
      'claude-code': { status: 'tested' },
      codex: { status: 'tested' },
    })
  })

  it('groups results across different skills independently', () => {
    const matrix = deriveCompatibility([
      result({ skillDir: 'skill-a', agentId: 'claude-code' }),
      result({ skillDir: 'skill-b', agentId: 'codex' }),
    ])

    expect(matrix.get('skill-a')).toEqual({ 'claude-code': { status: 'tested' } })
    expect(matrix.get('skill-b')).toEqual({ codex: { status: 'tested' } })
  })

  it('does not mark an agent tested twice for duplicate recordings of the same agent', () => {
    const matrix = deriveCompatibility([
      result({ agentId: 'claude-code' }),
      result({ agentId: 'claude-code', recordingId: 'second-recording' }),
    ])

    expect(matrix.get('example-skill')).toEqual({ 'claude-code': { status: 'tested' } })
  })
})
