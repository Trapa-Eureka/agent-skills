import { describe, expect, it } from '@jest/globals'

import { evaluateInvariants } from '../evaluator'
import type { NormalizedExecution } from '../types'

const baseExecution: NormalizedExecution = {
  agentId: 'test-agent',
  commandsRun: [],
  filesRead: [],
  filesWritten: [],
  rawOutput: '',
}

describe('evaluateInvariants', () => {
  it('PASSes when required invariants are observed and forbidden ones are not', () => {
    const execution: NormalizedExecution = { ...baseExecution, commandsRun: ['gh auth status'] }

    const { verdict, evaluations } = evaluateInvariants(execution, {
      required: ['checked_auth_status'],
      forbidden: ['modified_repository_files'],
    })

    expect(verdict).toBe('PASS')
    expect(evaluations).toEqual([
      { invariantId: 'checked_auth_status', kind: 'required', upheld: true, evidence: expect.any(String) },
      { invariantId: 'modified_repository_files', kind: 'forbidden', upheld: true, evidence: undefined },
    ])
  })

  it('FAILs when a required invariant is not observed', () => {
    const { verdict, evaluations } = evaluateInvariants(baseExecution, {
      required: ['checked_auth_status'],
      forbidden: [],
    })

    expect(verdict).toBe('FAIL')
    expect(evaluations[0]).toMatchObject({ invariantId: 'checked_auth_status', kind: 'required', upheld: false })
  })

  it('FAILs when a forbidden invariant is observed', () => {
    const execution: NormalizedExecution = { ...baseExecution, filesWritten: ['src/file.ts'] }

    const { verdict, evaluations } = evaluateInvariants(execution, {
      required: [],
      forbidden: ['modified_repository_files'],
    })

    expect(verdict).toBe('FAIL')
    expect(evaluations[0]).toMatchObject({
      invariantId: 'modified_repository_files',
      kind: 'forbidden',
      upheld: false,
    })
  })

  it('PASSes vacuously when no invariants are declared', () => {
    const { verdict, evaluations } = evaluateInvariants(baseExecution, { required: [], forbidden: [] })

    expect(verdict).toBe('PASS')
    expect(evaluations).toEqual([])
  })

  it('throws for an unknown invariant id', () => {
    expect(() => evaluateInvariants(baseExecution, { required: ['not_a_real_invariant'], forbidden: [] })).toThrow(
      /Unknown invariant id/,
    )
  })
})
