# ET Super Agent – Technical Design Document (TDD)

- **Version:** 2.1
- **Date:** 25 March 2026
- **Deadline:** 29 March 2026
- **Mapped PRD:** ET_Super_Agent_PRD.md

## 1. Purpose
Define the technical architecture and implementation approach for the ET Super Agent MVP.

This TDD covers:
- system components
- API contracts
- data models
- recommendation logic
- voice integration path
- deployment approach
- engineering split for a 4-member team

## 2. Solution Summary
The solution is a context-aware AI assistant that receives user context (page + chat), builds persona and intent, and returns ranked recommendations across ET content/tools/events/services.

### Core capabilities
1. **Welcome Concierge** (fast onboarding and persona generation)
2. **Financial Life Navigator** (gap detection + next best action)
3. **Cross-Sell Engine** (contextual partner/service recommendations)
4. **Services Marketplace Agent** (compare cards/loans and explain top options)

## 3. Architecture
## 3.1 High-Level Components
1. **Frontend Web Widget**
   - Embedded chat panel on ET pages
   - Captures page metadata (topic/category/article tags)
   - Optional voice input/output controls

2. **Conversation API Layer**
   - Session management
   - Orchestration between LangGraph agents + rules + knowledge graph
   - Response formatting for UI cards and CTA actions

3. **Recommendation Engine**
   - Persona extractor
   - Gap detector (rules first)
   - Ranking module (weighted scoring)

4. **Knowledge Graph Service (Mock for hackathon)**
   - Serves ET products/events/services dataset
   - Tag-based filtering and retrieval

5. **Voice Service (Optional/Feature Flag)**
   - STT (Whisper API or equivalent)
   - TTS (OpenAI TTS/Azure TTS/equivalent)

6. **Telemetry/Logs**
   - Request latency
   - recommendation clicks
   - fallback/error events

7. **Agent Orchestrator (Minimal Real Multi-Agent Layer)**
   - LangGraph state machine and node routing
   - Tool-enabled agent nodes (KG lookup, compare service, scoring)
   - Deterministic fallback path when LLM/tool fails

## 3.2 Logical Flow
1. User opens ET page -> frontend captures `pageContext`
2. User starts chat -> API creates/loads `session`
3. Orchestrator invokes Concierge Agent node for adaptive questions
4. Navigator Agent derives persona + intents + constraints
5. Recommendation Agent queries KG + ranks results
6. Cross-Sell Agent and Marketplace Agent are conditionally invoked
7. API returns response bundle (message + cards + CTA)
8. Frontend renders cards and logs user actions

## 3.3 Minimal Agent Graph (LangGraph)
The architecture uses a small graph to satisfy real orchestration requirements while staying hackathon-safe.

### Graph nodes
1. **Input Router Node**
   - Classifies turn type: onboarding, recommendation, compare, or follow-up
2. **Concierge Agent Node**
   - Asks strategic questions and updates missing profile fields
3. **Navigator Agent Node**
   - Identifies gaps (inflation risk, tax confusion, debt stress)
4. **Recommendation Agent Node**
   - Retrieves and ranks ET product/tool/event candidates
5. **Cross-Sell Agent Node**
   - Adds contextual partner service suggestions with guardrails
6. **Marketplace Agent Node**
   - Generates compare output for cards/loans
7. **Response Composer Node**
   - Merges outputs into final user-facing response schema

### Graph edges (simplified)
- `Input Router -> Concierge` when profile incomplete
- `Input Router -> Navigator` when profile complete and user asks advice
- `Navigator -> Recommendation`
- `Recommendation -> Cross-Sell` only when intent matches service use-case
- `Input Router -> Marketplace` when compare requested
- Any node failure -> `Fallback Rule Node -> Response Composer`

## 4. Recommended Tech Stack (Hackathon-friendly)
## 4.1 Frontend
- Next.js or React + TypeScript
- Tailwind CSS (fast UI iteration)
- Zustand/Redux Toolkit for session state (lightweight)

## 4.2 Backend
- Node.js + TypeScript (Express/Fastify)
- REST APIs for speed (GraphQL optional later)
- In-memory session store (Map/Redis optional)

