# Scenario Pack Interpretation for ET Super Agent

## 1) Are models pretrained or do we need dataset training?
Short answer:
- Yes, the base LLM/STT/TTS models are pretrained.
- For hackathon MVP, you usually **do not train a new model**.
- You need **structured data + rules + prompts + orchestration**.

What you still need:
1. ET knowledge graph data (`kg.json`) for retrieval/recommendation.
2. Rule labels for navigator and cross-sell (gap detection).
3. Scenario tests to validate behavior under expected + surprise prompts.

So this project is mostly:
- orchestration engineering,
- retrieval/ranking logic,
- guardrails/fallback design,
not model training.

## 2) What these shared scenario packs mean for you
The file in `initialresearch/scenarios.txt` is a **judging method pattern**:
- all teams get known scenarios,
- judges add hidden surprise scenarios,
- they evaluate reliability, not just polished demos.

Your ET track equivalent should do the same:
- fixed known user journeys,
- plus unknown/ambiguous stress prompts.

## 3) ET Scenario Set (recommended)
### Known scenarios (must pass)
1. First-job tax confusion (Gen Z professional)
2. FD-heavy + inflation worry (portfolio gap)
3. Credit card debt + consolidation need (cross-sell relevance)
4. Card/loan comparison request (marketplace close)

### Surprise scenario classes (must handle)
1. Ambiguous user request (missing key details)
2. Out-of-domain request (asks for unrelated enterprise workflow)
3. Contradictory constraints (low risk but high guaranteed return)
4. Missing data path (no relevant KG items)

## 4) How we implement robustness in backend
1. Scenario guard node checks message quality and domain relevance.
2. If ambiguous: ask targeted clarification (do not guess).
3. If out-of-domain: safely redirect to ET finance guidance scope.
4. If KG lookup fails: return fallback recommendations and next action.
5. Return orchestration metadata so judges can see deterministic handling.

## 5) Judge-facing robustness principles
- Clarify before acting on weak/ambiguous input.
- Never hallucinate specific offers/data not in KG.
- Explain assumptions in one line.
- Provide safe fallback options when confidence is low.
- Keep interaction useful, not blocked.

## 6) What to show in demo
- one normal scenario success path,
- one ambiguous prompt path (clarification behavior),
- one surprise/out-of-domain path (safe redirection),
- one missing-data path (fallback recommendations).
