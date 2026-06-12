# deeda Platform Docs Sprint Packet

Status: Wave 1 (harness) shipped. This file is the backlog SSOT for the
public docs at docs.deeda.com. Internal — not published (only pages in
docs.json navigation render).

## Operating rules

1. Data-heavy pages are GENERATED from the platform SSOTs
   (`scripts/gen-from-harness.mjs`), never hand-written. Hand-written pages
   carry prose and architecture only. One owner per fact.
2. REDACTION GATE (mandatory, every publish): before any commit that adds or
   regenerates content, scan for internal absolute paths (`/Users/`,
   `/sessions/`, `/tmp/`), usernames, secret names/values, internal
   hostnames, and evidence-artifact operational details. Evidence and
   `docs-preview` material from deedaThink is internal by default; it must be
   re-generated for public consumption, not copied.
3. Numbers (row counts, runtime counts) appear only on generated pages or are
   regenerated in the same commit that changes them.
4. Every wave ends with: regenerate → redaction scan → local `mint dev`
   render check → push → verify live deploy.

## Wave 1 — Agent Harness (SHIPPED)

- Landing, quickstart, harness overview, Cadence, workflow markdown,
  runtimes, capability catalog, 4 per-provider capability showcases.

## Wave 2 — Harness depth

- [ ] Tool & sandbox power profiles (read-only/edit/full/network).
- [ ] Review consensus and merge admission (slots, stale-base retry).
- [ ] Headroom (context compression) configuration and evidence.
- [ ] Proof suite & evidence model: how a capability earns `implemented`.
- [ ] Provider option ledger: workflow-safe knobs per provider.
- [ ] Runtime selection policies: fixed / vendor-auto / ordered fallback.

## Wave 3 — deeda Think platform

- [ ] Think knowledge model: store/query/search, thinkids, hydration.
- [ ] Canvas & workpads. Beam issues/cycles/projects. Teams & collab turns.
- [ ] Plugins & marketplaces; skills and slash commands.
- [ ] MCP server surface (think_* tools) reference — generated from tool
      registry.
- [ ] Evals: cases, runs, review queues, regression. Observability: traces,
      spans, correlation.

## Wave 4 — Operations & API

- [ ] think-api reference (generated from OpenAPI if available).
- [ ] CLI reference. Desktop app guide. Local model setup (Ollama, MLX,
      LocalAI, llama.cpp).
- [ ] Security model: broker grants, sandbox tiers, secret handling.

## Wave 5 — Automation

- [ ] CI: regenerate generated pages on every deedaThink main merge
      (deedaThink workflow → PR to this repo), with the redaction scan as a
      blocking step.
- [ ] Drift gate test in deedaThink CI that fails when docs-site generated
      pages are stale relative to the catalogs.
