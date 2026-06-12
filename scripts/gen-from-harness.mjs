/**
 * Generate harness reference pages for docs.deeda.com from the deedaThink
 * harness SSOTs. Generated pages OWN NO TRUTH — they are projections of:
 *
 *   - cadence/priv/workflow-md-frontmatter.schema.json (the exact schema
 *     Cadence validates against) → harness/workflow-schema.mdx
 *   - dist/runtime/runtime-catalog.js (+ author-facing methods parsed from
 *     DEEDA_HARNESS_AGENT_GUIDE.md, the CI-tested table) → harness/runtimes.mdx
 *   - dist/providers/catalog/provider-feature-catalog.js +
 *     dist/providers/options/provider-option-ledger.js → harness/capabilities.mdx
 *     and harness/providers/*.mdx (capability rows + PARAMETER reference)
 *
 * Usage: node scripts/gen-from-harness.mjs [path-to-deedaThink]
 * Requires deedaThink `npm run build` (dist/ present).
 *
 * REDACTION RULES (enforced here, verified again by the publish scan):
 *   - Never emit `state_reason` from the feature catalog (internal
 *     engineering notes: source files, probe status, dispatch internals).
 *   - Ledger `notes` are emitted only when they read as user-facing; notes
 *     matching INTERNAL_NOTE patterns (source filenames, dispatch/probe
 *     plumbing) are dropped.
 *   - `audience: "hidden"` ledger rows are never emitted.
 *   - No absolute host paths, env values, or secrets.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const harnessRoot = resolve(process.argv[2] ?? '../deedaThink');

const { RUNTIME_CATALOG } = await import(pathToFileURL(join(harnessRoot, 'dist/runtime/runtime-catalog.js')).href);
const { PROVIDER_FEATURE_CATALOG } = await import(
  pathToFileURL(join(harnessRoot, 'dist/providers/catalog/provider-feature-catalog.js')).href
);
const { PROVIDER_OPTION_LEDGER } = await import(
  pathToFileURL(join(harnessRoot, 'dist/providers/options/provider-option-ledger.js')).href
);
const FRONTMATTER_SCHEMA = JSON.parse(
  readFileSync(join(harnessRoot, 'cadence/priv/workflow-md-frontmatter.schema.json'), 'utf8'),
);
const AGENT_GUIDE = readFileSync(join(harnessRoot, 'DEEDA_HARNESS_AGENT_GUIDE.md'), 'utf8');

/** MDX-safe escaping for prose/table cells. */
const esc = (s) =>
  String(s ?? '')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('<', '&lt;')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ')
    .trim();

const INTERNAL_NOTE =
  /\.(ts|tsx|ex|exs|mjs|js)\b|dispatch path|probe registration|desktop-adapter|claude-agent|llm-(anthropic|openai|gemini|local)|sdk\.d\.ts|payload\./i;
const safeNote = (n) => (n && !INTERNAL_NOTE.test(n) ? esc(n) : '');

const PROVIDERS = ['anthropic', 'gemini', 'local', 'openai'];
const META = {
  anthropic: { label: 'Anthropic', slug: 'anthropic' },
  gemini: { label: 'Google Gemini', slug: 'gemini' },
  local: { label: 'Local (on-device)', slug: 'local' },
  openai: { label: 'OpenAI', slug: 'openai' },
};
const USABLE = ['implemented', 'model-dependent', 'partial-compatible'];
const countBy = (rows, k) => rows.reduce((o, r) => ((o[r[k]] = (o[r[k]] ?? 0) + 1), o), {});
const banner = (page) =>
  `{/* GENERATED (${page}) — do not edit by hand. Regenerate: node scripts/gen-from-harness.mjs. See DOCS-FORMAT.md. */}\n`;

/** Author-facing methods per runtime, parsed from the CI-tested guide table. */
function parseAuthorMethods() {
  const out = new Map();
  const section = AGENT_GUIDE.split('Canonical runtime keys:')[1] ?? '';
  for (const line of section.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|([^|]*)\|([^|]*)\|/);
    if (!m) continue;
    const methods = [...m[3].matchAll(/`([a-z_]+)`/g)].map((x) => x[1]);
    out.set(m[1], { surface: m[2].trim(), methods });
  }
  return out;
}
const authorMethods = parseAuthorMethods();
if (authorMethods.size < 10) throw new Error(`guide runtime table parse failed (${authorMethods.size} rows)`);

