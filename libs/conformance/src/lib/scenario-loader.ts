import { readFileSync } from 'node:fs'

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

import type { Scenario } from './types'

const ScenarioSchema = z.object({
  skill: z.string(),
  prompt: z.string(),
  invariants: z.object({
    required: z.array(z.string()).default([]),
    forbidden: z.array(z.string()).default([]),
  }),
})

/**
 * Validates and normalizes an already-parsed scenario object (e.g. from `yaml.parse`).
 *
 * @param raw - Parsed scenario data.
 * @throws {z.ZodError} When `raw` does not match the scenario schema.
 */
export function parseScenario(raw: unknown): Scenario {
  return ScenarioSchema.parse(raw)
}

/**
 * Reads and validates a scenario YAML file from disk.
 *
 * @param path - Path to a scenario YAML file, e.g. one under `fixtures/scenarios/`.
 */
export function loadScenario(path: string): Scenario {
  const contents = readFileSync(path, 'utf-8')
  return parseScenario(parseYaml(contents))
}
