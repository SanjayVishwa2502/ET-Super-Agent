# ET Super Agent – Showcase Order (Demo-First Sequence)

- Date: 26 March 2026
- Purpose: Show the strongest user-visible outcomes in a short live demo.
- Note: This is a presentation order, not the implementation order.

## 1) Why a Separate Showcase Order
Build order is dependency-driven (backend foundation first). Showcase order is impact-driven (show user value first). Keep them separate.

## 2) Recommended 8-10 Minute Demo Flow

### Step 1: Problem Framing (45-60 sec)
- User asks finance help but gets generic guidance in normal systems.
- ET Super Agent gives contextual, gap-aware, actionable recommendations.

### Step 2: Session Start + Context Capture (60 sec)
- Call `POST /api/session/start` with page topic/tags.
- Show that a reusable `sessionId` is returned.

### Step 3: First-Turn Personalization (90 sec)
- Send tax-oriented message.
- Show returned 3 cards with `title`, `type`, `why`, `cta`, `url`.
- Highlight transparent rationale in `why`.

### Step 4: Returning Session Refinement (120 sec)
- In same session, pivot message to debt goal.
- Show recommendations shift to debt-oriented list.
- Show strategy alignment and session-history-aware rationale.

### Step 5: Cross-Sell Rule Gating (90 sec)
- In debt flow: show `orchestration.crossSell.triggered = true` and reason.
- In tax-only flow: show `orchestration.crossSell.triggered = false` and reason.
- Emphasize non-intrusive, rule-based behavior.

### Step 6: Resilience Fallback (90 sec)
- Enable `SIMULATE_KG_UNAVAILABLE=true`.
- Show non-empty fallback recommendations and `fallbackUsed = true`.
- Explain deterministic reliability under failure.

### Step 7: Traceability + Explainability (60 sec)
- Show `orchestration.visitedNodes`, `gapDetection.label`, and strategy metadata.
- Position this as debuggable orchestration, not black-box output.

### Step 8: Phase-4 Teaser (45 sec)
- Preview upcoming `/api/recommendations/compare` for marketplace ranking.
- Clarify this is the next build milestone.

## 3) Live Demo Commands (Quick Script)
Run app:
- Frontend: `cd frontend && npm run dev`
- Backend: `cd backend && npm run dev`

Start session:
- Frontend will auto-ping `POST /api/session/start` on load.

Chat turns:
- Voice input / typed message (tax)
- Voice input / typed message (debt in same session)
- Trigger Compare by clicking "Deep Compare Top Matches"

Fallback run:
- Backend: `npm run dev:fallback` (uses cross-env to inject `SIMULATE_KG_UNAVAILABLE=true`)
- Type a new message in the UI and show Traceability drawer.

## 4) Presenter Tips
- Keep one fixed session for refinement story.
- Show only 1-2 fields from metadata each step to avoid clutter.
- Always narrate: Goal -> Decision -> Output -> Why trustworthy.

## 5) Build vs Showcase Mapping
- Build order source of truth: `ET_Super_Agent_Phased_Execution_Plan.md`
- Showcase order source of truth: this document
- Rule: demo order can change freely; implementation order must not.
