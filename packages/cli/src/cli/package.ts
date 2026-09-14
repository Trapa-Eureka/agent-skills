import { createSkillBundle, ensureSkillDownloaded, getSkillCachePath, getSkillMetadata } from '@tech-leads-club/core'
import chalk from 'chalk'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { ports } from '../ports'

interface PackageCliOptions {
  output?: string
}

export async function runCliPackage(skillName: string, options: PackageCliOptions): Promise<void> {
  const metadata = await getSkillMetadata(ports, skillName)
  if (!metadata) {
    console.error(chalk.red(`❌ Skill "${skillName}" not found in the registry`))
    process.exit(1)
  }

  console.log(chalk.blue(`⏳ Downloading "${skillName}"...`))
  const cachePath = await ensureSkillDownloaded(ports, skillName)
  if (!cachePath) {
    console.error(chalk.red(`❌ Failed to download skill "${skillName}"`))
    process.exit(1)
  }

  const result = await createSkillBundle(ports, metadata, getSkillCachePath(ports, skillName))
  if (!result) {
    console.error(chalk.red(`❌ Failed to build bundle for "${skillName}" (incomplete download?)`))
    process.exit(1)
  }

  const outputPath = resolve(options.output || `${skillName}.tar`)
  await writeFile(outputPath, result.bundle)

  console.log(chalk.green(`\n✅ Wrote ${outputPath}`))
  console.log(chalk.dim(`   Bundle hash: ${result.hash}`))

  if (metadata.bundleHash) {
    if (metadata.bundleHash === result.hash) {
      console.log(chalk.green('   ✓ Matches the published bundle hash — this build is reproducible.'))
    } else {
      console.log(
        chalk.red(
          `   ❌ MISMATCH — registry publishes ${metadata.bundleHash}, but this build produced ${result.hash}.`,
        ),
      )
      process.exit(1)
    }
  } else {
    console.log(chalk.dim('   (Registry has no published bundleHash to compare against.)'))
  }
}
