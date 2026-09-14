import { summarizeMcpRequirements, summarizePermissions, type PermissionState } from '@tech-leads-club/core'
import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

import { Header } from '../components/Header'
import { SelectPrompt } from '../components/SelectPrompt'
import { colors, symbols } from '../theme'
import type { SkillInfo } from '../types'

interface InstallConfigProps {
  onConfirm: (config: { method: 'copy' | 'symlink'; global: boolean }) => void
  onBack: () => void
  initialMethod?: 'copy' | 'symlink'
  initialGlobal?: boolean
  /** Skills about to be installed, used to render a permission summary before confirming. */
  skills?: SkillInfo[]
}

export function InstallConfig({
  onConfirm,
  onBack,
  initialMethod = 'copy',
  initialGlobal = false,
  skills = [],
}: InstallConfigProps) {
  const [step, setStep] = useState<'method' | 'scope' | 'confirm'>('method')
  const [method, setMethod] = useState<'copy' | 'symlink'>(initialMethod)
  const [isGlobal, setIsGlobal] = useState(initialGlobal)

  if (step === 'method') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header />
        <Box marginBottom={1}>
          <Text bold color={colors.primary}>
            {symbols.diamond} Choose installation method:
          </Text>
        </Box>
        <SelectPrompt
          items={[
            { label: 'Copy', value: 'copy', hint: 'independent copies (recommended)' },
            { label: 'Symlink', value: 'symlink', hint: 'shared source (may not work with all agents)' },
          ]}
          onSelect={(val) => {
            setMethod(val as 'copy' | 'symlink')
            setStep('scope')
          }}
          onCancel={onBack}
        />
      </Box>
    )
  }

  if (step === 'scope') {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Header />
        <Box marginBottom={1}>
          <Text bold color={colors.primary}>
            {symbols.diamond} Choose installation scope:
          </Text>
        </Box>
        <SelectPrompt
          items={[
            { label: 'Local', value: false, hint: 'this project only' },
            { label: 'Global', value: true, hint: 'user home directory' },
          ]}
          onSelect={(val) => {
            setIsGlobal(val as boolean)
            setStep('confirm')
          }}
          onCancel={() => setStep('method')}
        />
      </Box>
    )
  }

  return (
    <InstallSummary
      method={method}
      isGlobal={isGlobal}
      skills={skills}
      onConfirm={() => onConfirm({ method, global: isGlobal })}
      onBack={() => setStep('scope')}
    />
  )
}

/**
 * Combines the union of every state across all selected skills into one: `granted` if any
 * skill declares it, else `denied` if any skill explicitly declares it off, else `unspecified`.
 * This is a summary for a multi-skill install, not a per-skill audit — it exists so the user
 * sees "could this batch do X" before confirming, not "does every skill do X".
 */
function unionState(states: PermissionState[]): PermissionState {
  if (states.some((state) => state === 'granted')) return 'granted'
  if (states.some((state) => state === 'denied')) return 'denied'
  return 'unspecified'
}

function PermissionsPreview({ skills }: { skills: SkillInfo[] }) {
  const declaredSkills = skills.filter((skill) => skill.permissions || skill.requires)
  if (declaredSkills.length === 0) return null

  const glyphs: Record<PermissionState, { icon: string; color: string }> = {
    granted: { icon: symbols.check, color: colors.success },
    denied: { icon: symbols.cross, color: colors.textMuted },
    unspecified: { icon: '—', color: colors.textMuted },
  }

  const lines = summarizePermissions(undefined).map((_, index) => {
    const perSkillStates = declaredSkills.map((skill) => summarizePermissions(skill.permissions)[index])
    return { label: perSkillStates[0]?.label ?? '', state: unionState(perSkillStates.map((line) => line.state)) }
  })

  const mcpNames = [...new Set(declaredSkills.flatMap((skill) => summarizeMcpRequirements(skill.requires)))]
  const undeclaredCount = skills.length - declaredSkills.length

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={colors.textDim}>
        Permissions {symbols.dot} {declaredSkills.length}/{skills.length} skills declare a manifest
        {undeclaredCount > 0 ? ` (${undeclaredCount} undeclared)` : ''}
      </Text>
      <Box>
        {lines.map((line) => (
          <Text key={line.label}>
            <Text color={glyphs[line.state].color}>{glyphs[line.state].icon}</Text>
            <Text color={colors.textDim}> {line.label} </Text>
          </Text>
        ))}
      </Box>
      {mcpNames.length > 0 && <Text color={colors.textDim}>MCP: {mcpNames.join(', ')}</Text>}
    </Box>
  )
}

function InstallSummary({
  method,
  isGlobal,
  skills,
  onConfirm,
  onBack,
}: {
  method: string
  isGlobal: boolean
  skills: SkillInfo[]
  onConfirm: () => void
  onBack: () => void
}) {
  useInput((input, key) => {
    if (key.return || input === 'y' || input === 'Y') onConfirm()
    if (key.escape || input === 'n' || input === 'N') onBack()
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header />

      <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color={colors.accent}>
            {symbols.diamond} Ready to install
          </Text>
        </Box>

        <Box>
          <Box width={10}>
            <Text color={colors.textDim}>Method</Text>
          </Box>
          <Text color={colors.text} bold>
            {method === 'copy' ? 'Copy' : 'Symlink'}
          </Text>
          <Text color={colors.textMuted}>
            {'  '}
            {symbols.dot} {method === 'copy' ? 'Recommended' : 'Developer mode'}
          </Text>
        </Box>

        <Box>
          <Box width={10}>
            <Text color={colors.textDim}>Scope</Text>
          </Box>
          <Text color={colors.text} bold>
            {isGlobal ? 'Global' : 'Local'}
          </Text>
          <Text color={colors.textMuted}>
            {'  '}
            {symbols.dot} {isGlobal ? 'User home' : 'This project'}
          </Text>
        </Box>

        <PermissionsPreview skills={skills} />
      </Box>

      <Box marginTop={1} borderStyle="round" borderColor={colors.border} paddingX={1}>
        <Box justifyContent="space-between" width="100%">
          <Text>
            <Text color={colors.success} bold>
              Y
            </Text>
            <Text color={colors.textDim}> / </Text>
            <Text color={colors.success} bold>
              enter
            </Text>
            <Text color={colors.textDim}> confirm</Text>
            <Text color={colors.textDim}> {symbols.dot} </Text>
            <Text color={colors.warning} bold>
              N
            </Text>
            <Text color={colors.textDim}> / </Text>
            <Text color={colors.warning} bold>
              esc
            </Text>
            <Text color={colors.textDim}> back</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
