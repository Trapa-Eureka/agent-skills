import { loadTranscriptFixture, MockAgentAdapter } from './adapters/mock-agent.adapter'
import type { ExpectedVerdict, SkillEvalSuite } from './catalog-discovery'
import { runConformance } from './harness'
import type { AdapterResult, ConformanceReport } from './types'

/**
 * Outcome of replaying one recorded transcript against its scenario: whether the actual verdict
 * matched the verdict encoded in the recording's filename.
 */
export interface RegressionResult {
  /** Skill folder the recording belongs to. */
  skillDir: string
  /** Scenario file name (without extension) the recording was replayed against. */
  scenarioName: string
  /** Recording label, from the filename. */
  recordingId: string
  /** The recorded transcript's own `agentId` field — the compatibility-matrix signal (TASK 5). */
  agentId: string
  /** Verdict the filename declares this recording must produce. */
  expected: ExpectedVerdict
  /** Verdict the harness actually produced for this replay. */
  actual: 'PASS' | 'FAIL'
  /** `true` when `actual` matches `expected` — `false` is a regression. */
  matched: boolean
  /** Per-invariant detail from the replay, for diagnosing a mismatch. */
  evaluations: AdapterResult['evaluations']
}

function toExpectedVerdict(verdict: 'PASS' | 'FAIL'): ExpectedVerdict {
  return verdict === 'PASS' ? 'pass' : 'fail'
}

/**
 * Replays every recording in a {@link SkillEvalSuite} through {@link runConformance} (one
 * recording at a time, via a single {@link MockAgentAdapter}) and checks whether the resulting
 * verdict matches what the recording's filename declares it should be.
 *
 * A suite with no recordings yields an empty result list — callers decide whether that's worth
 * flagging; this function only reports on recordings that actually exist.
 *
 * @param suite - Scenario + recordings discovered by {@link discoverSkillEvals}.
 */
export async function runRecordedRegressions(suite: SkillEvalSuite): Promise<RegressionResult[]> {
  const results: RegressionResult[] = []
  const scenarioName = suite.scenarioPath
    .split('/')
    .pop()!
    .replace(/\.ya?ml$/, '')

  for (const recording of suite.recordings) {
    const execution = loadTranscriptFixture(recording.path)
    const adapter = new MockAgentAdapter(recording.recordingId, execution)
    const report: ConformanceReport = await runConformance(suite.scenario, [adapter])
    const [result] = report.results
    const actual = result.verdict

    results.push({
      skillDir: suite.skillDir,
      scenarioName,
      recordingId: recording.recordingId,
      agentId: execution.agentId,
      expected: recording.expected,
      actual,
      matched: toExpectedVerdict(actual) === recording.expected,
      evaluations: result.evaluations,
    })
  }

  return results
}
