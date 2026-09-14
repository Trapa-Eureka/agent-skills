import { describe, expect, it } from '@jest/globals'

import type { SkillPermissions, SkillRequirements } from '../../types'
import { summarizeMcpRequirements, summarizePermissions } from '../permissions.service'

describe('summarizePermissions', () => {
  it('marks every line unspecified when no permissions are declared', () => {
    const lines = summarizePermissions(undefined)

    expect(lines).toHaveLength(6)
    expect(lines.every((line) => line.state === 'unspecified')).toBe(true)
  })

  it('reports granted/denied per declared field and unspecified for omitted ones', () => {
    const permissions: SkillPermissions = {
      filesystem: { read: true, write: false },
      shell: { enabled: true },
      // network intentionally omitted
      git: { read: false, write: false },
    }

    const lines = summarizePermissions(permissions)

    expect(lines).toEqual([
      { label: 'Read files', state: 'granted' },
      { label: 'Write files', state: 'denied' },
      { label: 'Shell commands', state: 'granted' },
      { label: 'Network access', state: 'unspecified' },
      { label: 'Read git history', state: 'denied' },
      { label: 'Write git history', state: 'denied' },
    ])
  })
})

describe('summarizeMcpRequirements', () => {
  it('returns an empty list when requires is undefined', () => {
    expect(summarizeMcpRequirements(undefined)).toEqual([])
  })

  it('returns an empty list when requires.mcp is undefined', () => {
    expect(summarizeMcpRequirements({} satisfies SkillRequirements)).toEqual([])
  })

  it('returns the declared MCP server names', () => {
    expect(summarizeMcpRequirements({ mcp: ['context7', 'figma'] })).toEqual(['context7', 'figma'])
  })
})
