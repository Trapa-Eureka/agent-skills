import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, dirname, join } from 'path'
import { parse as parseYaml } from 'yaml'

interface Check {
  name: string
  passed: boolean
  message: string
  severity: 'error' | 'warning'
}

interface ValidationResult {
  path: string
  checks: Check[]
  passed: number
  failed: number
  warnings: number
  summary?: string
  /** Names from a well-formed `requires.skills` list, used by {@link validateSkillDependencyGraph}. */
  requiresSkills?: string[]
}

function validateSkill(skillPath: string): ValidationResult {
  const results: ValidationResult = {
    path: skillPath,
    checks: [],
    passed: 0,
    failed: 0,
    warnings: 0,
  }

  function addCheck(name: string, passed: boolean, message: string, severity: 'error' | 'warning' = 'error') {
    results.checks.push({ name, passed, message, severity })
    if (passed) {
      results.passed++
    } else if (severity === 'warning') {
      results.warnings++
    } else {
      results.failed++
    }
  }

  // --- Check 1: Folder exists ---
  if (!existsSync(skillPath) || !statSync(skillPath).isDirectory()) {
    addCheck('folder_exists', false, `Path is not a directory: ${skillPath}`)
    results.summary = 'FAIL — folder not found'
    return results
  }
  addCheck('folder_exists', true, 'Skill folder exists')

  // --- Check 2: Folder name is kebab-case ---
  const folderName = basename(skillPath)
  const kebabPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
  const isKebab = kebabPattern.test(folderName)
  addCheck('folder_kebab_case', isKebab, `Folder name '${folderName}' ${isKebab ? 'is' : 'is NOT'} kebab-case`)

  // --- Check 3: SKILL.md exists (exact casing) ---
  const entries = readdirSync(skillPath)
  const hasSkillMd = entries.includes('SKILL.md')
  addCheck('skill_md_exists', hasSkillMd, hasSkillMd ? 'SKILL.md exists' : 'SKILL.md not found (case-sensitive)')

  const wrongCasings = entries.filter((e) => e.toLowerCase() === 'skill.md' && e !== 'SKILL.md')
  if (wrongCasings.length > 0) {
    addCheck('skill_md_casing', false, `Found wrong casing: ${wrongCasings[0]} (must be exactly SKILL.md)`)
  }

  if (!hasSkillMd) {
    results.summary = 'FAIL — SKILL.md not found'
    return results
  }

  // --- Check 4: No README.md ---
  const hasReadme = entries.some((e) => e.toLowerCase() === 'readme.md')
  addCheck(
    'no_readme',
    !hasReadme,
    !hasReadme
      ? 'No README.md in skill folder'
      : 'README.md found — "Skills are for agents, not humans." No README.md inside the skill folder. No onboarding documentation. Write for an LLM that needs clear, actionable instructions.',
    'warning',
  )

  // --- Check 5: Parse frontmatter ---
  const skillPathFull = join(skillPath, 'SKILL.md')
  const content = readFileSync(skillPathFull, 'utf-8')

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  if (!fmMatch) {
    addCheck('frontmatter_delimiters', false, 'Missing or malformed --- delimiters in frontmatter')
    results.summary = 'FAIL — frontmatter parse error'
    return results
  }
  addCheck('frontmatter_delimiters', true, 'YAML frontmatter delimiters present')

  const fmRaw = fmMatch[1]
  let fm: Record<string, unknown>

  try {
    const parsed = parseYaml(fmRaw)
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Frontmatter is not a YAML mapping')
    }
    fm = parsed as Record<string, unknown>
    addCheck('frontmatter_valid_yaml', true, 'Frontmatter is valid YAML')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    addCheck('frontmatter_valid_yaml', false, `YAML parse error: ${msg}`)
    results.summary = 'FAIL — YAML parse error'
    return results
  }

  // --- Check 6: name field ---
  const name = fm.name
  if (!name) {
    addCheck('name_present', false, "Missing 'name' field in frontmatter")
  } else {
    addCheck('name_present', true, `name: ${name}`)
    const isNameKebab = kebabPattern.test(String(name))
    addCheck('name_kebab_case', isNameKebab, `name '${name}' ${isNameKebab ? 'is' : 'is NOT'} kebab-case`)

    const nameLower = String(name).toLowerCase()
    const hasReserved = nameLower.includes('claude') || nameLower.includes('anthropic')
    addCheck(
      'name_not_reserved',
      !hasReserved,
      !hasReserved ? 'Name does not use reserved terms' : "Name contains 'claude' or 'anthropic' (reserved)",
    )

    const namesMatch = String(name) === folderName
    addCheck(
      'name_matches_folder',
      namesMatch,
      namesMatch
        ? `name '${name}' matches folder '${folderName}'`
        : `name '${name}' does NOT match folder '${folderName}'`,
      'warning',
    )
  }

  // --- Check 7: description field ---
  const desc = fm.description
  if (!desc) {
    addCheck('description_present', false, "Missing 'description' field in frontmatter")
  } else {
    const descStr = String(desc).trim()
    addCheck('description_present', true, `description present (${descStr.length} chars)`)

    const descOkLength = descStr.length <= 1024
    addCheck('description_length', descOkLength, `Description length: ${descStr.length}/1024 chars`)

    const hasXml = descStr.includes('<') || descStr.includes('>')
    addCheck(
      'description_no_xml',
      !hasXml,
      !hasXml ? 'No XML brackets in description' : 'XML angle brackets found in description (forbidden)',
    )

    // Trigger phrase check
    const triggerKeywords = ['use when', 'use for', 'use this', 'trigger', 'ask for', 'asks to', 'says', 'mentions']
    const descLower = descStr.toLowerCase()
    const hasTriggers = triggerKeywords.some((kw) => descLower.includes(kw))
    addCheck(
      'description_has_triggers',
      hasTriggers,
      hasTriggers
        ? 'Description includes trigger guidance'
        : "Missing trigger phrases — add 'Use when...' guidance (mandatory per CONTRIBUTING.md)",
    )

    // Negative scope check
    const negativeKeywords = ['do not use', "don't use", 'not for', 'not intended for']
    const hasNegativeScope = negativeKeywords.some((kw) => descLower.includes(kw))
    addCheck(
      'description_has_negative_scope',
      hasNegativeScope,
      hasNegativeScope
        ? 'Description includes negative scope'
        : "Missing negative scope — add 'Do NOT use for...' guidance (mandatory per CONTRIBUTING.md)",
    )
  }

  // --- Check 7b: metadata field ---
  const metadata = fm.metadata as Record<string, unknown> | undefined
  if (!metadata || typeof metadata !== 'object') {
    addCheck(
      'metadata_present',
      false,
      "Missing 'metadata' field in frontmatter (expected metadata.version and metadata.author)",
      'warning',
    )
  } else {
    addCheck('metadata_present', true, 'metadata field present')

    const metaVersion = metadata.version
    const hasVersion = !!metaVersion
    addCheck(
      'metadata_version',
      hasVersion,
      hasVersion ? `metadata.version: ${metaVersion}` : 'Missing metadata.version',
      'warning',
    )

    const metaAuthor = metadata.author || metadata.original_author
    const hasAuthor = !!metaAuthor
    addCheck(
      'metadata_author',
      hasAuthor,
      hasAuthor ? `metadata.author: ${metaAuthor}` : 'Missing metadata.author',
      'warning',
    )
  }

  const body = content.substring(content.indexOf(fmMatch[0]) + fmMatch[0].length)

  // --- Check 7c: permissions / requires manifest (optional, backward compatible) ---
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
  const isOptionalBoolean = (value: unknown): boolean => value === undefined || typeof value === 'boolean'

  const permissions = fm.permissions
  if (permissions === undefined) {
    addCheck(
      'permissions_present',
      false,
      "No 'permissions' field in frontmatter — consider declaring filesystem/shell/network/git access (see CONTRIBUTING.md)",
      'warning',
    )
  } else if (!isPlainObject(permissions)) {
    addCheck(
      'permissions_shape_valid',
      false,
      "'permissions' must be a mapping, e.g. permissions: { shell: { enabled: true } }",
    )
  } else {
    const sections: Array<{ key: string; fields: string[] }> = [
      { key: 'filesystem', fields: ['read', 'write'] },
      { key: 'shell', fields: ['enabled'] },
      { key: 'network', fields: ['enabled'] },
      { key: 'git', fields: ['read', 'write'] },
    ]
    let shapeValid = true
    for (const { key, fields } of sections) {
      const section = permissions[key]
      if (section === undefined) continue
      if (!isPlainObject(section) || fields.some((field) => !isOptionalBoolean(section[field]))) {
        shapeValid = false
        addCheck(
          `permissions_${key}_shape`,
          false,
          `permissions.${key} must be an object with boolean field(s): ${fields.join(', ')}`,
        )
      }
    }
    if (shapeValid) addCheck('permissions_shape_valid', true, 'permissions field is well-formed')

    // Narrow declared-vs-content consistency check — see docs/roadmap/IMPROVEMENT_ROADMAP.md (TASK 2).
    // Deliberately scoped to shell/network only: filesystem/git heuristics have a much higher
    // false-positive rate against prose (e.g. "edit the file" in an explanation) and are left
    // for a future iteration rather than guessed at here.
    const shellSection = isPlainObject(permissions.shell) ? permissions.shell : undefined
    if (shellSection?.enabled === false && /```(bash|sh|zsh|shell)\b/i.test(body)) {
      addCheck(
        'permissions_shell_consistency',
        false,
        'permissions.shell.enabled is false, but the body contains a shell code block',
        'warning',
      )
    }
    const networkSection = isPlainObject(permissions.network) ? permissions.network : undefined
    if (networkSection?.enabled === false && /\bcurl\s+https?:\/\/|\bfetch\(/i.test(body)) {
      addCheck(
        'permissions_network_consistency',
        false,
        'permissions.network.enabled is false, but the body appears to make network calls (curl/fetch)',
        'warning',
      )
    }
  }

  const requires = fm.requires
  if (requires !== undefined) {
    if (!isPlainObject(requires)) {
      addCheck('requires_shape_valid', false, "'requires' must be a mapping, e.g. requires: { mcp: [context7] }")
    } else {
      const isOptionalStringArray = (value: unknown): boolean =>
        value === undefined || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))

      const mcp = requires.mcp
      const mcpValid = isOptionalStringArray(mcp)
      addCheck(
        'requires_mcp_shape',
        mcpValid,
        mcpValid ? 'requires.mcp is well-formed' : "'requires.mcp' must be an array of strings",
      )

      const skillsReq = requires.skills
      const skillsValid = isOptionalStringArray(skillsReq)
      addCheck(
        'requires_skills_shape',
        skillsValid,
        skillsValid ? 'requires.skills is well-formed' : "'requires.skills' must be an array of strings",
      )
      if (skillsValid && Array.isArray(skillsReq)) results.requiresSkills = skillsReq as string[]

      const tools = requires.tools
      const toolsValid = isOptionalStringArray(tools)
      addCheck(
        'requires_tools_shape',
        toolsValid,
        toolsValid ? 'requires.tools is well-formed' : "'requires.tools' must be an array of strings",
      )
    }
  }

  // --- Check 8: Body content ---
  const bodyLines = body.trim().split('\n')
  const lineCount = bodyLines.length

  addCheck(
    'body_line_count',
    lineCount <= 500,
    `SKILL.md body: ${lineCount} lines ${lineCount <= 500 ? '(good)' : '(consider moving content to references/)'}`,
    lineCount > 500 ? 'warning' : 'error',
  )

  const hasExamples = /(example|user says|result:)/i.test(body)
  addCheck(
    'body_has_examples',
    hasExamples,
    hasExamples ? 'Instructions include examples' : 'Consider adding usage examples',
    'warning',
  )

  const hasErrorHandling = /(error|fail|troubleshoot|issue|problem|if.*fails)/i.test(body)
  addCheck(
    'body_has_error_handling',
    hasErrorHandling,
    hasErrorHandling ? 'Instructions include error handling' : 'Consider adding error handling guidance',
    'warning',
  )

  // --- Check 9: Optional files ---
  if (entries.includes('references') && statSync(join(skillPath, 'references')).isDirectory()) {
    const refs = readdirSync(join(skillPath, 'references'))
    for (const ref of refs) {
      const refMentioned = body.includes(ref) || body.includes(`references/${ref}`)
      addCheck(
        `ref_linked_${ref}`,
        refMentioned,
        refMentioned
          ? `references/${ref} is referenced in SKILL.md`
          : `references/${ref} exists but is not referenced in SKILL.md`,
        'warning',
      )
    }
  }

  // --- Summary ---
  if (results.failed === 0) {
    results.summary = `PASS — ${results.passed} checks passed${results.warnings > 0 ? `, ${results.warnings} warnings` : ''}`
  } else {
    results.summary = `FAIL — ${results.failed} errors, ${results.warnings} warnings`
  }

  return results
}

function printReport(results: ValidationResult) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  Skill Validation Report`)
  console.log(`  Path: ${results.path}`)
  console.log(`${'='.repeat(60)}\n`)

  for (const check of results.checks) {
    const icon = check.passed ? '✅' : check.severity === 'warning' ? '⚠️' : '❌'
    console.log(`  ${icon} ${check.name}: ${check.message}`)
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${results.summary}`)
  console.log(`  Passed: ${results.passed} | Failed: ${results.failed} | Warnings: ${results.warnings}`)
  console.log(`${'─'.repeat(60)}\n`)
}

/**
 * Cross-skill check that `validateSkill` can't do alone — it only sees one skill directory at a
 * time, but `requires.skills` references need the full catalog: an unknown name (typo, rename,
 * removed skill) and a circular chain (a legitimate skill graph should never have one) are both
 * authoring bugs that should fail CI before publish, not surface later as a broken install.
 */
function validateSkillDependencyGraph(allResults: ValidationResult[]): boolean {
  const byName = new Map(allResults.map((r) => [basename(r.path), r]))
  let ok = true

  for (const result of allResults) {
    const skillName = basename(result.path)
    for (const dependencyName of result.requiresSkills ?? []) {
      if (!byName.has(dependencyName)) {
        console.log(`  ❌ ${skillName}: requires.skills references unknown skill '${dependencyName}'`)
        ok = false
      }
    }
  }

  const visiting = new Set<string>()
  const done = new Set<string>()
  const path: string[] = []

  function visit(name: string): void {
    if (done.has(name) || !byName.has(name)) return
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name)
      console.log(`  ❌ Circular skill dependency: ${[...path.slice(cycleStart), name].join(' → ')}`)
      ok = false
      return
    }

    visiting.add(name)
    path.push(name)
    for (const dependencyName of byName.get(name)?.requiresSkills ?? []) visit(dependencyName)
    path.pop()
    visiting.delete(name)
    done.add(name)
  }

  for (const name of byName.keys()) visit(name)

  return ok
}

function validateBatch(skillsRoot: string): boolean {
  const allResults: ValidationResult[] = []

  const categories = readdirSync(skillsRoot).sort()
  for (const categoryDir of categories) {
    const categoryPath = join(skillsRoot, categoryDir)
    if (!statSync(categoryPath).isDirectory()) continue

    const skills = readdirSync(categoryPath).sort()
    for (const skillDir of skills) {
      const skillPath = join(categoryPath, skillDir)
      if (!statSync(skillPath).isDirectory()) continue

      allResults.push(validateSkill(skillPath))
    }
  }

  const totalPassed = allResults.filter((r) => r.failed === 0).length
  const totalFailed = allResults.filter((r) => r.failed > 0).length
  const totalWarnings = allResults.reduce((acc, r) => acc + r.warnings, 0)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  Batch Validation Summary`)
  console.log(`${'='.repeat(60)}\n`)

  for (const r of allResults) {
    const skillName = basename(r.path)
    const category = basename(dirname(r.path))
    const icon = r.failed === 0 ? '✅' : '❌'
    const warningStr = r.warnings > 0 ? ` (${r.warnings} warnings)` : ''
    console.log(`  ${icon} ${category}/${skillName}: ${r.summary}${warningStr}`)
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(
    `  Total: ${allResults.length} skills | Passed: ${totalPassed} | Failed: ${totalFailed} | Warnings: ${totalWarnings}`,
  )
  console.log(`${'─'.repeat(60)}\n`)

  for (const r of allResults) {
    if (r.failed > 0) {
      printReport(r)
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`  Dependency Graph Check (requires.skills)`)
  console.log(`${'='.repeat(60)}\n`)
  const graphOk = validateSkillDependencyGraph(allResults)
  console.log(graphOk ? '  ✅ No unknown references or cycles found\n' : '')

  return totalFailed === 0 && graphOk
}

const args = process.argv.slice(2)
if (args.length === 0) {
  // Default to batch mode
  const success = validateBatch('packages/skills-catalog/skills')
  process.exit(success ? 0 : 1)
} else if (args[0] === '--batch' && args[1]) {
  const success = validateBatch(args[1])
  process.exit(success ? 0 : 1)
} else {
  const results = validateSkill(args[0])
  printReport(results)
  process.exit(results.failed === 0 ? 0 : 1)
}
