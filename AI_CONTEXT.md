# AI Context — MediSafe

> **For AI assistants (Claude / Cursor / Copilot / GPT / etc.):** read this file before exploring the codebase. It captures the architecture, prompt design, database schema, and known gotchas so you don't have to re-derive them from scratch. Last refreshed: 2026-04-25.

---

## 1. What this project is

**MediSafe** — drug-safety checking system for Indian patients. A user enters or scans medicines; the backend checks for pairwise interactions, banned FDC (fixed-dose combination) combos under Indian regulation, organ burden, and dietary issues. All explanations are written in plain English for caregivers without medical background.

Indian context matters: banned-FDC gazette references, salt synonyms (paracetamol/acetaminophen), and tone tuned for non-medical readers. Don't suggest US/EU regulatory frames.

---

## 2. Stack & layout

- **Monorepo:** pnpm workspaces (`pnpm@9.4.0`), Node 22 in CI, Node 25 locally.
- **Backend** (`artifacts/api-server/`): Express 5 + Mongoose (MongoDB Atlas) + Passport JWT. esbuild bundles to ESM `dist/index.mjs`.
- **Frontend** (`artifacts/medisafe-web/`): Vite 7 + React 19 + Wouter routing + TanStack Query + Radix/shadcn UI + Tailwind 4.
- **AI:** `@anthropic-ai/sdk` (Claude Haiku 4.5 default; Sonnet 4.6 for report extraction) + `@google/generative-ai` (Gemini Flash for image OCR).
- **External APIs:** OpenFDA labels, NLM RxNav interaction API.
- **Drizzle ORM** lives in `lib/db/` but the schema is empty — placeholder, not in use. Don't assume Postgres exists.

```
artifacts/
  api-server/      Express backend; src/app/{auth,check,medicines,patient}/
  medisafe-web/    React SPA (login/register/dashboard/check/profile/add-medicine)
  mockup-sandbox/  Standalone mockups, not wired into main flow
lib/
  api-spec/           OpenAPI source + orval.config.ts
  api-zod/            Zod schemas (generated from OpenAPI)
  api-client-react/   Orval-generated React Query hooks + custom-fetch
  db/                 Drizzle Postgres setup — schema empty (placeholder)
scripts/           post-merge.sh + tooling
```

### Dev commands (from repo root)

```bash
pnpm install                                       # one-time
pnpm --filter @workspace/api-server dev            # API on :8080
pnpm --filter @workspace/medisafe-web dev          # web on :5173
```

Vite proxies `/api` to whatever `artifacts/medisafe-web/vite.config.ts:54` `target` says. Currently a devtunnels HTTPS URL — for local dev change it to `http://localhost:8080`.

### Env (`.env` at repo root)

API server reads via `node --env-file=../../.env`, so `.env` MUST live at repo root, not inside `artifacts/api-server/`.

```
DATABASE_URL / MONGODB_URI    Mongo Atlas connection (drug DB)
JWT_SECRET                    Passport JWT secret
GEMINI_API_KEY                Primary image scanner
ANTHROPIC_API_KEY             Claude
PORT                          API server port (8080)
```

### Deploy

- **API:** `.github/workflows/deploy-api.yml` builds with esbuild, SCPs `dist/` + `package.json` + `ecosystem.config.cjs` to AWS EC2; PM2 (`medisafe-api`, fork mode, 512 MB cap) runs it.
- **Frontend:** Vercel. Recent commits all about routing/proxy fixes — `vercel.json` rewrites are touchy.

---

## 3. The core flow — `POST /api/check`

This is the product. When debugging AI behavior, severity, or "why did it call Claude / not call Claude", look here first.

**Endpoint:** `POST /api/check` (auth required). Body: `{ medicines: string[] }` (min 2). Patient context (conditions, age) pulled from JWT-identified patient.

**Implementation:** `artifacts/api-server/src/app/check/check.service.ts:218-419` (`performCheck`).

### Pipeline

