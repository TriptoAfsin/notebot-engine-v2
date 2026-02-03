# NoteBot Engine V2

Backend API server for BUTEX NoteBot - serves academic notes, lab reports, question banks, routines, and results for textile engineering students.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL (via Drizzle ORM)
- **Cache:** Redis (via ioredis)
- **Docs:** Swagger UI at `/api-docs`

## Getting Started

```bash
# Install dependencies
npm install

# Copy env file and fill in values
cp .env.example .env

# Run database migrations
npx drizzle-kit push

# Start development server
npm run dev
```

The server runs on `http://localhost:8969` by default.

## Environment Variables

See `.env.example` for all required variables:

- `DATABASE_PUBLIC_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `PORT` - Server port (default: 8969)
- Facebook Messenger webhook tokens (for chatbot)

## API Documentation

Interactive Swagger docs available at `/api-docs` when the server is running.

### REST API (`/api/v1/`)

| Endpoint | Description |
|---|---|
| `GET /api/v1/levels` | All academic levels |
| `GET /api/v1/levels/:levelId/subjects` | Subjects for a level |
| `GET /api/v1/subjects/:subjectId/topics` | Topics for a subject |
| `GET /api/v1/topics/:topicId/notes` | Notes for a topic |
| `GET /api/v1/labs/:levelId` | Lab subjects for a level |
| `GET /api/v1/labs/:levelId/:subject` | Lab topics |
| `GET /api/v1/labs/:levelId/:subject/:topic` | Lab items |
| `GET /api/v1/routines` | All routines |
| `GET /api/v1/results` | All results |
| `GET /api/v1/question-banks/:levelId` | Question banks |

### Compat API (`/app/`)

Backward-compatible endpoints matching the V1 API format. Used by the mobile app and Messenger bot.

| Endpoint | Description |
|---|---|
| `GET /app/notes` | Note levels |
| `GET /app/notes/:level` | Subjects for level |
| `GET /app/notes/:level/:subject` | Topics for subject |
| `GET /app/notes/:level/:subject/:topic` | Notes (leaf) |
| `GET /app/labs` | Lab levels |
| `GET /app/labs/:level` | Lab subjects |
| `GET /app/labs/:level/:subject` | Lab topics |
| `GET /app/labs/:level/:subject/:topic` | Lab items (leaf) |
| `GET /app/jokes` | Random joke |
| `POST /app/tex-gpt` | AI-powered search |

## Project Structure

```
src/
  config/         # DB, Redis, Swagger config
  controllers/    # Route handlers
  db/
    schema/       # Drizzle ORM table definitions
  middlewares/    # Error handler, validation
  routes/         # Express route definitions
  services/       # Business logic + caching layer
  scripts/        # Migration and utility scripts
  server.ts       # Entry point
```

## Scripts

```bash
npm run dev       # Start with nodemon (hot reload)
npm run start     # Start in production mode
```

### Utility Scripts

```bash
npx tsx src/scripts/migrate-v1-data.ts    # Migrate data from V1
npx tsx src/scripts/sync-v1-compat.ts     # Sync V1 API responses for compat layer
npx tsx src/scripts/flush-cache.ts        # Clear all Redis cache
npx tsx src/scripts/seed.ts               # Seed initial data
```

### Contact me at: <a href="mailto:afsintripto@gmail.com">AfsinTripto@gmail.com</a>
