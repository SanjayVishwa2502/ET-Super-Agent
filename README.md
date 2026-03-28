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
- Data: JSON profile persistence + mock repositories (users, articles, products)
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

### 2. Backend setup

```bash
cd et-super-agent/backend
npm install
```

Create environment file from template:

Windows PowerShell:
```powershell
Copy-Item .env.example .env
```

macOS/Linux:
```bash
cp .env.example .env
```

Important:
- Keep backend `PORT=4040` in `.env` (frontend proxy expects this).
- If you do not want to use external model providers, set `USE_LLM=false`.

Run backend in development mode:

```bash
npm run dev
```

Backend URL:
- http://localhost:4040

### 3. Frontend setup

Open a new terminal:

```bash
cd "C:\Projects\ET Hackathon\et-super-agent\frontend"
npm install
npm run dev
```

Frontend URL:
- http://localhost:3000

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

LLM/provider errors:
- Set `USE_LLM=false` to run deterministic fallback mode.
- Or configure at least one provider key in backend `.env`.

## Security Notes

- Do not commit `.env` secrets.
- Use `.env.example` as the safe onboarding template.
- Rotate exposed keys before public sharing if required.