1. **Patient resolution** — fetch patient; default `age=30` if missing (silent — see gotchas).
2. **Medicine lookup** — for each brand, search `Medicine` collection; extract `composition` → `parseSalts()` (applies `salt_synonyms.json`).
3. **Banned FDC check** — `checkBanned(allSalts)` against `banned_fdcs.json` (4668 entries). On hit:
   - severity `severe`, status `banned`
   - Claude generates the *why* (cached in `BannedExplanation` keyed by sorted-salts hash)
   - Claude generates dosage guidance
   - Returns gazette reference
4. **Pairwise interaction check** — for each (a,b) pair, run **3 layers**, stop at first hit but track worst severity:
   - **Layer 1 — OpenFDA** (`checkOpenFDA`): hit → severity `mild`, source `openFDA`. Claude only for alternatives.
   - **Layer 2 — RxNav/NLM** (`rxnavClient`): normalize via `rxnorm_names.json`, resolve RxCUIs (cached `RxCuiCache`), query interaction API (cached `RxNavCache` by sorted pair hash). Severity map: low→mild, moderate→moderate, high→severe. Claude only for alternatives.
   - **Layer 3 — Claude fallback**: only runs if previous layers found nothing. Returns `{interacts, severity, reason, problem, alternatives}`.
5. **Organ burden** — fires only if **both** medicines have `safety_advice.Liver='UNSAFE'` (or both Kidney) AND no interaction was found above. Hardcoded `moderate` severity.
6. **Persist** — write `CheckHistory` doc.
7. **Return** `{ safe, summary, results: CheckResultItem[], aiCosts: AiCost[] }`. `aiCosts` tracks every Claude/Gemini call for transparency/billing — user-visible, don't strip.

### Severity escalation rule

The pipeline tracks worst severity per pair across layers. Later layers can only **upgrade** severity, never downgrade. So a Layer-1 `mild` hit will not be replaced by a Layer-3 `mild` finding, but *would* be replaced by a Layer-2 `severe`.

**When debugging "this should be severe but I see mild":** check whether OpenFDA returned a hit before RxNav got a chance.

### Cost-optimization design

OpenFDA → RxNav → Claude order is deliberate: cheapest sources first, paid LLM last. **Don't reorder layers** without considering AI cost; if Layer-1 false positives are an issue, fix the matcher, don't fall through to Claude.

### Adjacent endpoints

- `POST /api/medicines/scan` — Multi-stage scan pipeline:
  1. **Gemini cascade** (`GEMINI_MODELS` env, default `gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.0-flash → gemini-flash-latest`) — first model that doesn't 404/429 wins. `responseMimeType: 'application/json'`, `temperature: 0`, 18s timeout (`GEMINI_TIMEOUT_MS`).
  2. If all Gemini models fail → **Claude Haiku** fallback (`temperature: 0`).
  3. If `kind === 'prescription'` → **Sonnet 4.6 upgrade pass** for better handwriting OCR. Replaces medicines, keeps original kind.
  4. **Fuzzy snap-to-known-brand**: each unmatched extraction is fuzzy-matched (Fuse.js, threshold 0.4) against the `Medicine` collection. Matches above threshold are auto-corrected and surfaced in `corrections: [{original, corrected, score}]`. The fuzzy index is built lazily and cached for 10 min.
  5. **Skip Claude fallback** when Gemini classifies as `not_medicine` or `unclear` (trust Gemini, save tokens).
  
  No auth required (gotcha — anyone can burn Gemini/Claude quota).
  Returns `{ kind, message?, extracted, corrections, matched, unmatched, aiCosts }` where `kind ∈ {medicine_label, prescription, not_medicine, unclear}`.
- `GET /api/medicines/search` — Mongo text search + regex fallback. **No auth required.**
- `GET /api/medicines/dietary-advice/:name` — Claude returns foods/lifestyle to avoid (cached `DietaryAdvice`).
- `POST /api/medicines/combined-dietary-advice` — multi-medicine dietary plan (cached `CombinedDietaryAdvice` by sorted-medicines hash).
- `POST /api/patient/report` — multer memory storage, 15 MB cap. Claude Sonnet vision extracts patient info, conditions, meds, labs, allergies from PDF/image. Returns preview; **no DB write** until user confirms.