## 4.3 AI + Voice
- LLM API (OpenAI/Azure OpenAI compatible)
- LangGraph (minimal orchestration runtime)
- STT: Whisper API (optional)
- TTS: provider TTS (optional)

### 4.3.1 Why LangGraph for this build
- Provides real agent orchestration with explicit state and transitions
- Keeps flows deterministic enough for demo reliability
- Allows gradual evolution from rule-heavy MVP to richer agent autonomy

## 4.4 Data
- Mock KG in JSON files for hackathon
- Optional SQLite/Postgres adapter for phase-2 persistence

## 5. Data Model
## 5.0 Orchestration State Model
```json
{
  "sessionId": "uuid",
  "turnId": "uuid",
  "activeNode": "NavigatorAgent",
  "visitedNodes": ["InputRouter", "ConciergeAgent", "NavigatorAgent"],
  "intent": "tax-planning",
  "requiresCompare": false,
  "requiresCrossSell": true,
  "errors": []
}
```

## 5.1 Session Model
```json
{
  "sessionId": "uuid",
  "userId": "anonymous-or-null",
  "persona": "Conservative Wealth Builder",
  "intents": ["beat inflation", "learn diversification"],
  "riskProfile": "low",
  "pageContext": {
    "topic": "EV",
    "articleId": "et-ev-123",
    "tags": ["tesla", "supply-chain"]
  },
  "history": [],
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

## 5.2 Knowledge Graph Item
```json
{
  "id": "prime-ev-supply-chain",
  "type": "product|event|service|tool",
  "title": "ET Prime: EV Supply Chain Deep Dive",
  "tags": ["ev", "industry", "investing"],
  "audience": ["early-career", "retail-investor"],
  "intentMap": ["sector research", "portfolio diversification"],
  "ctaUrl": "https://...",
  "priority": 0.9
}
```

## 5.3 Recommendation Response
```json
{
  "summary": "Based on your goal to beat inflation, here are next steps.",
  "cards": [
    {
      "id": "rec-1",
      "title": "Explore diversified mutual fund screeners",
      "type": "tool",
      "why": "You hold mostly FDs and asked for inflation protection.",
      "cta": "Open ET Markets",
      "url": "https://..."
    }
  ],
  "confidence": 0.82
}
```

## 6. API Design (MVP)
## 6.1 `POST /api/session/start`
Creates or restores a session.

Request:
```json
{ "pageContext": { "topic": "tax", "tags": ["first-job"] } }
```

Response:
```json
{ "sessionId": "uuid", "nextQuestion": "Congrats on the offer. Are you focused on tax saving or budgeting first?" }
```

## 6.2 `POST /api/chat/message`
Main conversation endpoint (invokes LangGraph orchestrator).

Request:
```json
{ "sessionId": "uuid", "message": "I have most of my money in FDs and worry about inflation." }
```

Response:
```json
{
  "assistantMessage": "Understood. You may benefit from diversified options.",
  "recommendations": [],
  "nextQuestion": "Do you prefer low-risk funds or balanced options?",
  "orchestration": {
    "visitedNodes": ["InputRouter", "NavigatorAgent", "RecommendationAgent", "ResponseComposer"],
    "fallbackUsed": false
  }
}
```

## 6.3 `POST /api/recommendations/compare`
Compares services (cards/loans) based on user profile.

Request:
```json
{ "sessionId": "uuid", "category": "credit-card", "preferences": { "monthlySpend": 40000, "travel": true } }
```

Response:
```json
{ "rankedOptions": [] }
```

## 6.4 `POST /api/voice/stt` (optional)
Audio -> text

## 6.5 `POST /api/voice/tts` (optional)
Text -> audio

## 7. Recommendation Engine Design
## 7.1 Pipeline
1. Input Router classifies user turn
2. Concierge/Navigator nodes update persona and intent state
3. Recommendation node fetches candidates from KG
4. Tool calls run scoring + ranking + compare as needed
5. Response Composer builds final answer and card payload
6. Fallback node handles failures using deterministic rules
7. Return top-N cards with diversity constraints

## 7.2 Rule Layer (MVP deterministic)
Example rules:
- `FD_HEAVY` + `INFLATION_CONCERN` -> suggest diversification tools + Prime education content
- `FIRST_JOB` + `TAX_CONFUSION` -> suggest tax masterclass + tax-saving market tools
- `CREDIT_CARD_DEBT` -> suggest debt consolidation article + relevant service partner option

## 7.3 Scoring Formula (Simple and explainable)
Use weighted sum:

`score = 0.35 * intentMatch + 0.25 * pageContextMatch + 0.20 * personaMatch + 0.10 * businessPriority + 0.10 * freshness`

Where each term is normalized between 0 and 1.

## 7.4 Ranking Constraints
- Top 3 recommendations
- At least one non-service recommendation in top 2
- No duplicate type cards back-to-back unless confidence > 0.9

## 8. Prompting/LLM Strategy
Each agent node has a focused prompt contract rather than one large generic prompt.

Suggested node prompts:
- Concierge Agent: ask 1 high-value profiling question per turn
- Navigator Agent: infer gap and risk label from recent turns
- Recommendation Agent: return 3 diverse cards with reason codes
- Marketplace Agent: compare offers using explicit preference weights

## 8.1 System Prompt Responsibilities
- Keep responses financial-education focused (not investment advice guarantees)
- Ask concise adaptive questions
- Always include a short rationale for recommendations

## 8.2 Guardrails
- Avoid hard promises (e.g., guaranteed returns)
- Avoid collecting sensitive PII in MVP
- Keep cross-sell language assistive, not aggressive

## 8.3 Suggested Prompt Template
```text
Context:
- Page Topic: {{topic}}
- Persona: {{persona_or_unknown}}
- Intents: {{intents}}

