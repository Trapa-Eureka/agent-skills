# Improvement Roadmap

This roadmap translates the priorities from the original improvement proposal into concrete, incrementally shippable TASKs, grounded in the actual codebase structure (as opposed to some stale paths in `CLAUDE.md` — see note below). It is executed **one TASK at a time**: each TASK is implemented on its own branch, opened as a PR against this fork, merged into `main`, and only after **every** TASK below lands is a consolidated PR sent to the upstream project.

## Why

The repository already has strong foundations for skill distribution, security scanning, CLI installation, MCP-based discovery, and multi-agent support. The next stage of improvement focuses less on adding more skills and more on making **skill behavior, compatibility, provenance, permissions, and dependencies measurable and verifiable**.

## Documentation drift note

Business logic actually lives in `libs/core/src/lib/services/` (`registry.service.ts`, `installer.service.ts`, `lockfile.service.ts`, `agents.service.ts`), not in `packages/cli/src/services/` as described in `CLAUDE.md`. `packages/cli/src/services/` only holds CLI-presentation helpers. TASKs below reference the real locations.

## Ground truth (verified against the codebase)

- `libs/core/src/lib/types.ts` defines `AgentType` (19 agents), `AgentConfig`, `SkillMetadata`, `SkillsRegistry`, `SkillLockEntry`/`SkillLockFile`, `DeprecatedEntry`. None of these have `permissions`, `compatibility`, `dependencies`, or `schemaVersion` fields today.
- SKILL.md frontmatter across all skills only uses `name`, `description`, optional `license`, and `metadata.{author,version}`. Any mention of MCP requirements or tool needs is free text, not machine-readable.
- `packages/skills-catalog/src/generate-registry.ts` emits `skills-registry.json` with a hardcoded `version: "1.0.0"` string and no `schemaVersion`. The `generatedAt`/`baseUrl` fields declared on the `SkillsRegistry` type are never actually populated by the generator (dead fields).
- CI (`release.yml` + `.github/actions/validate-skills`, `.github/actions/security-scan`) runs structural validation (`tools/validate-skills.ts`) and a Snyk-based content scan. There is no signing, SBOM, or SLSA attestation for skill content — only npm's built-in `--provenance` flag for the published npm packages themselves.
- There is no skill-to-skill or skill-to-MCP dependency graph anywhere in the data model.

## Operating rules

- **Branching**: each TASK branches off `dev` (kept in sync with `main`), e.g. `task/01-conformance-harness`.
- **Landing**: push to the fork (`origin`) → open a PR → merge directly into `main` as soon as that TASK is done (not batched) → fast-forward `dev` to match.
- **Between TASKs**: summarize what changed, state how many TASKs remain, and get explicit confirmation before starting the next one. No automatic continuation.
- **Upstream**: PRs to `tech-leads-club/agent-skills` are not opened per TASK. Only after every TASK below has landed on `origin/main` is a consolidated PR (or a small set of them) opened upstream.

## TASK list (execution order)

| #   | Priority | TASK                                       | Primary goal                                                                                            |
| --- | -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 0   | —        | Improvement roadmap (this document)        | Turn the proposal into an actionable, trackable plan                                                    |
| 1   | P0       | Cross-Agent Behavioral Conformance Harness | Verify SKILL.md behaves equivalently across agents via behavioral invariants, not exact-text comparison |
| 2   | P0       | Skill Capability / Permission Manifest     | Machine-readable `permissions`/`requires` metadata in frontmatter + registry                            |
| 3   | P0       | Signed Registry & Supply-Chain Provenance  | Cryptographic signing of `skills-registry.json` releases                                                |
| 4   | P1       | Behavioral Evaluation Framework            | Per-skill `evals/` fixtures + CI regression detection, built on TASK 1                                  |
| 5   | P1       | Skill-Level Compatibility Matrix           | Per-skill, ideally auto-generated, agent compatibility status                                           |
| 6   | P1       | Explicit Skill Dependency Graph            | `requires.skills`/`requires.mcp`/`requires.tools` + resolver + cycle detection                          |
| 7   | P1       | Registry Schema Versioning & Migration     | `schemaVersion` field + CLI compatibility checks + migration scaffolding                                |
| 8   | P2       | Offline Registry Snapshot & Mirror Support | Exportable, installable offline registry snapshots                                                      |
| 9   | P2       | Reproducible Skill Bundles                 | Deterministic packaging: same source → same artifact hash                                               |
| 10  | —        | Upstream Pull Request                      | Consolidated PR(s) to `tech-leads-club/agent-skills` once TASK 1–9 have landed                          |

