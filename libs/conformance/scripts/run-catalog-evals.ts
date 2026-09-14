#!/usr/bin/env tsx
/**
 * CI entrypoint for TASK 4 (Behavioral Evaluation Framework): discovers every skill-authored
 * eval under a skills catalog and replays its recorded transcripts, failing the run if any
 * recording's actual verdict disagrees with what its filename declares — a regression signal
 * for either the skill's scenario/invariants or the harness's own checker logic.
 *
 * This never invokes a live agent CLI (no API keys/binaries available in CI) — see
 * docs/roadmap/IMPROVEMENT_ROADMAP.md (TASK 4) and libs/conformance/README.md for the design
 * and its deliberate scope limits.
 *
 * Usage: npx tsx libs/conformance/scripts/run-catalog-evals.ts <path-to-skills-catalog>
 */
import { discoverSkillEvals } from '../src/lib/catalog-discovery'
import { runRecordedRegressions } from '../src/lib/regression-runner'

const [, , catalogRoot] = process.argv

if (!catalogRoot) {
  console.error('Usage: run-catalog-evals.ts <path-to-skills-catalog>')
  process.exit(1)
}

const suites = discoverSkillEvals(catalogRoot)

if (suites.length === 0) {
  console.log('ℹ️  No skill evals found under', catalogRoot)
  process.exit(0)
}

let regressionCount = 0
let untestedCount = 0

for (const suite of suites) {
  if (suite.recordings.length === 0) {
    console.log(`⚠️  ${suite.skillDir}: scenario has no recordings — untested`)
    untestedCount += 1
    continue
  }

  const results = await runRecordedRegressions(suite)
  for (const result of results) {
    if (result.matched) {
      console.log(`✅ ${result.skillDir}/${result.recordingId}: ${result.actual} (expected ${result.expected})`)
      continue
    }

    regressionCount += 1
    console.log(
      `❌ ${result.skillDir}/${result.recordingId}: got ${result.actual}, expected ${result.expected.toUpperCase()}`,
    )
    for (const evaluation of result.evaluations) {
      if (!evaluation.upheld) {
        console.log(`     - ${evaluation.kind} "${evaluation.invariantId}" not upheld: ${evaluation.evidence ?? ''}`)
      }
    }
  }
}

console.log('')
console.log(
  `📦 ${suites.length} scenario(s), ${untestedCount} untested (no recordings), ${regressionCount} regression(s)`,
)

process.exit(regressionCount > 0 ? 1 : 0)
