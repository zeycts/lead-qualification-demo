# AI Lead Qualification — explainable next steps

A personal TypeScript + Gemini API micro-demo for freelancers offering workflow automation. Incoming inquiries often have different budgets, unclear timing, and missing approval details. This command-line tool turns those details into a priority, visible scoring reasons, and a reply draft for human review.

```text
Incoming lead
    ↓
Extract quoted details (Gemini live / precomputed offline fixtures)
    ↓
Validate schema and verbatim quotes
    ↓
Apply transparent rules → priority + reasons → suggested reply
```

No frontend, database, CRM integration, deployment, or automatic message sending.

## Quick start: offline and free of API calls

Requirements: **Node.js 22+** and **pnpm 10** (package manager version pinned in `package.json`). In a Bash terminal inside your clone:

```bash
pnpm install --frozen-lockfile
pnpm showcase
pnpm test
pnpm typecheck
```

Installation downloads dependencies. After installation, showcase, demo, tests, and typecheck do not call Gemini. `pnpm showcase` gives a compact walkthrough of three **synthetic** examples: **100/high, 45/medium, 0/low**. Offline extraction is explicitly **precomputed**, not AI inference; scoring and replies are computed at runtime.

For full diagnostics or copyable JSON:

```bash
pnpm demo
pnpm exec tsx src/cli.ts demo --json
```

See [`examples/offline-output.json`](examples/offline-output.json) for the synthetic examples and full result schema.

## Example: ask only for what is missing

**Synthetic input** (the medium offline fixture):

> We are exploring invoice follow-up automation. We have $1,500 USD for an initial experiment. The launch date is not decided. I cannot approve the budget; my manager decides.

**Selected output fields** (excerpt, not the full result):

```json
{
  "normalized": {
    "budgetUsd": 1500,
    "timelineDays": null,
    "decisionMaker": false
  },
  "score": 45,
  "priority": "medium",
  "suggestedReply": "Thanks for reaching out. Do you have a target launch date in mind?"
}
```

Reasons: service fit **+30**, budget **+15**, unknown timeline **+0**, requester approval authority **+0**. The manager is already identified, so the draft does not ask that question again. Complete automation inquiries get a text-first scope question; an explicit brochure-website request gets a clear workflow-automation scope response.

## Optional explicit Gemini live mode

Live integration has been tested with synthetic inputs. This is not a model-quality or production-reliability benchmark. No raw live captures, credentials, videos, or local logs are published here.

Copy the **blank-key template** and edit it privately on your own machine:

```bash
cp .env.example .env
# Fill GEMINI_API_KEY in .env locally; do not paste it into terminal commands.
# GEMINI_MODEL is optional; the template specifies the default model.
```

Never commit `.env` or a real key. This project does not automatically load `.env`. To explicitly load it and send a synthetic inquiry to Gemini:

```bash
printf '%s\n' 'I need lead routing automation. Budget: $5,000 USD. Pilot within 21 days. I approve the budget.' \
  | node --env-file=.env --import tsx src/cli.ts live
```

Alternatively, `pnpm live` reads `GEMINI_API_KEY` and optional `GEMINI_MODEL` from an already configured process environment; it does not load `.env` itself. Default model: `gemini-3.5-flash-lite`; `GEMINI_MODEL` accepts a bare Gemini model ID, not a URL. Check current [model availability](https://ai.google.dev/gemini-api/docs/models), [pricing and quotas](https://ai.google.dev/gemini-api/docs/pricing), and [terms](https://ai.google.dev/gemini-api/terms) for your account before use. Availability, cost, and quotas are not guaranteed by this repository.

Live mode transmits input to Google. Use synthetic input, not confidential client information. Successful live stdout intentionally includes extracted quotes: do not publish identifying inputs or outputs. Provider failures suppress raw response bodies and credentials. Requests use a fixed Gemini host, a 20-second timeout, no retries, no redirects, and no offline fallback.

## Inspectable, illustrative rules

| Evidence | Points |
| --- | ---: |
| Service quote contains the whole word `automation` | 30 |
| USD budget at least $3,000 / at least $1,000 / lower | 30 / 15 / 0 |
| Timeline from 7 to 30 days inclusive | 20 |
| Exact requester quote `I approve the budget` | 20 |

High: **70+**; medium: **40–69**; low: **below 40**. These thresholds need confirmation for the particular business. Unknown facts earn zero evidence points, not an automatic rejection.

Strict schemas require exactly four nullable extraction fields. Every populated quote must occur verbatim in the input. Supported normalization is deliberately narrow: USD amounts such as `$5,000 USD`, timelines such as `within 21 days`, and specific approval statements. A manager approving the budget does not prove whether the requester also has authority.

## Verification and limitations

The test suite covers scoring boundaries, missing/invalid data, verbatim grounding, reply behavior, CLI handling, and mocked Gemini success/failure cases. Provider tests are offline mocks, not paid inference. The clean publication build passed **59 offline tests, 0 failed**, plus typecheck and showcase. Run the commands above to obtain the current test count.

- **Personal demonstration**, not paid client delivery or measured client results.
- **Synthetic fixtures**; offline extraction is precomputed. Optional live mode uses real Gemini extraction, while scoring and reply drafting remain deterministic.
- Quote grounding does not establish correct interpretation or field selection. Keyword matching cannot reliably understand negation.
- No CRM connection, conversion metrics, production-readiness guarantee, or automatic sending.
- Human review and representative/adversarial evaluation are needed before business use. Drafts make no pricing or delivery commitments.

## Project layout

- `src/cli.ts`: offline demo, showcase, and explicit live command
- `src/core.ts`: strict validation, normalization, scoring, and reply drafts
- `src/provider.ts`: native Gemini `generateContent` adapter
- `src/fixtures.ts`: manually authored synthetic inputs and precomputed extraction
- `test/`: offline rule, CLI, reply, and mocked provider tests
- `examples/offline-output.json`: synthetic input/output examples

No open-source license is granted merely by making this repository public; no license file is included.
