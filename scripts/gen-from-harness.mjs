/**
 * Generate harness data pages (runtimes, capabilities, per-provider) for the
 * public docs from the deedaThink harness SSOTs. These pages OWN NO TRUTH —
 * they are projections of the runtime catalog and provider feature catalog.
 *
 * Usage: node scripts/gen-from-harness.mjs [path-to-deedaThink]
 * Requires deedaThink's `npm run build` to have produced dist/.
 *
 * Redaction: no absolute host paths, no env values, no secrets. Only public
 * vendor docs URLs (docs_url) and catalog row metadata are emitted.
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
const driftMatrix = JSON.parse(
  readFileSync(join(harnessRoot, 'cadence/priv/provider-drift-matrix.json'), 'utf8'),
);
const methodsByRuntime = new Map(
  driftMatrix.runtimes.map((r) => [r.runtime_key, [...(r.supported_provider_methods ?? [])].sort()]),
);

/** Escape text destined for MDX prose/tables. */
const esc = (s) =>
  String(s ?? '')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('<', '&lt;')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ')
    .trim();

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
  `{/* GENERATED (${page}) — do not edit by hand. Regenerate with: node scripts/gen-from-harness.mjs */}\n`;

// ── runtimes.mdx ─────────────────────────────────────────────────────────────
const rts = Object.entries(RUNTIME_CATALOG)
  .map(([key, rt]) => ({ key, ...rt }))
  .sort((a, b) => a.key.localeCompare(b.key));

let r = `---
title: "Runtimes"
description: "All ${rts.length} harness runtimes are available. Pick by capability, not brand."
icon: "rocket"
---

${banner('runtimes')}
Every runtime in the catalog is \`available\`. A workflow selects one with
\`runtime_key\` + \`method\` (author-facing methods: \`api\`, \`sdk\`, \`mcp\`,
\`cli\`, \`desktop_app\` — see [Workflow Markdown](/harness/workflow-markdown)).

| Runtime key | Name | Provider | Category | Recommended model | Needs API key |
|---|---|---|---|---|---|
`;
for (const rt of rts) {
  r += `| \`${rt.key}\` | ${esc(rt.name)} | ${rt.provider} | ${rt.category} | \`${rt.recommendedModel ?? '—'}\` | ${rt.requiresApiKey ? 'yes' : 'no'} |\n`;
}
r += `\n## When to use which runtime\n\n`;
for (const rt of rts) {
  r += `**\`${rt.key}\`** — ${esc(rt.whenToUse)}\n\n`;
}
r += `## Capability flags\n\n| Runtime key | Flags (true) |\n|---|---|\n`;
for (const rt of rts) {
  const flags = Object.entries(rt.capabilities ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => `\`${k}\``)
    .sort();
  r += `| \`${rt.key}\` | ${flags.join(', ') || '—'} |\n`;
}
writeFileSync(join(siteRoot, 'harness', 'runtimes.mdx'), r);

// ── capabilities.mdx (overview) ──────────────────────────────────────────────
const total = PROVIDER_FEATURE_CATALOG.length;
const usable = PROVIDER_FEATURE_CATALOG.filter((x) => USABLE.includes(x.state)).length;
const deferred = PROVIDER_FEATURE_CATALOG.filter((x) => x.state === 'deferred').length;

let c = `---
title: "Capability Catalog"
description: "${usable} of ${total} capability rows are usable today — ${deferred} deferred."
icon: "table"
---

${banner('capabilities')}
The provider feature catalog tracks **${total} capability rows** across four
providers. **${usable} rows are usable today** — implemented end-to-end, or
usable with a documented model/compatibility caveat. **${deferred} rows are
deferred.** Every remaining row is in an explicit, audited terminal state.

Zero deferred does **not** mean universal implementation. It means no unowned
backlog: each row is usable, policy-blocked, vendor-blocked (sourced + dated),
or unsupported by the vendor.

| Provider | Usable now | Implemented | Model-dependent | Partial-compatible | Policy-blocked | Vendor-blocked | Unsupported | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
`;
for (const p of PROVIDERS) {
  const rows = PROVIDER_FEATURE_CATALOG.filter((x) => x.provider === p);
  const s = countBy(rows, 'state');
  const u = USABLE.reduce((n, st) => n + (s[st] ?? 0), 0);
  c += `| [${META[p].label}](/harness/providers/${META[p].slug}) | **${u}** | ${s['implemented'] ?? 0} | ${s['model-dependent'] ?? 0} | ${s['partial-compatible'] ?? 0} | ${s['policy-blocked'] ?? 0} | ${s['blocked_by_vendor'] ?? 0} | ${s['unsupported'] ?? 0} | ${rows.length} |\n`;
}
c += `
## State semantics

| State | Meaning |
|---|---|
| \`implemented\` | Wired end-to-end through deeda primitives and probed. |
| \`model-dependent\` | Works on a documented subset of the provider's models. |
| \`partial-compatible\` | Works under a documented compatibility shape. |
| \`policy-blocked\` | Doc-cited, withheld by deeda policy (e.g. admin surfaces). |
| \`blocked_by_vendor\` | Vendor has not shipped or access-gates it; every row cites a primary source URL and an ISO checked date. |
| \`unsupported\` | The provider does not expose this feature. |

Per-provider showcases list every usable capability:
[Anthropic](/harness/providers/anthropic), [Gemini](/harness/providers/gemini),
[Local](/harness/providers/local), [OpenAI](/harness/providers/openai).
`;
writeFileSync(join(siteRoot, 'harness', 'capabilities.mdx'), c);

// ── per-provider pages ───────────────────────────────────────────────────────
mkdirSync(join(siteRoot, 'harness', 'providers'), { recursive: true });
for (const p of PROVIDERS) {
  const rows = PROVIDER_FEATURE_CATALOG.filter((x) => x.provider === p);
  const families = [...new Set(rows.map((x) => x.feature_family))].sort((a, b) => a.localeCompare(b));
  const u = rows.filter((x) => USABLE.includes(x.state));
  let m = `---
title: "${META[p].label}"
description: "${u.length} of ${rows.length} catalog rows usable today."
---

${banner(`providers/${META[p].slug}`)}
Everything you can do with **${META[p].label}** through the deeda harness,
grouped by feature family. Caveats are inline; rows without a caveat are
implemented end-to-end and probed.

`;
  for (const family of families) {
    const fam = rows.filter((x) => x.feature_family === family);
    const famU = fam.filter((x) => USABLE.includes(x.state));
    if (famU.length === 0) continue;
    m += `### ${esc(family)} (${famU.length}/${fam.length} usable)\n\n`;
    for (const row of [...famU].sort((a, b) => a.id.localeCompare(b.id))) {
      const caveat =
        row.state === 'implemented' ? '' : ` — *${row.state}*${row.state_reason ? `: ${esc(row.state_reason)}` : ''}`;
      m += `- \`${row.id}\` (${esc(row.capability)})${caveat}\n`;
    }
    m += '\n';
  }
  writeFileSync(join(siteRoot, 'harness', 'providers', `${META[p].slug}.mdx`), m);
}

console.log('generated: harness/runtimes.mdx, harness/capabilities.mdx, harness/providers/*.mdx');
