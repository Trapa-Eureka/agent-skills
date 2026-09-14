import type { AgentType, InstallOptions, SkillInfo } from '@tech-leads-club/core'
import {
  AGENT_TYPES,
  ensureSkillDownloaded,
  fetchRegistry,
  forceDownloadSkill,
  getRemoteSkills,
  installSkills,
  resolveSkillDependencies,
} from '@tech-leads-club/core'
import chalk from 'chalk'

import { ports } from '../ports'

interface InstallCliOptions {
  skill?: string[]
  agent?: string[]
  global?: boolean
  symlink?: boolean
  force?: boolean
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

  console.log(chalk.blue(`⏳ Loading ${skillNames.length} skill(s) from catalog...`))
  const skills = await downloadSkills(skillNames, options.force || false)

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
