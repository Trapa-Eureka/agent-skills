# @tech-leads-club/conformance

Cross-agent behavioral conformance harness (TASK 1 of `docs/roadmap/IMPROVEMENT_ROADMAP.md`).

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

## Adding a new scenario

Add a YAML file under `fixtures/scenarios/` (see `gh-address-comments-readonly.yaml`) with
`skill`, `prompt`, and `invariants.{required,forbidden}`, using only invariant ids already
registered.