### Files to read when debugging

- Pipeline: `check.service.ts:218-419`
- Claude prompts: `check.service.ts:66-79, 153-156, 192-196`
- Gemini prompt: `services/geminiClient.ts:28-33`
- Banned matcher: `helper/bannedChecker.ts`
- Salt parsing & synonyms: `helper/saltParser.ts`, `helper/saltSynonyms.ts`
- RxNav client: `services/rxnavClient.ts`
- Report parsing: `patient/patient.report.service.ts` (esp. lines 81-149 for prompt, 282-301 for JSON repair)

---

## 4. AI prompts (verbatim)

All prompts target **Indian patients/caregivers without medical background** — plain English, no jargon.

### Models

- `HAIKU = claude-haiku-4-5-20251001` — default for interactions/dosage/banned/dietary.
- `REPORT_MODEL = claude-sonnet-4-6` — patient report extraction (vision + structured output).
- `GEMINI_MODEL = gemini-flash-latest` — image scan for medicine names.

### Claude — interaction check (`check.service.ts:66-79`)

```
You are a medicine safety helper writing for patients and caregivers in India who may not have a medical background.
Do {saltA} and {saltB} interact? Patient conditions: {conditions}.
Write in simple, everyday English. Avoid all medical jargon. Use short sentences.
Reply ONLY as valid JSON: { interacts, severity, reason, problem, alternatives }
```

### Claude — dosage guidance (`check.service.ts:153-156`)

```
Write for a patient or caregiver in India. Patient is {age} years old with: {conditions}.
They are taking {brand} ({composition}).
In one simple sentence, explain the usual way to take this medicine — how many times a day and whether to take it before or after food. Use plain everyday language.
```

### Claude — banned-FDC explanation (`check.service.ts:192-196`)

```
You are a medicine safety helper writing for patients and caregivers in India.
The combination of {combination} is banned in India because it is not safe to use together.
In 1-2 simple sentences, explain WHY this combination is not allowed — what harm it could cause. Write as if explaining to someone who is not a doctor. Avoid all medical jargon. No bullet points, no markdown, just plain text.
```

### Gemini / Claude — medicine name scan (`geminiClient.ts` `SCAN_PROMPT`)

Returns a structured envelope, not a bare array. Same prompt is reused for the Claude fallback.

```
You are extracting medicine names from an image. Reply ONLY with a JSON object.

JSON shape:
{
  "kind": "medicine_label" | "prescription" | "not_medicine" | "unclear",
  "medicines": ["Brand 1", "Brand 2"],
  "message": "short user-facing reason — required only when medicines is empty"
}

Classification rules:
- "medicine_label": clear medicine packaging — list every medicine visible.
- "prescription": doctor's Rx — extract ONLY prescribed medicine names; ignore patient/doctor/date/dosage/diagnosis.
- "not_medicine": not a medicine/Rx (e.g. food, person, unrelated doc). medicines=[], message explains.
- "unclear": too blurry/dark/cropped to read. medicines=[], message asks for retake.
```

Parser tolerates the legacy bare-array shape for backwards compat (treats it as `medicine_label`).

### Claude — single-medicine dietary advice (`medicines.service.ts:40-48`)

```
You are a clinical pharmacist. A patient is taking "{medicineName}".
List the foods, drinks, and lifestyle factors they must avoid while taking this medicine.
Respond ONLY as a JSON array [{ category, avoid[], reason }, ...].
Include only categories with actual items. Keep each item concise (2–5 words).
```

### Claude — patient report extraction (`patient.report.service.ts:81-149`)

~149-line structured prompt for Sonnet vision. Returns a single JSON object with:

- `patientInfo` — name, age, gender, bloodGroup
- `conditions` — diagnosed diseases only (not symptoms)
- `medications` — brand + dosage + frequency
- `labResults` — name, value, unit, status, reference range (deduped after parse)
- `conditionInsights` — per-condition foods to eat/avoid + precautions
- `allergies`
- `reportAnalysis` — findings, severity, key recommendations, warnings

