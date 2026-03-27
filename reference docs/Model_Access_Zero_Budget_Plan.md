# ET Super Agent – Zero Budget Model Access Plan

- **Version:** 1.0
- **Date:** 26 March 2026
- **Budget Constraint:** 0
- **Goal:** Ship hackathon MVP with no paid model/API usage

## 1) Executive Decision
Use a **fully local inference stack** for MVP:
1. Local LLM for chat/orchestration support
2. Rule-based fallback for all critical flows
3. Optional local STT/TTS only if machine performance allows

This keeps cost at zero and avoids API billing risk.

## 2) Access Options vs Cost
## Option A: Paid APIs (Not allowed under current constraint)
- Fastest setup, best quality, variable cost
- Rejected due to budget = 0

## Option B: Local Open Models (Recommended)
- No per-request cost
- Requires machine resources
- Best fit for this project constraint

## Option C: Hybrid (API + local)
- Rejected due to budget = 0

## 3) Recommended Zero-Cost Stack
## 3.1 LLM Runtime
- **Ollama** (local model serving)
- Suggested starter chat model classes:
  - small instruct model for low-resource machines
  - medium instruct model for higher quality (if hardware supports)

### Why
- Very fast setup
- Simple local HTTP endpoint
- Works with existing Node backend architecture

## 3.2 STT/TTS (Optional)
- STT: local Whisper-compatible runtime (optional)
- TTS: local OS TTS or open-source TTS engine (optional)

### Voice policy under zero budget
- Voice stays feature-flagged and optional
- Do not block demo on voice quality/performance

## 4) Implementation Policy for This Project
1. **Primary path:** deterministic rules + local model assistance.
2. **Never block on model quality:** if low confidence, ask clarification.
3. **Always keep fallback path:** static safe recommendations if model/tool fails.
4. **No external paid endpoints in default config.**

## 5) Environment Strategy
Define local-first env variables:
- `MODEL_PROVIDER=local`
- `LOCAL_MODEL_BASE_URL=http://localhost:11434`
- `LOCAL_MODEL_NAME=<chosen_model>`
- `USE_LANGGRAPH=true`
- `FEATURE_VOICE=false` (default)

If voice enabled later:
- `FEATURE_VOICE=true`
- `LOCAL_STT_ENABLED=true`
- `LOCAL_TTS_ENABLED=true`

## 6) Performance Expectations (Realistic)
- Local small model: acceptable for demo text guidance
- Local medium model: better relevance but slower on CPU-only devices
- Rule-based layer must remain the reliability backbone

## 7) Risk Register Under Zero Budget
1. **Risk:** Local model response quality variability
   - Mitigation: stronger rules, tighter prompts, scenario guard
2. **Risk:** Hardware limitations (CPU/RAM)
   - Mitigation: choose smaller model class; disable voice by default
3. **Risk:** Demo latency spikes
   - Mitigation: pre-warm model and keep deterministic fallback responses

## 8) Required Pre-Demo Checks
1. Local model server starts reliably.
2. Backend can call local model endpoint.
3. Ambiguous and out-of-scope prompts trigger safe clarification.
4. Fallback path works if local model is unavailable.

## 9) Team Split for Zero-Budget Setup
- **Member 1 (Product/Prompt):** local prompts, answer style, guardrail copy
- **Member 2 (Backend):** local model adapter and fallback orchestration
- **Member 3 (Frontend):** UI and latency masking states (loading, retry)
- **Member 4 (QA/Ops):** hardware runbook, startup checklist, demo reliability

## 10) Decision Gate
If local model quality is insufficient by checkpoint:
- Keep orchestration + rules + KG as primary
- Treat model output as optional augmentation
- Proceed to demo with deterministic recommendation engine

This still satisfies the hackathon requirement of intelligent orchestration while respecting zero budget.
