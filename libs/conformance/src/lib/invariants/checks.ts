import type { InvariantChecker } from '../types'

/**
 * Observed when the execution ran `gh auth status` (or similar) before acting — used to check
 * that an agent verified authentication rather than assuming it.
 */
export const checkedAuthStatus: InvariantChecker = (execution) => {
  const match = execution.commandsRun.find((cmd) => /\bgh\s+auth\s+status\b/.test(cmd))
  return {
    observed: match !== undefined,
    evidence: match ? `Found in commandsRun: "${match}"` : undefined,
  }
}

/**
 * Observed when the execution wrote or edited any file — used to enforce read-only scenarios.
 */
export const modifiedRepositoryFiles: InvariantChecker = (execution) => {
  const observed = execution.filesWritten.length > 0
  return {
    observed,
    evidence: observed ? `Wrote/edited files: ${execution.filesWritten.join(', ')}` : undefined,
  }
}

/**
 * Observed when the execution ran `gh pr create` — used to enforce scenarios that must stay
 * out of PR-creation scope.
 */
export const createdPullRequest: InvariantChecker = (execution) => {
  const match = execution.commandsRun.find((cmd) => /\bgh\s+pr\s+create\b/.test(cmd))
  return {
    observed: match !== undefined,
    evidence: match ? `Found in commandsRun: "${match}"` : undefined,
  }
}