**JSON repair fallback** (`patient.report.service.ts:282-301`): if Claude returns malformed JSON, code strips markdown fences, attempts balanced-brace extraction, and finally calls Claude again with a "fix this JSON" prompt. Each repair = extra API cost.

### Tone guardrails (don't break these)

- Keep "India" + "patients/caregivers without medical background" in the system framing — removing it shifts register and breaks downstream copy.
- Keep "Reply ONLY as valid JSON" / "No markdown" — parsers will break otherwise.
- Don't add bullet points to the banned-explanation prompt — output is rendered as a sentence.

---

## 5. Database

All Mongoose collections in the `drug` Atlas database.

### `Medicine` (`models/Medicine.model.ts`)

Seeded from `data/medicines.csv` (~100 rows in repo, real DB has more from 1mg.com scrape) by `initMedicineIndex()` at server start.
- Fields: `url, brand_name, composition, manufacturer, price, safety_advice, uses, benefits, side_effects, substitutes`.
- `safety_advice` is a JSON object with `Liver`/`Kidney` keys taking values like `'UNSAFE'`, `'SAFE'`, `'CAUTION'`. Used by **organ burden** check.
- Indexes: `brand_name`, `composition`, text index across `brand_name + composition + uses`.

### `Patient` (`patient/patient.schema.ts`)

`name, age, gender, bloodGroup, email, passwordHash, allergies[], conditions[], conditionRecords[{condition, precautions, foodsToEat, foodsToAvoid}], currentMedications, labResults, reportSummaries`.

All check requests pull `conditions + age` for AI context.

### `CheckHistory` (`check/check.schema.ts:14-25`)

One doc per `/api/check` call: `{ patientId, checkedAt, newMedicines, existingMedicines, results }`.

### Cache collections

Read this before "rebuilding" the AI flow — the caches are huge cost savings.

- **`BannedExplanation`** — keyed by `combinationHash` (sorted joined salts). Caches Claude-generated banned-combo explanation.
- **`DietaryAdvice`** — keyed by `medicineKey`. Caches per-medicine food advice.
- **`CombinedDietaryAdvice`** — keyed by `medicinesHash` (sorted multi-medicine list). Caches `avoid[], safeToEat[], mealSchedule[], medicineTips[], generalTips[]`.
- **`RxCuiCache`** — `saltKey → rxcui` mapping. **null is stored** when NLM has no match (prevents repeated misses).
- **`RxNavCache`** — keyed by `pairHash` (sorted `cuiA|cuiB`). Caches `{found, description, severity}` from NLM API.

When results "look stale" or wrong, the cache is usually the suspect — check the cached doc before re-running the AI.

### Auth

JWT (Passport-JWT). Token returned from `POST /api/auth/login`, stored in `localStorage` on the frontend, sent in `Authorization: Bearer …` header. `setAuthTokenGetter()` in `api-client-react/custom-fetch.ts` injects it.

---

## 6. Data files (`artifacts/api-server/data/`)

| File | Purpose | Size |
|---|---|---|
| `medicines.csv` | Seed for `Medicine` collection (1mg.com scrape) | ~100 rows in repo |
| `banned_fdcs.json` | Indian Ministry of Health banned FDC combos: `[{ id, combination: [salts], gazette_ref }]` | 4668 lines |
| `salt_synonyms.json` | Maps alt salt names → canonical (e.g. `acetaminophen → paracetamol`) | ~100 entries |
| `rxnorm_names.json` | Maps salts → RxNorm canonical (US naming) for NLM lookup | ~224 entries |

**Why both `salt_synonyms` and `rxnorm_names`:** `salt_synonyms` normalizes for *internal* use (banned check, dedup); `rxnorm_names` translates to *US/NLM* terminology only when calling RxNav.

---

## 7. Gotchas (read these before debugging)

### Behavior surprises

