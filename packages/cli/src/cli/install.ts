import type { AgentType, InstallOptions, SkillInfo } from '@tech-leads-club/core'
import {
  AGENT_TYPES,
  ensureSkillDownloaded,
  fetchRegistry,
  forceDownloadSkill,
  getRemoteSkills,
  installSkillFromSnapshot,
  installSkills,
  readSnapshotRegistry,
  resolveSkillDependencies,
} from '@tech-leads-club/core'
import chalk from 'chalk'
import { resolve } from 'node:path'

import { ports } from '../ports'

interface InstallCliOptions {
  skill?: string[]
  agent?: string[]
  global?: boolean
  symlink?: boolean
  force?: boolean
  registry?: string
}

async function downloadSkills(skillNames: string[], forceDownload: boolean): Promise<SkillInfo[]> {
  // Bypass the 24h registry TTL so re-install can see newly published content hashes.
  await fetchRegistry(ports, true)
  const allSkills = await getRemoteSkills(ports)

  const resolution = resolveSkillDependencies(allSkills, skillNames)
  for (const missingName of resolution.missing) {
    console.error(chalk.red(`❌ Skill "${missingName}" not found`))
  }
  for (const cycle of resolution.cycles) {
    console.warn(chalk.yellow(`⚠️  Circular skill dependency ignored: ${cycle.join(' → ')}`))
  }
  if (resolution.autoIncluded.length > 0) {
    console.log(
      chalk.dim(`  + ${resolution.autoIncluded.length} dependency skill(s) added automatically: `) +
        chalk.dim(resolution.autoIncluded.join(', ')),
    )
  }

  const selectedSkills: SkillInfo[] = []

  for (const skill of resolution.resolved) {
    const path = forceDownload
      ? await forceDownloadSkill(ports, skill.name)
      : await ensureSkillDownloaded(ports, skill.name)
    if (path) {
      selectedSkills.push({ ...skill, path })
    } else {
      console.error(chalk.red(`❌ Failed to download skill "${skill.name}"`))
    }
  }

  return selectedSkills
}

/**
 * Same shape as {@link downloadSkills}, but sources both the registry and every skill's files
 * from a local snapshot directory (see `agent-skills snapshot export`, TASK 8) instead of the
 * CDN — no network access at all.
 */
async function downloadSkillsFromSnapshot(
  skillNames: string[],
  registryPath: string,
): Promise<{ skills: SkillInfo[]; registryFound: boolean }> {
  const registry = readSnapshotRegistry(ports, registryPath)
  if (!registry) return { skills: [], registryFound: false }

  const allSkills: SkillInfo[] = registry.skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    path: '',
    category: skill.category,
    ...(skill.permissions ? { permissions: skill.permissions } : {}),
    ...(skill.requires ? { requires: skill.requires } : {}),
  }))

  const resolution = resolveSkillDependencies(allSkills, skillNames)
  for (const missingName of resolution.missing) {
    console.error(chalk.red(`❌ Skill "${missingName}" not found in snapshot`))
  }
  for (const cycle of resolution.cycles) {
    console.warn(chalk.yellow(`⚠️  Circular skill dependency ignored: ${cycle.join(' → ')}`))
  }
  if (resolution.autoIncluded.length > 0) {
    console.log(
      chalk.dim(`  + ${resolution.autoIncluded.length} dependency skill(s) added automatically: `) +
        chalk.dim(resolution.autoIncluded.join(', ')),
    )
  }

  const skills: SkillInfo[] = []
  for (const skill of resolution.resolved) {
    const metadata = registry.skills.find((s) => s.name === skill.name)
    const path = metadata ? await installSkillFromSnapshot(ports, metadata, registryPath) : null
    if (path) {
      skills.push({ ...skill, path })
    } else {
      console.error(chalk.red(`❌ Failed to install skill "${skill.name}" from snapshot (missing files?)`))
    }
  }

  return { skills, registryFound: true }
}

function showInstallResults(results: Awaited<ReturnType<typeof installSkills>>): void {
  const successful = results.filter((r) => r.success)
  const failed = results.filter((r) => !r.success)

  if (successful.length > 0) {
    console.log(chalk.green(`\n✅ Successfully installed ${successful.length} skill(s):`))
    successful.forEach((r) => {
      console.log(chalk.dim(`  • ${r.skill} → ${r.agent} (${r.method})`))
    })
  }

  if (failed.length > 0) {
    console.log(chalk.red(`\n❌ Failed to install ${failed.length} skill(s):`))
    failed.forEach((r) => {
      console.log(chalk.dim(`  • ${r.skill} → ${r.agent}: ${r.error}`))
    })
  }
}

export async function runCliInstall(options: InstallCliOptions): Promise<void> {
  if (!options.skill || options.skill.length === 0) {
    console.error(chalk.red('❌ --skill is required in CLI mode'))
    console.error(
      chalk.dim('Usage: agent-skills install --skill <name1> [name2...] [--agent <agents...>] [--global] [--symlink]'),
    )
    process.exit(1)
  }

  const skillNames = Array.isArray(options.skill) ? options.skill : [options.skill]

  let skills: SkillInfo[]
  if (options.registry) {
    const registryPath = resolve(options.registry)
    console.log(chalk.blue(`⏳ Loading ${skillNames.length} skill(s) from snapshot at ${registryPath}...`))
    const result = await downloadSkillsFromSnapshot(skillNames, registryPath)
    if (!result.registryFound) {
      console.error(
        chalk.red(`❌ No valid registry snapshot found at "${registryPath}" (expected skills-registry.json)`),
      )
      console.error(chalk.dim('   Create one with: agent-skills snapshot export --output <dir>'))
      process.exit(1)
    }
    skills = result.skills
  } else {
    console.log(chalk.blue(`⏳ Loading ${skillNames.length} skill(s) from catalog...`))
    skills = await downloadSkills(skillNames, options.force || false)
  }

  if (skills.length === 0) {
    console.error(chalk.red('❌ No skills were successfully downloaded'))
    process.exit(1)
  }

  const rawAgents = options.agent || ['cursor', 'claude-code', 'windsurf']
  const invalidAgents = rawAgents.filter((a) => !AGENT_TYPES.includes(a as AgentType))
  if (invalidAgents.length > 0) {
    console.error(chalk.red(`❌ Unknown agent(s): ${invalidAgents.join(', ')}`))
    console.error(chalk.dim(`   Valid agents: ${AGENT_TYPES.join(', ')}`))
    process.exit(1)
  }
  const agents = rawAgents as AgentType[]
  const method = options.symlink ? 'symlink' : 'copy'

  console.log(chalk.blue(`⏳ Installing ${skills.length} skill(s) to ${agents.length} agent(s)...`))

  const installOptions: InstallOptions = {
    agents,
    skills: skills.map((s) => s.name),
    method,
    global: options.global || false,
  }

  const results = await installSkills(ports, skills, installOptions)
  showInstallResults(results)

  if (results.some((r) => !r.success)) {
    process.exit(1)
  }
}
