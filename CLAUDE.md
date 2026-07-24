# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**NoteBot Engine v2** — the next-gen backend for the BUTEX (Bangladesh University of Textiles) NoteBot. A Node.js/TypeScript/Express API backed by **PostgreSQL (Drizzle ORM)** and **Redis (ioredis)**. It replaces the flat JS-file content model of `notebot-engine-v1` with a relational database, while a **compat layer** keeps serving the exact v1 response shape so the existing Messenger bot and mobile app keep working during the migration.

The sibling v1 repo (`notebot-engine-v1`, a separate checkout) is still live; v2 is being brought to parity and both are dual-written for a transition window.

## Commands

- `npm run dev` — Start dev server with nodemon + ts-node (hot reload)
- `npm start` — Production start (`ts-node --transpile-only -r tsconfig-paths/register src/server.ts`)
- `npx drizzle-kit push` — Apply schema to the database
- `npx drizzle-kit generate` — Generate SQL migrations from schema
- No test suite exists (`npm test` is a placeholder)
- Server default port: **8969**. Swagger UI at **`/api-docs`**.

### Utility scripts (run with `npx tsx src/scripts/<file>.ts`)

- `migrate-v1-data.ts <path-to-v1-repo>` — One-time bulk import of ALL v1 content into Postgres. Parses v1 title strings for metadata (year, batch, department, term) via `extractMetadata()`.
- `sync-v1-compat.ts` — Calls the **running v1 API** (expects v1 on `http://localhost:6969`) and stores its responses as `metadata` on v2 subjects/levels/topics so the compat layer can return byte-identical v1 output. Matches v1↔v2 topics by **URL overlap** (≥50%).
- `compare-apis.ts` — Diffs v1 vs v2 API responses (parity check).
- `fix-compat-data.ts` — Repairs compat metadata drift.
- `flush-cache.ts` — Clears all Redis cache.
- `seed.ts` — Seeds initial data.

## Architecture

### Entry point

`src/server.ts` boots Express, connects DB + Redis (both non-fatal on failure — server continues), mounts routes, and listens. Route groups (all mounted at `""`): `homePageRoutes`, `chatBotRoutes`, `appRoutes`, `compatRoutes`.

### Path aliases

`tsconfig.json` sets `baseUrl` to `src`, so imports are bare from `src/` — e.g. `import { getDb } from "db/index"`, `import appRoutes from "routes/app.routes"`. Runtime resolution is via `tsconfig-paths/register` (already in the start script). **Match this style — do not use long relative `../../` chains.**

### Two API surfaces

1. **REST API (`/api/v1/*`)** — clean modern endpoints (`getLevels`, `getSubjectsByLevel`, `getTopicsBySubject`, `getNotesByTopic`, labs, routines, results, question-banks). Handlers in `controllers/app/app.controller.ts`.
2. **Compat API (`/app/*`)** — backward-compatible, returns the **exact v1 JSON shape**. Consumed by the Messenger bot and mobile app. Defined in `routes/compat.routes.ts`, powered by v1 metadata synced via `sync-v1-compat.ts`.

There is also `chatbot.controller.ts` (Messenger webhook) and `home-page.controller.ts` (EJS views: `homepage.ejs`, `profile.ejs`).

### Data model (`src/db/schema/`)

Relational hierarchy, all with `metadata jsonb`, `sortOrder`, timestamps:

```
levels ──< subjects ──< topics ──< notes
          (levelId)    (subjectId)  (topicId, title, url, metadata)
```

Plus sibling content tables: `lab-reports`, `question-banks`, `results`, `routines`. Schemas are re-exported from `src/db/schema/index.ts` (this is what `drizzle.config.ts` points at).

- **`levels`**: `name`, `displayName`, `slug` (unique), `sortOrder`.
- **`subjects`**: `levelId` FK, `name`, `displayName`, `slug`, `sortOrder`.
- **`topics`**: `subjectId` FK, `name`, `displayName`, `slug`, `sortOrder`. Compat metadata carries `v1RouteSlug` + `v1DisplayName`.
- **`notes`**: `topicId` FK, `title`, `url` (Google Drive link), `sortOrder`, `metadata` (`{author, batch, year, department, ...}`).

`onDelete: "cascade"` flows down the FK chain.

### Services & caching (`src/services/app/`)

Business logic lives in services (`note.service.ts`, `lab.service.ts`, `question-bank.service.ts`, `result.service.ts`, `routine.service.ts`, `syllabus.service.ts`). Every read is **cache-first** via `cache.service.ts` (Redis). Cache keys: `levels`, `subjects:<levelId>`, `topics:<subjectId>`, `notes:<topicId>`.

> ⚠️ **When writing data, you MUST invalidate the affected cache keys** or reads will serve stale content. `note.service.ts` currently exposes only reads — a create/insert path must also bust `notes:<topicId>` (and any list caches).

### Config & constants

`src/config/` (db, redis, swagger, bot), `src/constants/` (api, errors, secrets). Env via `dotenv`; key vars: `DATABASE_PUBLIC_URL`, `REDIS_URL`, `PORT`, Facebook Messenger tokens, `AUTO_RAG_TOKEN`, `GRAPH_API_URL`. See `.env.example`.

## Conventions

- **TypeScript strict**, Drizzle for all DB access (no raw SQL except in scripts). Use `InferSelectModel<typeof table>` for row types.
- Import via `src`-relative aliases (see above).
- New content tables go in `src/db/schema/` and must be re-exported from `schema/index.ts`.
- Read-through cache on reads; explicit invalidation on writes.
- Keep the **compat `/app/*` output identical to v1** — if you change note/topic serialization, run `compare-apis.ts` against a running v1.

## Note Ingestion Automation

This repo is the DB half of the automated submission pipeline (Google Form → Drive → v1 code PR + v2 DB). The end-to-end design lives in:
- `../notebot-automation/docs/PLAN.md` — the **active cross-repo build plan** (master doc)
- `../notebot-automation/` — the automation home (n8n workflow, `.env`, docs)
- `NoteBot-Note-Pipeline-Automation-Strategy.md` (this repo — original strategy)

Pipeline split: **n8n** (schedule, Sheets, Drive copy→public, Telegram, writes a `submissions` staging row here in Postgres) → **Claude Code agent** (classify + open the v1 PR) → **v2 backend** (authoritative `notes` insert + cache bust, gated on PR merge). New submissions are **dual-written** to v1 files and v2 DB during the transition. See the `note-ingestion` agent in `.claude/agents/`.
