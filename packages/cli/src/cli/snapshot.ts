import { exportRegistrySnapshot } from '@tech-leads-club/core'
import chalk from 'chalk'
import { resolve } from 'node:path'

import { ports } from '../ports'

interface SnapshotExportCliOptions {
  output: string
  skill?: string[]
}

export async function runCliSnapshotExport(options: SnapshotExportCliOptions): Promise<void> {
  const outputDir = resolve(options.output)
  const skillNames = options.skill?.length ? options.skill : undefined

  console.log(
    chalk.blue(
      skillNames
        ? `⏳ Exporting ${skillNames.length} skill(s) to ${outputDir}...`
        : `⏳ Exporting the full skills catalog to ${outputDir}...`,
    ),
  )

  try {
    const result = await exportRegistrySnapshot(ports, { outputDir, skills: skillNames })

    if (result.exportedSkills.length > 0) {
      console.log(chalk.green(`\n✅ Exported ${result.exportedSkills.length} skill(s) to ${result.outputDir}`))
    }

    if (result.failedSkills.length > 0) {
      console.log(chalk.red(`\n❌ Failed to export ${result.failedSkills.length} skill(s):`))
      result.failedSkills.forEach((name) => console.log(chalk.dim(`  • ${name}`)))
    }

    console.log(
      chalk.dim(`\nInstall offline with: agent-skills install --registry ${result.outputDir} --skill <name...>`),
    )

    if (result.failedSkills.length > 0) process.exit(1)
  } catch (error) {
    console.error(chalk.red(`❌ ${error instanceof Error ? error.message : String(error)}`))
    process.exit(1)
  }
}
