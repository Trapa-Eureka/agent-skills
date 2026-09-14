import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { loadScenario } from './scenario-loader'
import type { Scenario } from './types'

/** Whether a recorded transcript is expected to evaluate as compliant or violating. */
export type ExpectedVerdict = 'pass' | 'fail'

/**
 * A recorded transcript fixture discovered under a skill's `evals/recordings/` directory,
 * matched to its scenario by filename prefix.
 *
 * @example
 * ```ts
 * // evals/recordings/readonly.compliant-agent.pass.json
 * const recording: EvalRecording = {
 *   path: '/repo/.../evals/recordings/readonly.compliant-agent.pass.json',
 *   recordingId: 'compliant-agent',
 *   expected: 'pass',
 * }
 * ```
 */
export interface EvalRecording {
  /** Absolute path to the recorded `RawAgentExecution` fixture. */
  path: string
  /** Label for the recording, taken from the filename (becomes the mock adapter's id). */
  recordingId: string
  /** Verdict this recording must produce when replayed — a mismatch is a regression. */
  expected: ExpectedVerdict
}

/**
 * One skill's eval scenario, paired with whatever recorded transcripts exist for it.
 */
export interface SkillEvalSuite {
  /** Skill folder name the evals belong to. */
  skillDir: string
  /** Absolute path to the scenario YAML file. */
  scenarioPath: string
  /** Parsed scenario. */
  scenario: Scenario
  /** Recorded transcripts to replay against this scenario; empty when none are authored yet. */
  recordings: EvalRecording[]
}

const RECORDING_FILENAME_PATTERN = /^(.+)\.([^.]+)\.(pass|fail)\.json$/

interface SkillDirEntry {
  name: string
  path: string
}

/**
 * Finds every skill directory (one containing `SKILL.md`) under a catalog root, whether nested
 * one level inside a category folder (`(category)/skill-name/`) or directly at the root
 * ("uncategorized" skills) — mirrors the two layouts `generate-registry.ts` already supports.
 */
function findSkillDirs(catalogRoot: string): SkillDirEntry[] {
  const results: SkillDirEntry[] = []

  for (const entry of readdirSync(catalogRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const entryPath = join(catalogRoot, entry.name)

    if (existsSync(join(entryPath, 'SKILL.md'))) {
      results.push({ name: entry.name, path: entryPath })
      continue
    }

    // Not a skill itself — treat as a category folder and look one level deeper.
    for (const nested of readdirSync(entryPath, { withFileTypes: true })) {
      if (!nested.isDirectory()) continue
      const nestedPath = join(entryPath, nested.name)
      if (existsSync(join(nestedPath, 'SKILL.md'))) {
        results.push({ name: nested.name, path: nestedPath })
      }
    }
  }

  return results
}

function findRecordingsForScenario(recordingsDir: string, scenarioName: string): EvalRecording[] {
  if (!existsSync(recordingsDir)) return []

  const recordings: EvalRecording[] = []
  for (const file of readdirSync(recordingsDir)) {
    const match = file.match(RECORDING_FILENAME_PATTERN)
    if (!match) continue
    const [, prefix, recordingId, expected] = match
    if (prefix !== scenarioName) continue

    recordings.push({ path: join(recordingsDir, file), recordingId, expected: expected as ExpectedVerdict })
  }
  return recordings
}

/**
 * Discovers every skill-authored eval scenario under a skills catalog root, pairing each with
 * its recorded transcripts. Layout expected per skill:
 * `evals/scenarios/<name>.yaml` + optional `evals/recordings/<name>.<recording-id>.<pass|fail>.json`.
 *
 * A scenario with no recordings is still returned (with an empty `recordings` array) — callers
 * decide whether that's worth warning about; discovery itself does not fail on it.
 *
 * @param catalogRoot - Absolute path to a skills catalog directory (e.g. `packages/skills-catalog/skills`).
 * @throws {Error} When a scenario YAML file fails schema validation (see {@link loadScenario}).
 */
export function discoverSkillEvals(catalogRoot: string): SkillEvalSuite[] {
  if (!existsSync(catalogRoot)) return []

  const suites: SkillEvalSuite[] = []

  for (const skill of findSkillDirs(catalogRoot)) {
    const scenariosDir = join(skill.path, 'evals', 'scenarios')
    if (!existsSync(scenariosDir)) continue

    const recordingsDir = join(skill.path, 'evals', 'recordings')

    for (const scenarioFile of readdirSync(scenariosDir)) {
      if (!/\.ya?ml$/.test(scenarioFile)) continue

      const scenarioPath = join(scenariosDir, scenarioFile)
      const scenarioName = scenarioFile.replace(/\.ya?ml$/, '')

      suites.push({
        skillDir: skill.name,
        scenarioPath,
        scenario: loadScenario(scenarioPath),
        recordings: findRecordingsForScenario(recordingsDir, scenarioName),
      })
    }
  }

  return suites
}
