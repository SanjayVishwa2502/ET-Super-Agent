# ET Super Agent

ET Super Agent is a full-stack AI-assisted personal finance project with a React frontend and an Express + TypeScript backend.

This README is focused on local setup and implementation for developers.

## Project Layout

ET Hackathon/
- et-super-agent/
  - backend/
  - frontend/
- README.md
- FEATURES_IMPLEMENTED.txt

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Axios, Tailwind CSS
- Backend: Node.js, Express, TypeScript, LangGraph, Zod
- Data: Vercel KV/Upstash (when configured) with JSON fallback + mock repositories (users, articles, products)
- Optional LLM providers: OpenRouter, Groq, Hugging Face, Local Ollama

## Prerequisites

- Node.js 18+ (recommended 20+)
- npm 9+
- Git

## Local Setup

### 1. Open the workspace root

```bash
cd "C:\Projects\ET Hackathon"
```

### 2. Create backend environment file (one-time)

Create environment file from template:

Windows PowerShell:
```powershell
Copy-Item "et-super-agent/backend/.env.example" "et-super-agent/backend/.env"
```

macOS/Linux:
```bash
cp et-super-agent/backend/.env.example et-super-agent/backend/.env
```

Important:
- Keep backend `PORT=4040` in `.env` (frontend proxy expects this).
- If you do not want to use external model providers, set `USE_LLM=false`.

### 3. Install dependencies for backend + frontend (one-time)

```bash
npm install
npm run install:all
```

### 4. Run both apps with one command

```bash
npm run dev
```

App URLs:
- Backend: http://localhost:4040
- Frontend: http://localhost:3000

Note:
- Open the app in the browser at http://localhost:3000.
- If you open http://localhost:4040 directly, seeing `Cannot GET /` is expected because backend serves API routes under `/api/*`.

## Build and Run

### Backend (production-style)

```bash
cd "C:\Projects\ET Hackathon\et-super-agent\backend"
npm run build
npm start
```

### Frontend (production-style)

```bash
cd "C:\Projects\ET Hackathon\et-super-agent\frontend"
npm run build
npm run preview
```

## Quick API Verification

After both servers are running:

- Health check: GET http://localhost:4040/api/health
- Dashboard payload: GET http://localhost:4040/api/dashboard/news
- Validation scenarios: GET http://localhost:4040/api/validation/run-scenarios

`GET /api/health` now also reports `profileStore.mode`:
- `kv`: persistent database-backed storage configured.
- `tmp-file`: ephemeral fallback in serverless environment.
- `file`: local file-based storage.

`GET /api/health` also reports `sessionStore.mode`:
- `kv`: durable session retrieval across serverless instances.
- `memory`: in-memory fallback only (ephemeral).

## Production Account Persistence

For stable account login/signup persistence in production, configure Vercel KV (or Upstash Redis REST) for backend profile storage:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- Optional: `PROFILE_STORE_KEY` (default `et-super-agent:profiles:v1`)
- Optional aliases supported: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Optional session controls: `SESSION_STORE_PREFIX`, `SESSION_TTL_SECONDS`

If KV is not configured, backend falls back to file storage. In serverless environments this fallback can be ephemeral, so users may need to re-register after cold starts/redeploys.

Behavior memory:
- Chat messages now update a persisted behavior document per profile (keywords, inferred traits, summary, and recent signals).
- This document is returned in profile payloads to improve account-level awareness over time.

## Core Source Locations

Backend:
- API setup: et-super-agent/backend/src/app.ts
- Server entry: et-super-agent/backend/src/index.ts
- Routes: et-super-agent/backend/src/routes/
- Orchestration graph: et-super-agent/backend/src/orchestration/graph.ts
- Prompt templates: et-super-agent/backend/src/services/llmPrompts.ts
- Lens extraction service: et-super-agent/backend/src/services/lensExtractionService.ts
- Tool engines: et-super-agent/backend/src/tools/
- Persistence: et-super-agent/backend/src/store/

Frontend:
- Main application: et-super-agent/frontend/src/App.tsx
- Frontend types: et-super-agent/frontend/src/types.ts
- Vite config and API proxy: et-super-agent/frontend/vite.config.ts

## Troubleshooting

Backend does not start:
- Re-run `npm install` in backend.
- Run `npm run build` to identify TypeScript issues.
- Ensure port 4040 is free.

Frontend cannot call backend:
- Confirm backend is running on 4040.
- Confirm Vite proxy target is http://localhost:4040.

Seeing `Cannot GET` in browser:
- `Cannot GET /` on backend URL is normal behavior.
- Use http://localhost:3000 for UI and http://localhost:4040/api/health for backend verification.

LLM/provider errors:
- Set `USE_LLM=false` to run deterministic fallback mode.
- Or configure at least one provider key in backend `.env`.

## Security Notes

- Do not commit `.env` secrets.
- Use `.env.example` as the safe onboarding template.
- Rotate exposed keys before public sharing if required.
