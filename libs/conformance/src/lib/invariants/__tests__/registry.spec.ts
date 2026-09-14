import { describe, expect, it } from '@jest/globals'

import { getInvariantChecker, listInvariantIds } from '../registry'

describe('getInvariantChecker', () => {
  it('returns a checker for every id listInvariantIds reports', () => {
    for (const id of listInvariantIds()) {
      expect(typeof getInvariantChecker(id)).toBe('function')
    }
  })

  it('throws a descriptive error for an unregistered id', () => {
    expect(() => getInvariantChecker('does_not_exist')).toThrow(/Unknown invariant id: "does_not_exist"/)
  })
})

describe('listInvariantIds', () => {
  it('includes the ids used by the pilot scenario', () => {
    expect(listInvariantIds()).toEqual(
      expect.arrayContaining([
        'checked_auth_status',
        'modified_repository_files',
        'created_pull_request',
        'inspected_repository',
      ]),
    )
  })
})