// ═════════════════════════════════════════════════════════════════════════
// 1. workflow-schema.mdx — the exact frontmatter contract Cadence validates
// ═════════════════════════════════════════════════════════════════════════

const DEFS = FRONTMATTER_SCHEMA.$defs ?? {};
const deref = (node) => {
  if (node?.$ref) {
    const key = node.$ref.replace('#/$defs/', '');
    return DEFS[key] ?? node;
  }
  return node;
};

/** Human-readable type for a schema node. */
function typeOf(node, d = 0) {
  if (d > 6) return 'object';
  node = deref(node);
  if (!node) return 'unknown';
  if (node.enum) return node.enum.map((v) => `\`${v}\``).join(' \\| ');
  if (node.const !== undefined) return `\`${node.const}\``;
  if (node.anyOf) {
    const parts = node.anyOf.map((n) => typeOf(n, d + 1));
    // integer|string unions are "number or {{template}} variable" in this schema
    const set = new Set(parts);
    if (set.size === 2 && set.has('integer') && set.has('string')) return 'integer (or `{{var}}` template)';
    if (set.size === 2 && set.has('number') && set.has('string')) return 'number (or `{{var}}` template)';
    if (set.size === 2 && set.has('boolean') && set.has('string')) return 'boolean (or `{{var}}` template)';
    return [...set].join(' \\| ');
  }
  if (node.type === 'array') return `array of ${typeOf(node.items, d + 1)}`;
  if (node.type === 'object' || node.properties) return 'object';
  return node.type ?? 'unknown';
}

function constraintsOf(node) {
  node = deref(node);
  const c = [];
  if (node.default !== undefined) c.push(`default \`${JSON.stringify(node.default)}\``);
  if (node.minimum !== undefined) c.push(`min ${node.minimum}`);
  if (node.exclusiveMinimum !== undefined) c.push(`min > ${node.exclusiveMinimum}`);
  if (node.maximum !== undefined && node.maximum < 9007199254740991) c.push(`max ${node.maximum}`);
  if (node.minLength) c.push(`non-empty`);
  if (node.pattern) c.push(`pattern \`${node.pattern}\``);
  return c.join(', ');
}

/** Recursively render an object schema as field tables with dotted-path headings. */
function renderObject(node, path, depth, out, seen = new Set()) {
  const refName = node?.$ref;
  if (refName) {
    if (seen.has(refName)) {
      out.push(`${'#'.repeat(Math.min(2 + depth, 5))} \`${path}\``, '', `Recursive structure — same shape as \`${refName.replace('#/$defs/', '')}\` above.`, '');
      return;
    }
    seen = new Set(seen).add(refName);
  }
  if (depth > 4) return;
  node = deref(node);
  if (!node) return;
  const props = node.properties ?? {};
  const required = new Set(node.required ?? []);
  if (Object.keys(props).length === 0) return;
  const heading = '#'.repeat(Math.min(2 + depth, 5));
  out.push(`${heading} \`${path}\``, '');
  if (node.description) out.push(esc(node.description), '');
  out.push('| Field | Type | Required | Constraints |', '|---|---|---|---|');
  const children = [];
  for (const [key, raw] of Object.entries(props)) {
    const child = deref(raw);
    out.push(`| \`${key}\` | ${typeOf(raw)} | ${required.has(key) ? 'yes' : 'no'} | ${constraintsOf(raw) || '—'} |`);
    const rawInner = child?.type === 'array' ? child.items : raw;
    const inner = child?.type === 'array' ? deref(child.items) : child;
    if (inner && (inner.properties || inner.additionalProperties?.properties)) {
      const isMap = !inner.properties;
      const target = isMap ? inner.additionalProperties : rawInner ?? inner;
      const suffix = child?.type === 'array' ? '[]' : isMap ? '.<name>' : '';
      children.push([target, `${path}.${key}${suffix}`]);
    }
  }
  out.push('');
  for (const [child, childPath] of children) renderObject(child, childPath, depth + 1, out, seen);
}

