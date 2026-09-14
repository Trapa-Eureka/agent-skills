import { describe, expect, it, jest } from '@jest/globals'

import type {
  CorePorts,
  EnvPort,
  FileSystemPort,
  HttpPort,
  LoggerPort,
  PackageResolverPort,
  PathsPort,
  ShellPort,
  SignatureVerifierPort,
} from '../../ports'
import type { SkillsRegistry } from '../../types'

import { exportRegistrySnapshot, installSkillFromSnapshot, readSnapshotRegistry } from '../snapshot.service'

type TestPorts = {
  ports: CorePorts
  virtualFs: Map<string, string>
  getWithFallbackMock: jest.MockedFunction<
    (
      url: string,
      fallbackUrl?: string,
    ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>
  >
}

/**
 * A minimal in-memory filesystem — real enough for the read-your-own-writes assertions these
 * tests make (export, then read back what was exported) without the per-call jest.fn() mocking
 * this file's sibling specs use for simpler cases. `cp` simulates a recursive directory copy by
 * prefix-matching every virtual file under `src/`.
 */
const createPorts = (): TestPorts => {
  const virtualFs = new Map<string, string>()
  const dirs = new Set<string>(['/home/tester/.cache/agent-skills'])

  // A directory "exists" if explicitly created, or implicitly because a file lives under it —
  // matching real filesystem semantics for a directory nobody ever called mkdir on.
  const existsSync = (path: string) =>
    virtualFs.has(path) || dirs.has(path) || [...virtualFs.keys()].some((key) => key.startsWith(`${path}/`))
  const readFileSync = (path: string) => {
    const content = virtualFs.get(path)
    if (content === undefined) throw new Error(`ENOENT: ${path}`)
    return content
  }
  const mkdir = async (path: string) => {
    dirs.add(path)
  }
  const writeFile = async (path: string, content: string) => {
    virtualFs.set(path, content)
  }
  const cp = async (src: string, dest: string) => {
    if (virtualFs.has(src)) {
      virtualFs.set(dest, virtualFs.get(src) as string)
      return
    }
    const prefix = src.endsWith('/') ? src : `${src}/`
    for (const [path, content] of [...virtualFs.entries()]) {
      if (path.startsWith(prefix)) virtualFs.set(`${dest}/${path.slice(prefix.length)}`, content)
    }
    dirs.add(dest)
  }

  const getWithFallbackMock =
    jest.fn<
      (
        url: string,
        fallbackUrl?: string,
      ) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>
    >()
  const getMock = jest.fn<HttpPort['get']>()
  getMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}), text: async () => '' })
  const signatureVerifyMock = jest.fn<SignatureVerifierPort['verify']>()
  signatureVerifyMock.mockRejectedValue(new Error('no valid signature (default test fake)'))

  const fs = {
    existsSync,
    readFileSync,
    writeFileSync: (path: string, content: string) => virtualFs.set(path, content),
    mkdirSync: (path: string) => dirs.add(path),
    mkdir,
    writeFile,
    cp,
    readdirSync: () => [],
  } as unknown as FileSystemPort

  const http = { getWithFallback: getWithFallbackMock, get: getMock } as unknown as HttpPort

  const env = {
    cwd: jest.fn(() => '/workspace/project'),
    homedir: jest.fn(() => '/home/tester'),
    platform: jest.fn(() => 'linux'),
    getEnv: jest.fn((key: string) => (key === 'SKILLS_CDN_REF' ? 'main' : undefined)),
  } as unknown as EnvPort

  const packageResolver = {
    getLatestVersion: jest.fn<() => Promise<string>>().mockResolvedValue('9.9.9'),
  } as unknown as PackageResolverPort

  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as LoggerPort

  const ports: CorePorts = {
    fs,
    http,
    env,
    logger,
    packageResolver,
    paths: {
      getWorkspaceRoot: jest.fn(() => '/workspace/project'),
      getSkillsCatalogPath: jest.fn(() => '/workspace/project/packages/skills-catalog/skills'),
      getLocalSkillsDirectory: jest.fn(() => null),
    } as unknown as PathsPort,
    shell: {} as ShellPort,
    signatureVerifier: { verify: signatureVerifyMock },
  }

  return { ports, virtualFs, getWithFallbackMock }
}

const SKILL_CONTENT = '# Accessibility skill'

// contentHash deliberately omitted: downloadSkill() verifies it against the actual downloaded
// bytes when present, which is registry.service.spec.ts's concern, not this file's — every
// skill below resolves to the same mocked SKILL_CONTENT regardless of name, so a real hash
// would spuriously "mismatch" for one of them.
const registryFixture: SkillsRegistry = {
  version: 'main',
  generatedAt: '2026-03-13T12:00:00.000Z',
  baseUrl: 'https://cdn.jsdelivr.net/npm/@tech-leads-club/skills-catalog@main/skills',
  categories: { quality: { name: 'Quality' } },
  skills: [
    {
      name: 'accessibility',
      description: 'Improve accessibility',
      category: 'quality',
      path: '(quality)/accessibility',
      files: ['SKILL.md'],
    },
    {
      name: 'security-basics',
      description: 'Security 101',
      category: 'quality',
      path: '(quality)/security-basics',
      files: ['SKILL.md'],
    },
  ],
}

