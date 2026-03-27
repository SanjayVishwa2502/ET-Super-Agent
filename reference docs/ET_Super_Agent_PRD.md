# ET Super Agent – Product Requirements Document (PRD)

- **Version:** 1.0
- **Date:** 25 March 2026
- **Hackathon Deadline:** 29 March 2026
- **Team Size:** 4

## 1. Background
The Economic Times (ET) ecosystem has high-value offerings (ET Prime, ET Markets, events, services), but users often stay in narrow content silos. The product opportunity is to build an intelligent "Glue" layer that connects user intent and context to the right ET offerings.

## 2. Problem Statement
Users face **information overload** and low cross-discovery across ET products.

- A user may browse ET Markets but miss ET Prime deep dives and Masterclasses.
- A user reading debt content may not discover relevant ET partner financial services.
- Existing journeys are mostly search/browse; the goal is guided and personalized decision support.

## 3. Product Vision
Build an AI-powered **ET Super Agent** that:
- Profiles users quickly through conversational onboarding.
- Understands context (current page/topic).
- Detects financial/content gaps.
- Recommends relevant ET content, tools, events, and services.
- Offers optional voice-first interaction.

## 4. Goals and Success Criteria
### 4.1 Product Goals
1. Deliver a working MVP that unifies 4 pillars:
   - Welcome Concierge
   - Financial Life Navigator
   - Ecosystem Cross-Sell Engine
   - Services Marketplace Agent
2. Show contextual, explainable recommendations ("Why this?").
3. Demonstrate measurable engagement in demo scenarios.

### 4.2 Success Metrics (Hackathon)
- Concierge completion rate: **>= 70%**
- Recommendation click-through: **>= 50%** (demo sessions)
- Relevance rating from test users/judges: **>= 4/5**
- End-to-end flow completion (onboarding -> recommendations -> CTA) within **3 minutes**

## 5. Users and Personas
### Primary Users
- First-job professionals (tax/salary planning)
- Retail investors (portfolio understanding and diversification)
- Debt-management users (cards/loan comparison)
- Aspiring founders/professionals (industry-focused content discovery)

### Example Persona Labels
- Conservative Wealth Builder
- Aspiring Fintech Entrepreneur
- Early Career Tax Learner

## 6. Scope
## 6.1 In-Scope (MVP)
### A) Welcome Concierge (Handshake)
- 3-minute conversational onboarding (5–7 adaptive questions)
- Persona + intent generation

### B) Financial Life Navigator (Brain)
- Rule-based detection of gap/opportunity from user responses
- Example: FD-heavy + inflation concern -> diversification suggestions

### C) Ecosystem Cross-Sell Engine (Revenue Driver)
- Contextual, non-intrusive suggestions to ET partner services
- Clear rationale and dismiss option

### D) Services Marketplace Agent (Closer)
- Compare cards/loans based on user criteria
- Return top 3 options with concise reasons

### Core Experience Layer
- Context-aware prompts from current page topic
- "Why recommended" explanation
- Session-level memory for returning users
- Optional voice mode (STT + TTS)

## 6.2 Out-of-Scope (Hackathon)
- Real KYC, transactions, or financial execution
- Real-time partner API integration in production mode
- Full-scale personalization ML pipeline

## 7. Functional Requirements (Feature IDs)
### Core Features (Must Have)
- **FR-01 Session Capture:** Capture and store onboarding responses in session.
- **FR-02 Persona & Intent:** Generate persona and user intent from responses.
- **FR-03 Context Awareness:** Use page context to adapt follow-up questions and recommendations.
- **FR-04 Gap Detection:** Detect financial/content gaps with transparent rules.
- **FR-05 Recommendation Bundle:** Rank and present recommendations across:
   - ET content (Prime/articles/reports)
   - ET tools (Markets/screeners)
   - ET events/masterclasses
   - ET services (where relevant)
- **FR-06 Marketplace Compare:** Offer services comparison output with pros/cons.
- **FR-07 Actionable CTAs:** Provide actionable CTA links.
- **FR-08 User Control:** Allow user to dismiss/skip recommendations.
- **FR-09 Orchestration Path:** Route turns through minimal multi-agent orchestration (LangGraph nodes).
- **FR-10 Deterministic Fallback:** Return safe fallback recommendations on graph/tool/LLM failure.

