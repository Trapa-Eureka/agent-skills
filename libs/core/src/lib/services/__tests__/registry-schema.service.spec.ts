import { describe, expect, it } from '@jest/globals'

import type { SkillsRegistry } from '../../types'
import {
  MAX_KNOWN_REGISTRY_SCHEMA_VERSION,
  migrateRegistrySchema,
  resolveRegistrySchemaVersion,
} from '../registry-schema.service'

function registry(overrides: Partial<SkillsRegistry> = {}): SkillsRegistry {
  return {
    version: 'main',
    generatedAt: '2026-03-13T12:00:00.000Z',
    baseUrl: 'https://cdn.example.com/skills',
    categories: {},
    skills: [],
    ...overrides,
  }
}

describe('resolveRegistrySchemaVersion', () => {
  it('resolves an explicit schemaVersion as-is', () => {
    expect(resolveRegistrySchemaVersion(registry({ schemaVersion: 1 }))).toBe(1)
  })

  it('resolves a missing schemaVersion to 1 (predates the field, same shape)', () => {
    expect(resolveRegistrySchemaVersion(registry())).toBe(1)
  })
})

describe('migrateRegistrySchema', () => {
  it('passes a known-version registry through unchanged (same object reference)', () => {
    const input = registry({ schemaVersion: 1 })
    const result = migrateRegistrySchema(input)

    expect(result.registry).toBe(input)
    expect(result.schemaVersion).toBe(1)
    expect(result.isNewerThanKnown).toBe(false)
  })

  it('treats a missing schemaVersion as 1 and reports it as known', () => {
    const input = registry()
    const result = migrateRegistrySchema(input)

    expect(result.registry).toBe(input)
    expect(result.schemaVersion).toBe(1)
    expect(result.isNewerThanKnown).toBe(false)
  })

  it('reports isNewerThanKnown for a schemaVersion beyond what this CLI knows, without failing', () => {
    const input = registry({ schemaVersion: MAX_KNOWN_REGISTRY_SCHEMA_VERSION + 1 })
    const result = migrateRegistrySchema(input)

    expect(result.registry).toBe(input)
    expect(result.schemaVersion).toBe(MAX_KNOWN_REGISTRY_SCHEMA_VERSION + 1)
    expect(result.isNewerThanKnown).toBe(true)
  })

  it('never throws on a far-future schemaVersion', () => {
    expect(() => migrateRegistrySchema(registry({ schemaVersion: 999 }))).not.toThrow()
  })
})
