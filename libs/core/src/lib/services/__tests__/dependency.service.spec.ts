import { describe, expect, it } from '@jest/globals'

import type { SkillInfo } from '../../types'
import { resolveSkillDependencies } from '../dependency.service'

function skill(name: string, requiresSkills?: string[]): SkillInfo {
  return {
    name,
    description: `${name} description`,
    path: `/skills/${name}`,
    ...(requiresSkills ? { requires: { skills: requiresSkills } } : {}),
  }
}

describe('resolveSkillDependencies', () => {
  it('resolves a skill with no dependencies to just itself', () => {
    const allSkills = [skill('a')]
    const result = resolveSkillDependencies(allSkills, ['a'])

    expect(result.resolved.map((s) => s.name)).toEqual(['a'])
    expect(result.autoIncluded).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.cycles).toEqual([])
  })

  it('pulls in a direct dependency and marks it auto-included', () => {
    const allSkills = [skill('a', ['b']), skill('b')]
    const result = resolveSkillDependencies(allSkills, ['a'])

    expect(result.resolved.map((s) => s.name)).toEqual(['b', 'a'])
    expect(result.autoIncluded).toEqual(['b'])
  })

  it('resolves transitive dependencies in topological order', () => {
    const allSkills = [skill('a', ['b']), skill('b', ['c']), skill('c')]
    const result = resolveSkillDependencies(allSkills, ['a'])

    expect(result.resolved.map((s) => s.name)).toEqual(['c', 'b', 'a'])
    expect(result.autoIncluded).toEqual(expect.arrayContaining(['b', 'c']))
    expect(result.autoIncluded).toHaveLength(2)
  })

  it('deduplicates a diamond dependency (a->b, a->c, b->d, c->d)', () => {
    const allSkills = [skill('a', ['b', 'c']), skill('b', ['d']), skill('c', ['d']), skill('d')]
    const result = resolveSkillDependencies(allSkills, ['a'])

    expect(result.resolved.filter((s) => s.name === 'd')).toHaveLength(1)
    expect(result.resolved.map((s) => s.name)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('does not mark an explicitly requested skill as auto-included even when another skill also depends on it', () => {
    const allSkills = [skill('a', ['b']), skill('b')]
    const result = resolveSkillDependencies(allSkills, ['a', 'b'])

    expect(result.autoIncluded).toEqual([])
    expect(result.resolved.map((s) => s.name).sort()).toEqual(['a', 'b'])
  })

  it('reports a name referenced by requires.skills that does not exist in the catalog as missing', () => {
    const allSkills = [skill('a', ['ghost'])]
    const result = resolveSkillDependencies(allSkills, ['a'])

    expect(result.missing).toEqual(['ghost'])
    expect(result.resolved.map((s) => s.name)).toEqual(['a'])
  })

  it('reports a requested name that does not exist in the catalog as missing, without throwing', () => {
    const allSkills: SkillInfo[] = []
    const result = resolveSkillDependencies(allSkills, ['ghost'])

    expect(result.missing).toEqual(['ghost'])
    expect(result.resolved).toEqual([])
  })

  it('detects a direct self-dependency without infinite recursion', () => {
    const allSkills = [skill('a', ['a'])]
    const result = resolveSkillDependencies(allSkills, ['a'])

    expect(result.cycles).toEqual([['a', 'a']])
    expect(result.resolved.map((s) => s.name)).toEqual(['a'])
  })

  it('detects a multi-node cycle (a->b->c->a) and still resolves every node once', () => {
    const allSkills = [skill('a', ['b']), skill('b', ['c']), skill('c', ['a'])]
    const result = resolveSkillDependencies(allSkills, ['a'])

    expect(result.cycles).toEqual([['a', 'b', 'c', 'a']])
    expect(result.resolved.map((s) => s.name).sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns an empty resolution for an empty request', () => {
    const result = resolveSkillDependencies([skill('a')], [])
    expect(result).toEqual({ resolved: [], autoIncluded: [], missing: [], cycles: [] })
  })
})