{
  const out = [];
  out.push(`---
title: "Workflow Schema Reference"
description: "Every frontmatter field Cadence validates — types, required flags, enums, constraints."
icon: "list-tree"
---
`);
  out.push(banner('workflow-schema'));
  out.push(
    'This is the **exact contract** Cadence validates `workflow.md` frontmatter',
    'against — generated from the same JSON Schema the validator loads, so it',
    'cannot drift. Use it like `--help` for workflow authoring: every field,',
    'type, required flag, enum, and constraint below is enforceable truth.',
    '',
    'Numeric and boolean fields also accept `{{var}}` template strings,',
    'resolved from workflow `arguments` at dispatch time.',
    '',
    '## Top-level fields',
    '',
    '| Field | Type | Required | Constraints |',
    '|---|---|---|---|',
  );
  const req = new Set(FRONTMATTER_SCHEMA.required ?? []);
  for (const [key, raw] of Object.entries(FRONTMATTER_SCHEMA.properties)) {
    out.push(`| [\`${key}\`](#${key.replaceAll('_', '-')}) | ${typeOf(raw)} | ${req.has(key) ? 'yes' : 'no'} | ${constraintsOf(raw) || '—'} |`);
  }
  out.push('');
  for (const [key, raw] of Object.entries(FRONTMATTER_SCHEMA.properties)) {
    const node = deref(raw);
    const inner = node?.type === 'array' ? deref(node.items) : node;
    if (inner?.properties) renderObject(inner, key + (node?.type === 'array' ? '[]' : ''), 0, out);
  }
  out.push(
    '## Validating',
    '',
    'Validate before dispatch — Cadence rejects invalid frontmatter at load',
    'time. From an agent session, call the `think_workflow_md_validate` tool',
    'with your draft; it returns the same errors this schema produces.',
    '',
  );
  writeFileSync(join(siteRoot, 'harness', 'workflow-schema.mdx'), out.join('\n'));
}

// ═════════════════════════════════════════════════════════════════════════
// 2. runtimes.mdx — per-runtime manual: methods, knobs, starter workflow
// ═════════════════════════════════════════════════════════════════════════

const rts = Object.entries(RUNTIME_CATALOG)
  .map(([key, rt]) => ({ key, ...rt }))
  .sort((a, b) => a.key.localeCompare(b.key));

function starterWorkflow(rt) {
  const am = authorMethods.get(rt.key);
  const method = am?.methods?.[0];
  if (!method) return null;
  return `---
id: starter-${rt.key}
version: 1.0.0
agent:
  runtime_key: ${rt.key}
  provider: ${rt.provider}
  model: ${rt.recommendedModel}
  role: worker
  task_template: "Run {{workflow_id}} for {{issue_ref}}."
  max_turns: 8
  routing_strategy: single_agent_routine
  single_agent:
    select: fixed
    candidates:
      - runtime_key: ${rt.key}
        method: ${method}
budget:
  tokens: 60000
  wall_clock_minutes: 30
sandbox:
  workspace_write: true
tools:
  required:
    - fs.read
    - fs.write
---

# Starter: ${rt.name}

Plan, implement, verify; record evidence before finishing.`;
}

