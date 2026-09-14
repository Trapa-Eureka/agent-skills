import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'

import { discoverSkillEvals } from '../catalog-discovery'

const SCENARIO_YAML = `
skill: example-skill
prompt: "Do the thing."
invariants:
  required: [inspected_repository]
  forbidden: [modified_repository_files]
`

function writeSkill(catalogRoot: string, categoryFolder: string | null, skillName: string): string {
  const skillDir = categoryFolder ? join(catalogRoot, categoryFolder, skillName) : join(catalogRoot, skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: ' + skillName + '\n---\n# Skill\n')
  return skillDir
}

describe('discoverSkillEvals', () => {
  let catalogRoot: string

  beforeEach(() => {
    catalogRoot = mkdtempSync(join(tmpdir(), 'conformance-catalog-discovery-'))
  })

  afterEach(() => {
    rmSync(catalogRoot, { recursive: true, force: true })
  })

  it('returns an empty list when the catalog root does not exist', () => {
    expect(discoverSkillEvals(join(catalogRoot, 'does-not-exist'))).toEqual([])
  })

  it('returns an empty list for skills with no evals/scenarios directory', () => {
    writeSkill(catalogRoot, '(quality)', 'no-evals-skill')
    expect(discoverSkillEvals(catalogRoot)).toEqual([])
  })

  it('discovers a scenario under a category folder with no recordings', () => {
    const skillDir = writeSkill(catalogRoot, '(quality)', 'categorized-skill')
    const scenariosDir = join(skillDir, 'evals', 'scenarios')
    mkdirSync(scenariosDir, { recursive: true })
    writeFileSync(join(scenariosDir, 'readonly.yaml'), SCENARIO_YAML)

    const suites = discoverSkillEvals(catalogRoot)

    expect(suites).toHaveLength(1)
    expect(suites[0].skillDir).toBe('categorized-skill')
    expect(suites[0].scenario.skill).toBe('example-skill')
    expect(suites[0].recordings).toEqual([])
  })

  it('discovers an uncategorized skill directly under the catalog root', () => {
    const skillDir = writeSkill(catalogRoot, null, 'uncategorized-skill')
    const scenariosDir = join(skillDir, 'evals', 'scenarios')
    mkdirSync(scenariosDir, { recursive: true })
    writeFileSync(join(scenariosDir, 'readonly.yaml'), SCENARIO_YAML)

    const suites = discoverSkillEvals(catalogRoot)

    expect(suites).toHaveLength(1)
    expect(suites[0].skillDir).toBe('uncategorized-skill')
  })

  it('pairs recordings with their scenario by filename prefix, ignoring unrelated files', () => {
    const skillDir = writeSkill(catalogRoot, '(quality)', 'skill-with-recordings')
    const scenariosDir = join(skillDir, 'evals', 'scenarios')
    const recordingsDir = join(skillDir, 'evals', 'recordings')
    mkdirSync(scenariosDir, { recursive: true })
    mkdirSync(recordingsDir, { recursive: true })
    writeFileSync(join(scenariosDir, 'readonly.yaml'), SCENARIO_YAML)
    writeFileSync(join(recordingsDir, 'readonly.compliant.pass.json'), '{}')
    writeFileSync(join(recordingsDir, 'readonly.violating.fail.json'), '{}')
    // Different scenario prefix and a non-matching filename — must be ignored.
    writeFileSync(join(recordingsDir, 'other-scenario.compliant.pass.json'), '{}')
    writeFileSync(join(recordingsDir, 'README.md'), '# not a recording')

    const suites = discoverSkillEvals(catalogRoot)

    expect(suites).toHaveLength(1)
    expect(suites[0].recordings).toHaveLength(2)
    expect(suites[0].recordings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordingId: 'compliant', expected: 'pass' }),
        expect.objectContaining({ recordingId: 'violating', expected: 'fail' }),
      ]),
    )
  })

  it('throws when a scenario YAML file fails schema validation', () => {
    const skillDir = writeSkill(catalogRoot, '(quality)', 'broken-skill')
    const scenariosDir = join(skillDir, 'evals', 'scenarios')
    mkdirSync(scenariosDir, { recursive: true })
    writeFileSync(join(scenariosDir, 'broken.yaml'), 'skill: only-a-skill-field\n')

    expect(() => discoverSkillEvals(catalogRoot)).toThrow()
  })
})