Task:
1) Ask next best onboarding/clarification question OR provide recommendations.
2) If recommending, return exactly 3 cards with a one-line "why" for each.
3) Keep tone concise and supportive.
```

## 9. Voice Mode Design (Optional)
1. User taps microphone
2. Audio streamed/uploaded to STT endpoint
3. Text fed to `/api/chat/message`
4. Assistant response optionally synthesized via TTS
5. Frontend plays audio + renders text in parallel

Fallbacks:
- If STT fails -> prompt user to type
- If TTS fails -> show text-only response

## 10. Reliability, Security, and Compliance (Hackathon Level)
- Input validation on all APIs
- Basic rate limiting per session
- No storage of sensitive personal financial identifiers
- Log redaction for user free-text fields
- Circuit-breaker fallback: if LLM fails, return rule-based static recommendations
- Graph guardrail: max 6 node hops per turn to prevent loops

## 11. Observability
Track the following metrics:
- chat turn latency (p50/p95)
- recommendation CTR
- concierge completion rate
- compare flow completion rate
- voice success/failure rate
- fallback invocation count

## 12. Deployment Plan
## 12.1 Demo Deployment
- Frontend: Vercel/Netlify
- Backend: Render/Railway/Fly.io
- KG dataset: bundled JSON + cache in memory

## 12.2 Environment Variables (example)
- `LLM_API_KEY`
- `USE_LANGGRAPH=true|false`
- `STT_API_KEY` (optional)
- `TTS_API_KEY` (optional)
- `FEATURE_VOICE=true|false`

## 13. Implementation Plan (25 Mar -> 29 Mar)
## Day 1 (25 Mar)
- finalize schemas, API contracts, prompt templates
- scaffold frontend + backend skeleton
- build minimal LangGraph with `InputRouter -> Concierge -> ResponseComposer`

## Day 2 (26 Mar)
- implement concierge flow + session manager + persona extraction
- implement KG loader and candidate retrieval
- add Navigator and Recommendation nodes

## Day 3 (27 Mar)
- implement rule engine + ranking + recommendation cards
- implement compare endpoint for services
- add Cross-Sell and Marketplace graph branches

## Day 4 (28 Mar)
- optional voice integration + fallback logic
- polish UI, logging, and demo script
- add graph-level fallback and hop-limit guard

## Day 5 (29 Mar)
- final rehearsal with 3 scripted scenarios
- prepare offline-safe fallback mode

## 14. Delay Contingency Technical Scope
If delayed, ship **Prototype v1** with:
- text-only assistant
- deterministic rules + static KG
- one endpoint for chat + recommendations
- 3-node graph only: `InputRouter -> Recommendation -> ResponseComposer`
- no voice and limited compare logic

This still validates the product hypothesis and supports further development after the hackathon.

## 15. Team Split (4 Members)
## Member 1 – Product/Prompt + Orchestration
- owns prompt design, persona question tree, response quality
- supports API response shaping

## Member 2 – Backend + Recommendation Engine
- owns API layer, rule engine, ranking logic, session store

## Member 3 – Frontend + Voice
- owns chat widget, page context capture, voice UI and integration

## Member 4 – Data + QA + Demo Operations
- owns KG curation, telemetry dashboard, bug triage, demo fallback mode

## 16. Definition of Done (Engineering)
- All core APIs implemented and callable end-to-end
- 3 demo scenarios run without crash
- Recommendation cards include rationale and CTA
- Latency targets mostly met (text < 2.5s average in demo setup)
- Fallback mode works when LLM/voice service unavailable
- At least one conversation turn path executes through LangGraph nodes end-to-end

## 17. PRD Feature to Technical Mapping
| PRD ID | Feature | Technical Implementation |
|---|---|---|
| FR-01 | Session Capture | `POST /api/session/start`, in-memory session store, session schema validation |
| FR-02 | Persona & Intent | Concierge/Navigator nodes update `persona`, `intents`, `riskProfile` |
| FR-03 | Context Awareness | `pageContext` in session + router and recommendation filters |
| FR-04 | Gap Detection | Navigator rule engine for labels (`TAX_CONFUSION`, `FD_INFLATION_GAP`, `DEBT_STRESS`) |
| FR-05 | Recommendation Bundle | KG candidate retrieval + scoring + top-3 response composer |
| FR-06 | Marketplace Compare | `POST /api/recommendations/compare` + weighted ranking and rationale |
| FR-07 | Actionable CTAs | Recommendation card schema includes CTA text + URL |
| FR-08 | User Control | Dismiss/skip metadata in response and frontend interaction state |
| FR-09 | Orchestration Path | LangGraph nodes (`InputRouter`, `Concierge`, `Navigator`, `Recommendation`, `Composer`) |
| FR-10 | Deterministic Fallback | Fallback Rule Node + safe static recommendations |
| FR-11 | Voice Mode | `/api/voice/stt`, `/api/voice/tts`, feature-flagged frontend controls |
| FR-12 | Session Return Refinement | Session history-aware prompt and intent refinement logic |

## 18. Detailed Build Subphases (Execution Order)
### Subphase 1.1 (Completed)
- Backend scaffold + health/session/chat endpoints + minimal graph.

### Subphase 2.1
- Add KG schema + curated `kg.json` dataset (12–16 entries).
- Add KG repository and retrieval filters by topic/intent/persona.

### Subphase 2.2
- Add recommendation scoring utility.
- Add Recommendation Agent node and return top-3 cards with rationale.

### Subphase 2.3
- Add response fallback recommendations when KG lookup is empty.
- Validate 3 scenario outputs (tax, inflation, debt).

### Subphase 3.1
- Add Navigator gap labeling rules with typed enum outputs.

### Subphase 3.2
- Add Cross-Sell node, trigger conditions, and guardrail copy templates.

### Subphase 4.1
- Build compare schema and ranking weights.

### Subphase 4.2
- Implement compare endpoint with deterministic tie-breaking.

### Subphase 5.1
- Build frontend chat shell and session start integration.

### Subphase 5.2
- Render recommendation cards (`why`, CTA, dismiss state).

### Subphase 6.1 (Optional)
- Add voice STT/TTS APIs and feature-flag support.

### Subphase 6.2 (Optional)
- Add frontend voice controls and text fallback behavior.

### Subphase 7.1
- Add telemetry events, smoke scripts, and demo runbook locking.

Progression rule:
- Move to next subphase only when current subphase acceptance checks pass.
