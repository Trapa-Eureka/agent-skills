import type { InvariantChecker } from '../types'

import { checkedAuthStatus, createdPullRequest, modifiedRepositoryFiles } from './checks'

/**
 * All invariant ids the harness knows how to check, keyed by the id used in scenario YAML files.
 * Add new checkers here as new scenarios need them.
 */
const INVARIANT_CHECKERS: Record<string, InvariantChecker> = {
  checked_auth_status: checkedAuthStatus,
  modified_repository_files: modifiedRepositoryFiles,
  created_pull_request: createdPullRequest,
}

/**
 * Looks up the checker for an invariant id.
 *
 * @param invariantId - Invariant id as declared in a scenario's `required`/`forbidden` list.
 * @throws {Error} When no checker is registered for `invariantId`.
 */
export function getInvariantChecker(invariantId: string): InvariantChecker {
  const checker = INVARIANT_CHECKERS[invariantId]
  if (!checker) {
    const known = Object.keys(INVARIANT_CHECKERS).join(', ')
    throw new Error(`Unknown invariant id: "${invariantId}". Registered invariants: ${known}`)
  }
  return checker
}

/**
 * Lists every invariant id currently registered.
 */
export function listInvariantIds(): string[] {
  return Object.keys(INVARIANT_CHECKERS)
}
