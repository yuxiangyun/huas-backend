# HUAS Server Agent Guide

## 1. Project Summary
- Name: `huas-server`
- Purpose: Provide a unified backend API for HUAS student services (auth, profile, schedule, grades, e-card).
- Runtime: Bun + TypeScript
- HTTP Framework: Hono
- Database: SQLite + Drizzle ORM

## 2. Quick Start
1. Install dependencies:
   - `bun install`
2. Configure environment:
   - Copy `.env.example` to `.env`
   - Set `JWT_SECRET` before production use
3. Run development server:
   - `bun run dev`
4. Run production server:
   - `bun run start`

## 3. Useful Commands
- `bun run dev`: start with watch mode
- `bun run start`: start server once
- `bun run db:generate`: generate drizzle migration files
- `bun run db:migrate`: apply database migrations
- `bun run db:studio`: open drizzle studio

## 4. Directory Notes
- `src/routes`: API route definitions
- `src/services`: business and upstream integration logic
- `src/auth`: authentication and credential lifecycle
- `src/db`: database connection and schema
- `src/parsers`: upstream response parsing
- `src/middleware`: cross-cutting request middleware
- `data`: local sqlite files (ignored in git)
- `logs`: runtime logs (ignored in git)

## 5. Development Rules
- Keep API response format consistent with `API.md`.
- Keep credential/auth changes aligned with `ARCHITECTURE.md`.
- Do not commit secrets (`.env`) or runtime artifacts (`logs`, `*.db`).
- Prefer small, focused commits with clear messages.
- For new modules, keep route/service/parser responsibilities separated.

## 6. Deployment Reference
- Check `DEPLOY.md` for Docker, PM2, and Nginx deployment instructions.
