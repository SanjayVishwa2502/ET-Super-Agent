# ET Super Agent Backend (Phase 1)

## Included in this phase
- Express + TypeScript backend scaffold
- `POST /api/session/start`
- `POST /api/chat/message`
- `GET /api/health`
- Minimal LangGraph orchestration path (`InputRouter -> ConciergeAgent -> ResponseComposer`)
- Deterministic fallback when graph invocation fails

## Run locally
1. Install dependencies
   - `npm install`
2. Start dev server
   - `npm run dev`
3. Health check
   - `GET http://localhost:4000/api/health`

## Zero-Cost Intelligence Modes

This backend supports zero-cost operation in two modes:

1. `USE_LLM=false`
   - Fully deterministic intelligence (no model/API dependency).
2. `USE_LLM=true` + `MODEL_PROVIDER=auto`
   - Tries free-tier API providers in order (`openrouter`, `groq`, `huggingface`), then local model.
   - If no provider is available or quota is exhausted, it automatically falls back to deterministic logic.

### Minimal free API setup
Set one key in `.env`:

- `OPENROUTER_API_KEY` (with `OPENROUTER_MODEL=*:*free`), or
- `GROQ_API_KEY`, or
- `HF_TOKEN`

Then call:

- `GET /api/health` to confirm `llm.provider` and `llm.available`.

## Next phase
- Add Knowledge Graph JSON service
- Add Recommendation Agent node and ranking logic
- Add compare endpoint implementation
