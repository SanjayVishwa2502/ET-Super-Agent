# ET Super Agent – Phased Execution Plan (Single Source of Build Order)

- **Version:** 3.0 (Post-Backend Pivot to Product Showcase)
- **Date:** 26 March 2026
- **Applies To:** Hackathon build execution until final demo lock
- **Linked Docs:** ET_Super_Agent_PRD.md, ET_Super_Agent_TDD.md, ET_Super_Agent_Showcase_Order.md
- **Budget Constraint:** 0 (no paid model/API usage)

## 1) Purpose & Strategic Pivot
We have successfully built a robust API foundation (Phases 1-3) with real multi-node LangGraph orchestration, gap detection, transparent recommendation rules, and session memory. However, **hackathons are won on product experience, not invisible APIs**.

This updated build order pivots strictly to **Showcase and User Interface** delivery. All further deep backend logic (e.g., detailed marketplace comparison algorithms) is deferred until the visual "Super Agent" is alive on screen.

## 2) Mandatory Execution Rules
1. One active phase/subphase at a time.
2. Every update ends with completion check: planned, completed, pending, blockers, go/no-go.
3. No deeper backend construction until the UI is rendering what we already built.
4. Local-first model policy only.

## 3) Current Status Snapshot
- **Phase 1-3:** **Done** (The "Invisible Brain": Node/Express backend, LangGraph orchestration, recommendation KG).
- **Phase 4-7:** **Done** (The "Interactive Face", Voice, Compare, Showcase Prep).
- **Active work target:** Recommendation extensions / feature polishing.

## 4) Re-Prioritized Phase Plan

### Phase 4 – Interactive Frontend & Super Agent UI (Immediate Showcase Priority)
*Goal: Give the agent a face so we can demo the magic we built.*

**4.1 Conversation Shell & Context Capture**
- Scaffold React/Next.js (or simple Vite/HTML) frontend.
- Implement mock ET Page container (e.g., "ET Tax Article").
- Extract page context metadata natively and ping `POST /api/session/start`.
- Render a chat thread with user/assistant message bubbles.

**4.2 Recommendation Card Rendering**
- Parse the backend's `recommendations` array.
- Render styled output cards containing `title`, `type` badge (e.g., Event/Product), `why` (rationale), and a clickable `cta`.
- Make it visually look like an ET-native widget.

**4.3 Showcase Traceability Tools (For Judges)**
- Expose the "brain" for the demo: add a collapsible "Debug/Agent Metadata" drawer in the UI showing `gapDetection.label`, `strategy`, and `visitedNodes`.

### Phase 5 – Hands-Free Voice Mode (The Hackathon "Wow" Factor)
*Goal: Satisfy the "Voice-First Capability" from the prompt to stand out.*

**5.1 Browser-Native STT (Speech-to-Text)**
- Add a microphone button to the UI using the standard Web Speech API (zero-budget, browser-native).
- Auto-send transcribed text to the backend.

**5.2 Browser-Native TTS (Text-to-Speech)**
- Read out the `assistantMessage` using Web Speech Synthesis API.
- Ensure graceful fallback (mute button, text always visible).

### Phase 6 – Services Marketplace Compare (Deferred Logic)
*Goal: Add the deeper comparison tool only once the core UI loop is flawless.*

**6.1 Compare API**
- Implement `/api/recommendations/compare` to rank multiple loan/card options.

**6.2 Compare UI Overlay**
- When compare is triggered, render a side-by-side comparison table in the chat shell.

### Phase 7 – Hardening & Demo Lock
*Goal: Flawless demo runbook.*
- Freeze code. Run full end-to-end `ET_Super_Agent_Showcase_Order.md` script.
- Ensure "No KG Fallback" works visually.
- Prepare demo talking points.

## 5) Day-wise Plan (Remaining)
- **26 Mar:** Complete Phase 4 (Frontend UI)
- **27 Mar:** Complete Phase 5 (Voice mode integration)
- **28 Mar:** Complete Phase 6 (Marketplace Logic) if time permits + Polish
- **29 Mar:** Final demo rehearsals

## 6) Immediate Next Commanded Step
*All Phases 1 through 7 completed successfully!*
Ready for unstructured feature additions and final polish as requested by stakeholders.

