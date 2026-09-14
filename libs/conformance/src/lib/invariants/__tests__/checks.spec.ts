import { describe, expect, it } from '@jest/globals'

import type { NormalizedExecution } from '../../types'
import { checkedAuthStatus, createdPullRequest, inspectedRepository, modifiedRepositoryFiles } from '../checks'

const baseExecution: NormalizedExecution = {
  agentId: 'test-agent',
  commandsRun: [],
  filesRead: [],
  filesWritten: [],
  rawOutput: '',
}

describe('checkedAuthStatus', () => {
  it('observes when commandsRun contains gh auth status', () => {
    const result = checkedAuthStatus({ ...baseExecution, commandsRun: ['gh auth status'] })
    expect(result.observed).toBe(true)
    expect(result.evidence).toContain('gh auth status')
  })

  it('does not observe when commandsRun is empty', () => {
    expect(checkedAuthStatus(baseExecution).observed).toBe(false)
  })
})

describe('modifiedRepositoryFiles', () => {
  it('observes when any file was written', () => {
    const result = modifiedRepositoryFiles({ ...baseExecution, filesWritten: ['src/a.ts'] })
    expect(result.observed).toBe(true)
    expect(result.evidence).toContain('src/a.ts')
  })

  it('does not observe when no files were written', () => {
    expect(modifiedRepositoryFiles(baseExecution).observed).toBe(false)
  })
})

describe('createdPullRequest', () => {
  it('observes when commandsRun contains gh pr create', () => {
    const result = createdPullRequest({ ...baseExecution, commandsRun: ["gh pr create --title 'fix'"] })
    expect(result.observed).toBe(true)
  })

  it('does not observe an unrelated gh command', () => {
    expect(createdPullRequest({ ...baseExecution, commandsRun: ['gh pr view'] }).observed).toBe(false)
  })
})

describe('inspectedRepository', () => {
  it('observes when any file was read', () => {
    const result = inspectedRepository({ ...baseExecution, filesRead: ['SKILL.md'] })
    expect(result.observed).toBe(true)
    expect(result.evidence).toContain('SKILL.md')
  })

  it('does not observe when no files were read', () => {
    expect(inspectedRepository(baseExecution).observed).toBe(false)
  })
})
