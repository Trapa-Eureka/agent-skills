# @tech-leads-club/conformance

Cross-agent behavioral conformance harness (TASK 1 of `docs/roadmap/IMPROVEMENT_ROADMAP.md`),
extended by TASK 4 (Behavioral Evaluation Framework) into a catalog-wide, CI-checked regression
suite, and by TASK 5 (Skill-Level Compatibility Matrix) into a source of per-agent compatibility
data for the registry.

Runs a skill scenario through multiple agent CLI adapters and checks whether each execution
satisfies the same declared behavioral invariants — not whether the agents produced identical
text, but whether they preserved the same required/forbidden behaviors.

## Pipeline

```
Scenario YAML → loadScenario()
       ↓
  AgentAdapter.execute()   (one per agent: MockAgentAdapter, ClaudeCodeCliAdapter, CodexCliAdapter)
       ↓  RawAgentExecution (common tool-call vocabulary: bash / read_file / write_file / edit_file)
  normalizeExecution()
       ↓  NormalizedExecution (commandsRun / filesRead / filesWritten / rawOutput)
  evaluateInvariants()     (per adapter: PASS / FAIL against required + forbidden invariant ids)
       ↓
  runConformance()         (across adapters: PASS / FAIL / DRIFT scenario-level report)
```

## Scope of this first PR

Per the roadmap's "narrow first contribution" guidance, this package implements the framework
(scenario loader, invariant format, normalizer, `AgentAdapter` interface) plus exactly two real
adapters — Claude Code and Codex. Other agents are out of scope for now.

The real CLI adapters (`ClaudeCodeCliAdapter`, `CodexCliAdapter`) shell out to the `claude`/`codex`
binaries via the injected `ProcessRunner` port and parse a best-effort JSON transcript shape
(`{ tool_calls: [{ name, input }] }`). **This package's default test suite never invokes a real
binary** — no CLI or API key is available in this environment/CI, so:

- Command assembly for the real adapters is unit-tested against a mocked `ProcessRunner`.
- The full pipeline (loader → normalizer → evaluator → PASS/FAIL/DRIFT report) is verified
  end-to-end using `MockAgentAdapter`, which replays canned transcripts from `fixtures/transcripts/`.
- The tool-name mappings in `claude-code-cli.adapter.ts`/`codex-cli.adapter.ts` are best-effort
  and should be re-verified against the actual installed CLI version's JSON output before relying
  on live results — `parseToolCallTranscript` degrades to an empty tool-call list rather than
  throwing when the shape doesn't match, so a mismatch reads as "no tools observed", not a crash.

## Adding a new invariant

1. Add a checker function in `src/lib/invariants/checks.ts` (`(execution: NormalizedExecution) => InvariantCheckResult`).
2. Register it under a stable id in `src/lib/invariants/registry.ts`.
3. Reference that id from a scenario's `required`/`forbidden` list.

## Adding a new scenario (framework self-tests)

Add a YAML file under `fixtures/scenarios/` (see `gh-address-comments-readonly.yaml`) with
`skill`, `prompt`, and `invariants.{required,forbidden}`, using only invariant ids already
registered. These fixtures are for this package's own tests only — for real skills, see below.

## Adding evals to a skill (TASK 4)

Skills can ship their own behavioral evals under `evals/` in their own folder, checked by CI on
every PR (`nx run conformance:run-catalog-evals`, no secrets or live agent CLI required):

```
packages/skills-catalog/skills/(category)/skill-name/
  evals/
    scenarios/
      <name>.yaml                                   # same Scenario format as above
    recordings/
      <name>.<recording-id>.pass.json                # a RawAgentExecution that must PASS
      <name>.<recording-id>.fail.json                # one that must FAIL
```

- `<name>` in a recording's filename must match its scenario file's basename (without extension)
  — that's how `discoverSkillEvals()` pairs them up.
- `<recording-id>` is just a label (becomes the mock adapter's `id` in reports) — pick something
  descriptive, e.g. `compliant-agent`/`violating-agent`.
- The trailing `pass`/`fail` is the verdict CI expects when that recording is replayed. A
  mismatch — the checker logic or the scenario changed and this recording's actual verdict no
  longer matches — fails the CI step with a diagnostic (which invariant flipped and why).
- A scenario with no recordings yet is not a CI failure, just a warning — recordings are opt-in
  per skill, same as the `permissions` manifest (TASK 2).
- There is no live-agent mode in CI — recordings are how a maintainer captures what agent
  behavior currently looks like (by hand, or from a real `ClaudeCodeCliAdapter`/`CodexCliAdapter`
  run) so future changes to the skill or the checkers can be caught mechanically.

## Compatibility Matrix (TASK 5)

`skills-registry.json` publishes a `compatibility` field per skill, derived automatically from
the same evals above — no separate authoring step. The rule (`deriveCompatibility()` in
`compatibility-matrix.ts`): an agent is marked `tested` for a skill when at least one of its
recordings both declares `expected: pass` and currently matches that expectation. Recordings
expected to `fail` (negative/regression fixtures) and recordings that are currently regressed
never count — only a recording that verifiably demonstrates compliant behavior does.

The signal comes from the recorded transcript's own `agentId` field (`RawAgentExecution.agentId`),
**not** the recording's filename — so giving a `pass`-expected recording a real `AgentType` id
(e.g. `"agentId": "claude-code"`) is enough to make it count; the filename-derived
`recording-id`/label used for CI reporting is unaffected and can stay descriptive
(`compliant-agent`, etc.). `generate-registry.ts` filters out any `agentId` that isn't a real
`AgentType` before writing to the registry, so illustrative labels never leak into published
compatibility data.

**Honesty caveat**: `tested` means "covered by this repo's recorded regression fixtures right
now" — not "verified against a live run of that agent." As documented above, these fixtures are
typically hand-authored, not captured from a real CLI session (no live agent access in this
environment/CI). Treat the compatibility matrix as "our recorded understanding of this skill's
behavior for this agent is internally consistent," not as an external certification.

A skill with no `evals/` (or none of its recordings resolve to a real agent id) simply has no
`compatibility` field in the registry — never a false "untested"/"incompatible" claim, matching
the same absence-is-not-a-claim discipline as `permissions` (TASK 2).
