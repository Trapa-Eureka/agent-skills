#!/usr/bin/env tsx
/**
 * CI-only: signs a published skills-registry.json with Sigstore keyless signing, writing a
 * `<path>.sigstore.json` bundle alongside it. Relies on ambient GitHub Actions OIDC (the
 * `id-token: write` workflow permission) — no explicit credentials or flags needed when run
 * inside a job that has it. See docs/roadmap/IMPROVEMENT_ROADMAP.md (TASK 3) for the design.
 *
 * Usage: npx tsx packages/skills-catalog/scripts/sign-registry.ts <path-to-skills-registry.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { sign } from 'sigstore'

const [, , registryPath] = process.argv

if (!registryPath) {
  console.error('Usage: sign-registry.ts <path-to-skills-registry.json>')
  process.exit(1)
}

const payload = readFileSync(registryPath)
const bundle = await sign(payload)
const bundlePath = `${registryPath}.sigstore.json`
writeFileSync(bundlePath, JSON.stringify(bundle))

console.log(`✅ Signed ${registryPath}`)
console.log(`   📍 ${bundlePath}`)