### Optional / Stretch Features
- **FR-11 Voice Mode:** STT + TTS for hands-free flow behind feature flag.
- **FR-12 Session Return Refinement:** Improve recommendations for returning sessions.

## 8. Non-Functional Requirements
- Text response latency target: **< 2.5s** average turn
- Voice roundtrip target: **< 4s** average
- Demo reliability: no critical crash in guided run
- Privacy baseline: do not collect high-risk personal identifiers in MVP
- Graceful fallback for missing data/service failures

## 8.1 Non-Functional Feature IDs
- **NFR-01 Performance:** Text response latency < 2.5s average.
- **NFR-02 Voice Performance:** Voice roundtrip < 4s average (only if FR-11 enabled).
- **NFR-03 Reliability:** No critical crash in guided demo run.
- **NFR-04 Privacy Baseline:** Avoid high-risk personal identifiers in MVP.
- **NFR-05 Resilience:** Graceful fallback on missing data/service failures.

## 9. Data and Knowledge Graph (Mock)
Create a structured mock catalog containing:
- **Products:** ET Prime, ET Markets, ET Speed
- **Events:** Wealth Summit 2026, Startup Awards, Masterclasses
- **Services:** IDFC Credit Cards, HDFC Home Loans, personal loans, insurance

Minimum fields per item:
- id, title, type, category
- user-tags (career stage, risk profile, topic)
- relevance keywords
- eligibility hints
- CTA URL (mock or real ET link)

## 10. User Journey (MVP)
1. User lands on ET page (context captured).
2. Concierge asks adaptive onboarding questions.
3. Persona + intent generated.
4. Navigator identifies gap/opportunity.
5. Agent returns recommendation bundle:
   - 1 content suggestion
   - 1 tools suggestion
   - 1 event or service suggestion
6. User may request comparison (cards/loans).
7. Agent shows top 3 with rationale and CTA.

## 11. Timeline (25 Mar -> 29 Mar)
- **25 Mar:** Finalize PRD/TDD, data schema, prompts, architecture decisions
- **26 Mar:** Build Concierge + Navigator with mock knowledge graph
- **27 Mar:** Build Cross-Sell + Marketplace compare + context engine
- **28 Mar:** Voice (optional) + QA + demo script + polish
- **29 Mar:** Final demo and contingency-ready runbook

## 12. Delay/Contingency Plan
If timeline slips, ship **Prototype v1** by 29 Mar:
- Keep Concierge + Navigator + contextual recommendations
- Deliver fixed recommendation bundle (content + tool + event/service)
- Use rule-based scoring + static mock catalog
- Keep voice as optional/stretch feature

Post-deadline Phase 2:
- Stronger ranking model
- Persistent profile memory
- Real integrations for services and events
- Better comparison explainability and analytics

## 13. Risks and Mitigations
1. **Time risk (multi-feature scope)**
   - Mitigation: strict MVP gate; feature flags for voice/advanced compare
2. **Data quality risk**
   - Mitigation: curated mock KG and deterministic fallback messages
3. **Demo reliability risk**
   - Mitigation: offline-safe demo mode with preloaded scenarios

## 14. Team Split (4 Members)
### Member 1 – Product & Prompt Lead
- Own PRD/TDD, prompts, flow design, and demo storytelling

### Member 2 – Backend & Recommendation Logic Lead
- Persona engine, rule engine, ranking APIs, and data access layer

### Member 3 – Frontend & Voice Lead
- Chat UI, contextual state integration, optional STT/TTS flow

### Member 4 – Data, QA, and Demo Ops Lead
- Mock KG curation, test execution, bug triage, and demo runbook stability

## 15. Demo Narrative (Suggested)
Use this core scenario in final demo:
- User: "Final year student, first tech job in Bangalore, unsure about taxes"
- Agent outputs:
  - congratulatory, contextual onboarding
  - ET Prime trial/content recommendation for tech sector tracking
  - relevant tax planning masterclass
  - tax-saving mutual fund path in ET Markets

## 16. Feature Priority and Release Gate
### P0 (Required before demo)
- FR-01, FR-02, FR-03, FR-04, FR-05, FR-07, FR-09, FR-10

### P1 (Required if time allows before demo lock)
- FR-08, FR-11, FR-12

### P2 (Stretch)
- FR-06

Release gate rule:
- P0 complete -> demo-eligible baseline
- P0 + P1 complete -> strong judging build