### TASK 1 (P0) — Cross-Agent Behavioral Conformance Harness

Same `SKILL.md`, multiple agents (Claude Code, Codex, Cursor, …) — no guarantee today that each agent preserves the same behavior. Introduce a small, adapter-based framework that evaluates **behavioral invariants** (e.g. `inspect_repository_before_review`, `do_not_modify_files`) rather than exact output. Scope for the first PR, per the original proposal's recommendation: Scenario Loader, invariant definition format, result normalizer, `AgentAdapter` interface, and exactly two adapters (Claude Code, Codex) — not full agent coverage yet. This becomes the foundation for TASK 4 and TASK 5.

### TASK 2 (P0) — Skill Capability / Permission Manifest

Extend SKILL.md frontmatter with a `permissions` block (filesystem/shell/network/git) and `requires.mcp`. Propagate through `SkillMetadata`/`SkillsRegistry` (`libs/core/src/lib/types.ts`) and `generate-registry.ts`. Add a consistency check in `tools/validate-skills.ts` (declared permissions vs. actual content) and surface a permission summary in the CLI before install. Consider introducing the minimal `schemaVersion` field (TASK 7) here since the registry shape is already changing.

### TASK 3 (P0) — Signed Registry & Supply-Chain Provenance

Content hashing proves integrity, not authenticity. Add cryptographic signing (Sigstore/cosign or GitHub OIDC) to the release pipeline for `skills-registry.json`, publish `.sig`/`provenance.json`, and verify the signature in `registry.service.ts` before install. A forged or unsigned registry should be rejected.

### TASK 4 (P1) — Behavioral Evaluation Framework

Build on TASK 1: allow skills to ship `evals/scenarios/*.json` + `evals/invariants.yaml` fixtures, run them in CI, and detect regressions.

### TASK 5 (P1) — Skill-Level Compatibility Matrix

Per-skill `compatibility` metadata, ideally generated from TASK 1/4 conformance results rather than hand-maintained, surfaced in the CLI/MCP/marketplace.

### TASK 6 (P1) — Explicit Skill Dependency Graph

`requires.skills`/`requires.mcp`/`requires.tools` in frontmatter, a dependency resolver in the install flow, and cycle detection.

### TASK 7 (P1) — Registry Schema Versioning & Migration

Explicit `schemaVersion` in `skills-registry.json`, CLI-side compatibility checks against unsupported schema versions, and scaffolding for future migrations.

### TASK 8 (P2) — Offline Registry Snapshot & Mirror Support

`agent-skills snapshot export` + `--registry <path>` for air-gapped/enterprise/reproducible-CI installs.

### TASK 9 (P2) — Reproducible Skill Bundles

A deterministic packaging format so the same source always produces the same artifact hash, complementing TASK 3's signing.

### TASK 10 — Upstream Pull Request

Once TASK 1–9 are merged into `origin/main`, prepare and open the consolidated PR(s) against `tech-leads-club/agent-skills`.

## Verification per TASK

- `npm run lint`, `npm run test` (affected workspace), `npm run build`.
- `npm run validate` for any TASK touching SKILL.md frontmatter.
- `npm run generate:data` re-run + diff review for any TASK touching registry/type shapes.