{
  const out = [];
  out.push(`---
title: "Runtimes"
description: "All ${rts.length} runtimes: methods, knobs, requirements, and a starter workflow for each."
icon: "rocket"
---
`);
  out.push(banner('runtimes'));
  out.push(
    'Every runtime is `available`. Select one in workflow frontmatter with',
    '`runtime_key` + `method`. Use [Choosing a method](/harness/cookbook#choosing-a-method)',
    'to decide between `api`, `sdk`, and `cli` routes, and the',
    '[Workflow Schema](/harness/workflow-schema) for every field you can set.',
    '',
    '| Runtime key | Category | Methods | Recommended model | Needs API key |',
    '|---|---|---|---|---|',
  );
  for (const rt of rts) {
    const am = authorMethods.get(rt.key);
    const methods = am?.methods?.length ? am.methods.map((m) => `\`${m}\``).join(', ') : '— (desktop/voice surface)';
    out.push(`| [\`${rt.key}\`](#${rt.key}) | ${rt.category} | ${methods} | \`${rt.recommendedModel ?? '—'}\` | ${rt.requiresApiKey ? 'yes' : 'no'} |`);
  }
  out.push('');
  for (const rt of rts) {
    const am = authorMethods.get(rt.key);
    out.push(`## ${rt.key}`, '');
    out.push(`**${esc(rt.name)}** — ${esc(am?.surface ?? '')}`, '');
    out.push(`**When to use:** ${esc(rt.whenToUse)}`, '');
    const flags = Object.entries(rt.capabilities ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => `\`${k}\``)
      .sort();
    if (flags.length) out.push(`**Capability flags:** ${flags.join(', ')}`, '');
    const knobs = rt.knobs ?? [];
    if (knobs.length) {
      out.push('**Knobs** (set under `harness_config.sdk_settings.' + rt.provider + '`):', '');
      out.push('| Knob | Type | What it does |', '|---|---|---|');
      for (const k of knobs) out.push(`| \`${k.key}\` | ${k.type} | ${esc(k.description)} |`);
      out.push('');
    }
    const wf = starterWorkflow(rt);
    if (wf) {
      out.push('**Starter workflow** (copy, then extend with [snippets](/harness/snippets)):', '');
      out.push('```yaml', wf, '```', '');
    } else {
      out.push(
        '_No turn-dispatch method: this runtime is used through desktop/voice',
        'surfaces, not workflow `method` selection._',
        '',
      );
    }
  }
  writeFileSync(join(siteRoot, 'harness', 'runtimes.mdx'), out.join('\n'));
}

// ═════════════════════════════════════════════════════════════════════════
// 3. capabilities.mdx + providers/*.mdx — capability rows + PARAMETERS
// ═════════════════════════════════════════════════════════════════════════

{
  const total = PROVIDER_FEATURE_CATALOG.length;
  const usable = PROVIDER_FEATURE_CATALOG.filter((x) => USABLE.includes(x.state)).length;
  const deferred = PROVIDER_FEATURE_CATALOG.filter((x) => x.state === 'deferred').length;
  const params = PROVIDER_OPTION_LEDGER.filter((o) => o.audience !== 'hidden').length;

  let c = `---
title: "Capability Catalog"
description: "${usable} of ${total} capability rows usable today, with ${params} documented parameters."
icon: "table"
---

${banner('capabilities')}
The provider feature catalog tracks **${total} capability rows** across four
providers; **${usable} are usable today** and **${deferred} are deferred**.
Alongside the rows, the option ledger documents **${params} parameters** —
the concrete values you can set per capability. Each provider page lists both.

Zero deferred does **not** mean universal implementation. It means no unowned
backlog: every row is usable, policy-blocked, vendor-blocked (sourced +
dated), or unsupported by the vendor.

| Provider | Usable now | Implemented | Model-dependent | Partial-compatible | Parameters | Policy-blocked | Vendor-blocked | Unsupported | Total rows |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
`;
  for (const p of PROVIDERS) {
    const rows = PROVIDER_FEATURE_CATALOG.filter((x) => x.provider === p);
    const s = countBy(rows, 'state');
    const u = USABLE.reduce((n, st) => n + (s[st] ?? 0), 0);
    const np = PROVIDER_OPTION_LEDGER.filter((o) => o.provider === p && o.audience !== 'hidden').length;
    c += `| [${META[p].label}](/harness/providers/${META[p].slug}) | **${u}** | ${s['implemented'] ?? 0} | ${s['model-dependent'] ?? 0} | ${s['partial-compatible'] ?? 0} | ${np} | ${s['policy-blocked'] ?? 0} | ${s['blocked_by_vendor'] ?? 0} | ${s['unsupported'] ?? 0} | ${rows.length} |\n`;
  }
  c += `
## State semantics

| State | Meaning |
|---|---|
| \`implemented\` | Wired end-to-end through deeda primitives and probed. |
| \`model-dependent\` | Works on a documented subset of the provider's models. |
| \`partial-compatible\` | Works under a documented compatibility shape. |
| \`policy-blocked\` | Doc-cited, withheld by deeda policy (e.g. admin surfaces). |
| \`blocked_by_vendor\` | Vendor has not shipped or access-gates it (sourced + dated). |
| \`unsupported\` | The provider does not expose this feature. |

## How to read a provider page

Each feature family shows two things: the **capability rows** you can rely on
(each linked to the vendor's primary documentation), and a **parameters
table** — the exact values you can set, their types, defaults, allowed
values, and risk level. Parameters with \`risk: high\` typically require
elevated workflow policy (see [tool_policy / sandbox](/harness/workflow-schema#tool-policy)).
`;
  writeFileSync(join(siteRoot, 'harness', 'capabilities.mdx'), c);
}

