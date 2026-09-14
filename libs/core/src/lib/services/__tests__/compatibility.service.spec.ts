import { describe, expect, it } from '@jest/globals'

import type { SkillCompatibility } from '../../types'
import { summarizeCompatibility } from '../compatibility.service'

describe('summarizeCompatibility', () => {
  it('returns an empty list when compatibility is undefined', () => {
    expect(summarizeCompatibility(undefined)).toEqual([])
  })

  it('returns an empty list when compatibility is an empty object', () => {
    expect(summarizeCompatibility({} satisfies SkillCompatibility)).toEqual([])
  })

  it('returns only the tested agents', () => {
    const compatibility: SkillCompatibility = {
      'claude-code': { status: 'tested' },
      codex: { status: 'tested' },
    }

    expect(summarizeCompatibility(compatibility)).toEqual(expect.arrayContaining(['claude-code', 'codex']))
    expect(summarizeCompatibility(compatibility)).toHaveLength(2)
  })
})
