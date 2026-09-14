#!/usr/bin/env tsx

import { deriveCompatibility, discoverSkillEvals, runRecordedRegressions } from '@tech-leads-club/conformance'
import { AGENT_TYPES, type AgentType, type SkillCompatibility } from '@tech-leads-club/core'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

import {
  CATEGORY_FOLDER_PATTERN,
  CATEGORY_METADATA_FILE,
  computeSkillBundleHash,
  computeSkillHash,
  getFilesInDirectory,
  parseSkillFrontmatter,
  parseSkillPermissions,
  REGISTRY_SCHEMA_VERSION,
  SKILL_NAME_SLUG_PATTERN,
  toSlug,
  type CategoryMetadata,
  type DeprecatedEntry,
  type SkillMetadata,
  type SkillsRegistry,
} from './utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SKILLS_DIR = join(__dirname, '..', 'skills')
const OUTPUT_FILE = join(__dirname, '..', 'skills-registry.json')
const DEPRECATED_FILE = join(SKILLS_DIR, 'deprecated.yaml')
const AGENT_TYPE_SET: ReadonlySet<string> = new Set(AGENT_TYPES)

/**
 * Runs every skill's recorded behavioral evals (TASK 4) and derives a per-skill compatibility
 * signal from the results (TASK 5), filtered down to recognized {@link AgentType} ids — a
 * recording's `agentId` is free text (see `libs/conformance/README.md`), so an unrecognized
 * value (e.g. this repo's own illustrative `violating-agent` fixture label) is silently dropped
 * here rather than published to the registry.
 */
async function computeCompatibilityBySkill(): Promise<Map<string, SkillCompatibility>> {
  const suites = discoverSkillEvals(SKILLS_DIR)
  const results = (await Promise.all(suites.map((suite) => runRecordedRegressions(suite)))).flat()
  const raw = deriveCompatibility(results)

  const filtered = new Map<string, SkillCompatibility>()
  for (const [skillDir, rawCompatibility] of raw) {
    const compatibility: SkillCompatibility = {}
    for (const [agentId, entry] of Object.entries(rawCompatibility)) {
      if (AGENT_TYPE_SET.has(agentId)) compatibility[agentId as AgentType] = entry
    }
    if (Object.keys(compatibility).length > 0) filtered.set(skillDir, compatibility)
  }
  return filtered
}

function isCategoryFolder(name: string): boolean {
  return CATEGORY_FOLDER_PATTERN.test(name)
}

function extractCategoryId(name: string): string | null {
  const match = name.match(CATEGORY_FOLDER_PATTERN)
  return match ? match[1] : null
}

function loadCategoryMetadata(): Record<string, CategoryMetadata> {
  const metadataPath = join(SKILLS_DIR, CATEGORY_METADATA_FILE)
  if (!existsSync(metadataPath)) return {}

  try {
    const content = readFileSync(metadataPath, 'utf-8')
    const raw = JSON.parse(content)
    const result: Record<string, CategoryMetadata> = {}

    for (const [folder, meta] of Object.entries(raw)) {
      const categoryId = extractCategoryId(folder)
      if (categoryId && meta && typeof meta === 'object') {
        result[categoryId] = meta as CategoryMetadata
      }
    }

    return result
  } catch {
    return {}
  }
}

