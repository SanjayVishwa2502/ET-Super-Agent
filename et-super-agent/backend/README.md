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

## Next phase
- Add Knowledge Graph JSON service
- Add Recommendation Agent node and ranking logic
- Add compare endpoint implementation