mkdirSync(join(siteRoot, 'harness', 'providers'), { recursive: true });
const STATE_BADGE = { implemented: '', 'model-dependent': ' · *model-dependent*', 'partial-compatible': ' · *partial-compatible*' };

for (const p of PROVIDERS) {
  const rows = PROVIDER_FEATURE_CATALOG.filter((x) => x.provider === p);
  const ledger = PROVIDER_OPTION_LEDGER.filter((o) => o.provider === p && o.audience !== 'hidden');
  const families = [...new Set(rows.map((x) => x.feature_family))].sort((a, b) => a.localeCompare(b));
  const u = rows.filter((x) => USABLE.includes(x.state));
  const out = [];
  out.push(`---
title: "${META[p].label}"
description: "${u.length} usable capability rows, ${ledger.length} documented parameters."
---
`);
  out.push(banner(`providers/${META[p].slug}`));
  out.push(
    `What you can do with **${META[p].label}** through the harness, by feature`,
    'family: the capability rows you can rely on (linked to vendor docs) and',
    'the **parameters** you can set for each. Configure parameters through the',
    'workflow surfaces described in the [Workflow Schema](/harness/workflow-schema)',
    '— model/turn/budget fields on `agent`, provider knobs under',
    `\`harness_config.sdk_settings.${p}\`, and tool/sandbox policy at top level.`,
    '',
  );
  for (const family of families) {
    const fam = rows.filter((x) => x.feature_family === family);
    const famU = fam.filter((x) => USABLE.includes(x.state));
    const famParams = ledger.filter((o) => o.feature_family === family);
    if (famU.length === 0 && famParams.length === 0) continue;
    out.push(`## ${esc(family)}`, '');
    if (famU.length) {
      out.push(`**Capabilities** (${famU.length}/${fam.length} rows usable):`, '');
      for (const row of [...famU].sort((a, b) => a.id.localeCompare(b.id))) {
        const link = row.docs_url ? ` — [vendor docs](${row.docs_url})` : '';
        out.push(`- \`${row.id}\` (${esc(row.capability)})${STATE_BADGE[row.state] ?? ''}${link}`);
      }
      out.push('');
    }
    if (famParams.length) {
      out.push(`**Parameters** (${famParams.length}):`, '');
      out.push('| Parameter | Type | Default | Allowed | Risk | Notes |', '|---|---|---|---|---|---|');
      for (const o of [...famParams].sort((a, b) => a.id.localeCompare(b.id))) {
        const allowed = o.allowed_values ? o.allowed_values.map((v) => `\`${esc(JSON.stringify(v))}\``).join(', ') : '—';
        const dflt = o.default !== undefined ? `\`${esc(JSON.stringify(o.default))}\`` : '—';
        const note = safeNote(o.notes) || (o.docs_url ? `[docs](${o.docs_url})` : '—');
        // Some ledger rows configure a whole surface rather than one path;
        // fall back to the row id's suffix so the name column is never empty.
        const name = o.parameter_path || o.id.replace(`${o.catalog_row_id}.`, '') || o.id;
        out.push(`| \`${esc(name)}\` | ${o.value_kind} | ${dflt} | ${allowed} | ${o.risk} | ${note} |`);
      }
      out.push('');
    }
  }
  writeFileSync(join(siteRoot, 'harness', 'providers', `${META[p].slug}.mdx`), out.join('\n'));
}

console.log('generated: workflow-schema, runtimes, capabilities, providers/*');