function scanSkillsInCategory(
  categoryPath: string,
  categoryId: string,
  compatibilityBySkill: Map<string, SkillCompatibility>,
): SkillMetadata[] {
  const skills: SkillMetadata[] = []
  if (!existsSync(categoryPath)) return skills

  const entries = readdirSync(categoryPath, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const skillPath = join(categoryPath, entry.name)
    const skillMdPath = join(skillPath, 'SKILL.md')

    if (!existsSync(skillMdPath)) continue

    const content = readFileSync(skillMdPath, 'utf-8')
    const { name, description, author, version } = parseSkillFrontmatter(content)
    const { permissions, requires } = parseSkillPermissions(content)
    const files = getFilesInDirectory(skillPath)
    const contentHash = computeSkillHash(skillPath, files)
    const bundleHash = computeSkillBundleHash(skillPath, files)
    const relativePath = categoryId === 'uncategorized' ? entry.name : `(${categoryId})/${entry.name}`
    const rawName = name || entry.name
    const skillName = SKILL_NAME_SLUG_PATTERN.test(rawName) ? rawName : toSlug(rawName)
    const compatibility = compatibilityBySkill.get(entry.name)

    if (skillName !== rawName) fixSkillNameInFile(skillMdPath, rawName, skillName)

    skills.push({
      name: skillName,
      description: description || 'No description',
      category: categoryId,
      path: relativePath,
      files,
      author,
      version,
      contentHash,
      bundleHash,
      ...(permissions ? { permissions } : {}),
      ...(requires ? { requires } : {}),
      ...(compatibility ? { compatibility } : {}),
    })
  }

  return skills
}

function loadDeprecatedSkills(): DeprecatedEntry[] {
  if (!existsSync(DEPRECATED_FILE)) return []

  try {
    const content = readFileSync(DEPRECATED_FILE, 'utf-8')
    const parsed = YAML.parse(content)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((entry: unknown) => entry && typeof entry === 'object' && 'name' in entry && 'message' in entry)
      .map((entry: { name: string; message: string; alternatives?: string[] }) => ({
        name: entry.name,
        message: entry.message,
        ...(entry.alternatives?.length ? { alternatives: entry.alternatives } : {}),
      }))
  } catch {
    console.warn(`⚠️  Failed to parse ${DEPRECATED_FILE}, skipping deprecated entries`)
    return []
  }
}

async function generateRegistry(): Promise<SkillsRegistry> {
  const skills: SkillMetadata[] = []
  const categories = loadCategoryMetadata()
  const deprecated = loadDeprecatedSkills()
  const compatibilityBySkill = await computeCompatibilityBySkill()

  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    if (isCategoryFolder(entry.name)) {
      const categoryId = extractCategoryId(entry.name)
      if (categoryId) {
        const categoryPath = join(SKILLS_DIR, entry.name)
        const categorySkills = scanSkillsInCategory(categoryPath, categoryId, compatibilityBySkill)
        skills.push(...categorySkills)

        // Ensure category exists in metadata
        if (!categories[categoryId]) {
          categories[categoryId] = {
            name: categoryId.charAt(0).toUpperCase() + categoryId.slice(1),
          }
        }
      }
    } else {
      // Uncategorized skill at root — reuse scanSkillsInCategory with 'uncategorized'
      const skillDir = join(SKILLS_DIR, entry.name)
      if (existsSync(join(skillDir, 'SKILL.md'))) {
        skills.push(...scanSkillsInCategory(skillDir, 'uncategorized', compatibilityBySkill))
      }
    }
  }

  // Ensure uncategorized exists
  if (!categories['uncategorized']) {
    categories['uncategorized'] = {
      name: 'Uncategorized',
      description: 'Skills without a specific category',
    }
  }

  return {
    version: '1.0.0',
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    categories,
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
    ...(deprecated.length > 0 ? { deprecated } : {}),
  }
}

function fixSkillNameInFile(skillMdPath: string, rawName: string, slugName: string): void {
  const content = readFileSync(skillMdPath, 'utf-8')
  const updated = content.replace(/^(name:\s*)(.+)$/m, `$1${slugName}`)
  writeFileSync(skillMdPath, updated, 'utf-8')
  console.log(`✏️  Auto-fixed skill name in ${skillMdPath}`)
  console.log(`   "${rawName}" → "${slugName}"`)
}

// Main execution
const registry = await generateRegistry()
writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2))

console.log(`✅ Generated skills-registry.json`)
console.log(`   📦 ${registry.skills.length} skills`)
console.log(`   📁 ${Object.keys(registry.categories).length} categories`)
if (registry.deprecated?.length) console.log(`   ⚠️  ${registry.deprecated.length} deprecated`)
console.log(`   📍 ${OUTPUT_FILE}`)
