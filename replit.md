# MediSafe — Drug Safety Checker

## Overview

MediSafe is a drug safety checker web app for Indian patients. It lets patients:
1. Create a profile with medical history, allergies, and current medications
2. Add new medications via search, photo upload, or manual entry
3. Get instant safety checks — banned FDC detection + drug interaction analysis
4. Get dosage guidance for their condition

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: MongoDB + Mongoose
- **Authentication**: Passport.js (JWT + Local strategy)
- **Validation**: express-validator
- **Async handling**: express-async-handler
- **Build**: esbuild (ESM bundle via build.mjs)
- **AI**: Anthropic Claude SDK (Haiku for checks, Sonnet for OCR)
- **Medicine search**: Fuse.js over CSV (1.5L medicines from 1mg)
- **File upload**: Multer (memory storage)
- **CSV parsing**: csv-parse/sync

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run parseBannedList` — regenerate banned_fdcs.json from PDF

## Architecture

Feature-based module structure under `artifacts/api-server/src/app/`:

```
app/
  auth/          — register + login (JWT)
  patient/       — profile CRUD + medication management
  medicines/     — fuzzy search + image OCR scan
  check/         — 4-layer safety check pipeline
  common/
    helper/      — saltParser, bannedChecker, saltSynonyms
    middleware/  — authenticate (JWT), errorHandler, rateLimiter
    services/    — db (MongoDB), passport, claudeClient, medicineIndex (Fuse.js)
    dto/         — shared TypeScript types
data/
  medicines.csv          — 1.5L medicines from 1mg (loaded into Fuse.js at startup)
  salt_synonyms.json     — salt name normalization map
  banned_fdcs.json       — 517 banned FDC entries (generated from Ministry of Health PDF)
```

## Check Pipeline (4 Layers)

1. **Banned check** — instant offline lookup against banned_fdcs.json (gazette reference)
2. **Interaction check** — OpenFDA API first, fallback to Claude Haiku
3. **Safety advice conflict** — Liver/Kidney UNSAFE cross-check from CSV data
4. **Dosage guidance** — Claude Haiku one-sentence dosage for patient's age/conditions

## API Endpoints

```
POST /api/auth/register
POST /api/auth/login
GET  /api/patient/profile              (auth required)
PUT  /api/patient/profile              (auth required)
POST /api/patient/medications          (auth required)
DELETE /api/patient/medications/:medId (auth required)
GET  /api/medicines/search?q=...
POST /api/medicines/scan               (multipart image)
POST /api/check                        (auth required)
```

## Environment Variables Required

- `ANTHROPIC_API_KEY` — for Claude API calls (interaction checks + OCR)
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — JWT signing secret
- `PORT` — assigned automatically by Replit
- `MEDICINES_CSV_PATH` — optional, defaults to `data/medicines.csv`

## Data Files

- `scripts/src/parseBannedList.ts` — one-time setup script: parses Ministry of Health PDF → banned_fdcs.json
- `scripts/src/parseBannedListFinal.ts` — continuation script for remaining chunks

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