- **Default age = 30** (`check.service.ts:230`). If patient profile has no age, prompts silently substitute 30. Age-sensitive warnings can be wrong without indication.
- **Severity is monotonic upward only.** Later layers can't downgrade earlier hits. A Layer-1 OpenFDA `mild` masks Layer-2 RxNav `mild` in logs.
- **Organ burden only fires when no interaction was found.** Both meds must be `Liver='UNSAFE'` (or both `Kidney='UNSAFE'`). Hardcoded `moderate`.
- **Layer 3 (Claude) is fallback only.** If "Claude didn't run", it's because OpenFDA or RxNav already returned a hit.

### Public endpoints (no JWT required)

- `GET /api/medicines/search`
- `POST /api/medicines/scan` (Gemini call — costs money, no auth gate)
- `POST /api/auth/register`, `POST /api/auth/login`

`POST /api/check`, `/api/patient/*`, `/api/medicines/dietary-advice*` all require auth.

### Env / config quirks

- **`.env` lives at repo root**, not in `artifacts/api-server/`. Move it and the server boots without DB/keys.
- **MongoDB is "optional" at boot** (`index.ts`) — server starts even if `MONGODB_URI` is missing; routes fail at runtime when they hit Mongoose. Loud-fail would be safer.
- **Vite proxy target hardcoded** to a devtunnels HTTPS URL in `artifacts/medisafe-web/vite.config.ts:54`. For local dev: `http://localhost:8080`. Hardcoded HTTPS also causes `unable to get local issuer certificate` on corporate laptops with TLS interception.

### Security

- `.env` at repo root contains live credentials: Mongo Atlas URL with embedded password, Gemini key, Anthropic key, `JWT_SECRET=supersecretpassword123`. If repo was ever pushed to public remote, rotate everything.
- `JWT_SECRET` is a weak literal string.

### Code quirks

- **Drizzle ORM is set up but unused.** `lib/db/` schema is empty. Don't write code assuming Postgres exists.
- **Multer uses memory storage** (`patient.route.ts:23-25`), 15 MB cap. PM2 has 512 MB cap → multiple concurrent uploads can OOM the API.
- **JSON repair via second Claude call** in `patient.report.service.ts:282-301`. Each repair = extra API cost.
- **Cache keys use sorted+joined hashes** for symmetric pairs/sets. Inserting cache rows with unsorted keys creates phantom misses.
- **`aiCosts` array** is returned to frontend on every check — user-visible billing data, don't strip.
- CI uses Node 22, local has Node 25 — version-specific bugs surface in CI only.

---

## 7b. Brand-name resolution (SAFETY-CRITICAL)

All AI-extracted medicine names (from `/medicines/scan` AND `/patient/report`) MUST go through `resolveBrandName()` in `services/medicineIndex.ts`. Never call `searchMedicines(name, 1)[0]` directly and label it `'high'` confidence — Mongo `$text` search returns dissimilar hits (e.g. "Mogilax" → "Risen T" / Risperidone) and labelling them as confident matches has caused dangerous mis-resolutions.

`resolveBrandName()` enforces:
- Mongo direct hit must score ≥0.7 Levenshtein-ratio on normalized brand vs input (after stripping `Tab./Cap./Inj./` prefixes and punctuation). Otherwise discarded.
- Fuse.js fuzzy fallback (score ≤0.4) returns `'medium'` confidence with `corrected` field set so UI can show "Original → Corrected".
- Otherwise null → caller leaves the raw name in `unresolved`/`unmatched`, user opts in.

If you add a new code path that maps an extracted/typed name to a Medicine doc, route it through `resolveBrandName()`. Don't reinvent.

## 8. Conventions for AI assistants editing this codebase

- **Don't add comments** unless the *why* is non-obvious. Well-named identifiers describe *what*.
- **Don't add error handling, fallbacks, or validation** for scenarios that can't happen. Trust internal code; only validate at system boundaries.
- **Don't introduce new abstractions** beyond what the task requires. Three similar lines beats a premature abstraction.
- **Don't reorder the 3 interaction layers** without considering AI cost.
- **Don't break the prompt tone guardrails** (section 4).
- **Don't assume Postgres exists** — Drizzle is a placeholder.
- **Don't strip `aiCosts`** from check responses — it's user-visible.
- **When `.env` changes are needed**, edit at repo root, not inside `artifacts/api-server/`.
