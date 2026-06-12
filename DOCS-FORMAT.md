# The deeda Docs Format (internal standard)

This file is the contract for ANYONE — human or agent — writing deeda
documentation. If you build a feature, your docs ship in this format. The
test of every page: **an agent reading it cold can use the feature correctly
in one pass, and report to its human what it can now do.**

## The five required ingredients

Every feature/capability page MUST contain, in this order:

1. **What it does** — one paragraph, capability-first ("you can X"), no
   internals.
2. **Exact parameters** — a table generated or checked against the SSOT:
   name/path, type, required, default, allowed values, risk. This is the
   `--help` equivalent. If a parameter exists in code but not in the table,
   the page is wrong.
3. **A complete, runnable example** — a fenced code block the reader can
   copy verbatim (for harness features: a full `workflow.md` or a snippet
   block that composes with /harness/snippets). Examples must validate
   against the real schema — wire a CI test like
   tests/docs/harness-agent-guide.test.ts when feasible.
4. **When to use it (and when not)** — decision guidance against the
   alternatives (e.g. api vs sdk vs cli), in a table if there are 3+ options.
5. **Links to the source of truth** — vendor docs for vendor surfaces, the
   schema reference for fields.

## Hard rules

- **Generated over hand-written.** Any list of parameters, runtimes, rows,
  enums, or counts is GENERATED from the SSOT (scripts/gen-from-harness.mjs
  pattern: deterministic, banner comment, owns no truth). Hand-written pages
  carry prose, recipes, and judgment only. Numbers in hand-written prose are
  forbidden unless regenerated in the same commit.
- **No internals in public docs.** Never emit `state_reason`, source file
  names, probe/dispatch plumbing, host paths, usernames, or secret names.
  The generator enforces this (INTERNAL_NOTE filter, audience filter);
  the publish gate re-scans:
  `grep -rn "/Users/\|/sessions/\|\.ts\b\|probe registration\|dispatch path" <pages>`.
- **Agent-consumable by construction.** Every page must stand alone when
  fetched as `<page>.md`. State prerequisites explicitly; link instead of
  assuming prior pages are in context. Keep one concern per page so an agent
  can fetch only what it needs (see /agents for the consumption recipe).
- **Code blocks are the API.** Anything the reader should type is in a
  fenced block with a language tag — never prose-embedded fragments. Blocks
  must be copy-paste complete (no `...` ellipses inside YAML).
- **Honest states.** Capabilities carry their state (model-dependent,
  partial-compatible) inline. Never present a gated capability as
  unconditional. "Zero deferred ≠ universal implementation."

## Publish checklist (every wave)

1. `node scripts/gen-from-harness.mjs <deedaThink>` (after `npm run build`
   there).
2. Redaction scan (rule above) — zero hits on generated pages.
3. `npx mint broken-links` — zero broken links.
4. Update docs.json navigation for new pages.
5. Commit, push to main, trigger deploy, verify the live page AND its `.md`
   endpoint render.

## Page skeleton (copy this)

```mdx
---
title: "<Feature>"
description: "<capability-first one-liner with a real number if generated>"
icon: "<lucide-icon>"
---

<What it does — one paragraph.>

## Parameters
<generated table>

## Example
```yaml
<complete runnable block>
` ` `

## When to use
<decision table vs alternatives>

## See also
<schema/vendor links>
```