function mockRegistryAndSkillFetch(testPorts: TestPorts) {
  testPorts.getWithFallbackMock.mockImplementation(async (url) => {
    if (url.includes('skills-registry.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => registryFixture,
        text: async () => JSON.stringify(registryFixture),
      }
    }
    return { ok: true, status: 200, json: async () => SKILL_CONTENT, text: async () => SKILL_CONTENT }
  })
}

describe('exportRegistrySnapshot', () => {
  it('exports the full catalog when no skill filter is given', async () => {
    const testPorts = createPorts()
    mockRegistryAndSkillFetch(testPorts)

    const result = await exportRegistrySnapshot(testPorts.ports, { outputDir: '/out' })

    expect(result.exportedSkills.sort()).toEqual(['accessibility', 'security-basics'])
    expect(result.failedSkills).toEqual([])
    expect(testPorts.virtualFs.get('/out/skills/(quality)/accessibility/SKILL.md')).toBe(SKILL_CONTENT)
    expect(testPorts.virtualFs.get('/out/skills/(quality)/security-basics/SKILL.md')).toBe(SKILL_CONTENT)

    const written = JSON.parse(testPorts.virtualFs.get('/out/skills-registry.json') as string) as SkillsRegistry
    expect(written.skills.map((s) => s.name).sort()).toEqual(['accessibility', 'security-basics'])
  })

  it('exports only the requested skills when a filter is given', async () => {
    const testPorts = createPorts()
    mockRegistryAndSkillFetch(testPorts)

    const result = await exportRegistrySnapshot(testPorts.ports, { outputDir: '/out', skills: ['accessibility'] })

    expect(result.exportedSkills).toEqual(['accessibility'])
    expect(testPorts.virtualFs.has('/out/skills/(quality)/security-basics/SKILL.md')).toBe(false)

    const written = JSON.parse(testPorts.virtualFs.get('/out/skills-registry.json') as string) as SkillsRegistry
    expect(written.skills.map((s) => s.name)).toEqual(['accessibility'])
  })

  it('throws for an unknown requested skill name, without exporting anything', async () => {
    const testPorts = createPorts()
    mockRegistryAndSkillFetch(testPorts)

    await expect(exportRegistrySnapshot(testPorts.ports, { outputDir: '/out', skills: ['ghost'] })).rejects.toThrow(
      /Unknown skill\(s\): ghost/,
    )
    expect(testPorts.virtualFs.has('/out/skills-registry.json')).toBe(false)
  })

  it('throws when the live registry cannot be fetched', async () => {
    const testPorts = createPorts()
    testPorts.getWithFallbackMock.mockRejectedValue(new Error('network down'))

    await expect(exportRegistrySnapshot(testPorts.ports, { outputDir: '/out' })).rejects.toThrow(
      /Failed to fetch the skills registry/,
    )
  })
})

describe('readSnapshotRegistry', () => {
  it('returns null when the directory has no skills-registry.json', () => {
    const { ports } = createPorts()
    expect(readSnapshotRegistry(ports, '/out')).toBeNull()
  })

  it('reads and returns a previously exported snapshot registry', () => {
    const { ports, virtualFs } = createPorts()
    virtualFs.set('/out/skills-registry.json', JSON.stringify(registryFixture))

    expect(readSnapshotRegistry(ports, '/out')).toEqual(registryFixture)
  })

  it('returns null for malformed JSON rather than throwing', () => {
    const { ports, virtualFs } = createPorts()
    virtualFs.set('/out/skills-registry.json', '{ not json')

    expect(readSnapshotRegistry(ports, '/out')).toBeNull()
  })
})

describe('installSkillFromSnapshot', () => {
  it('copies a skill from the snapshot into the skill cache', async () => {
    const { ports, virtualFs } = createPorts()
    virtualFs.set('/out/skills/(quality)/accessibility/SKILL.md', SKILL_CONTENT)

    const result = await installSkillFromSnapshot(ports, registryFixture.skills[0], '/out')

    expect(result).toBe('/home/tester/.cache/agent-skills/skills/accessibility')
    expect(virtualFs.get('/home/tester/.cache/agent-skills/skills/accessibility/SKILL.md')).toBe(SKILL_CONTENT)
  })

  it('returns null when the snapshot has no files for the skill', async () => {
    const { ports } = createPorts()
    const result = await installSkillFromSnapshot(ports, registryFixture.skills[0], '/out')
    expect(result).toBeNull()
  })
})
