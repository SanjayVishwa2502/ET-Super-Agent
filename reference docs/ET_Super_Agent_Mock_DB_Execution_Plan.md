# ET Super Agent - Mock Database Context-Aware News Tuning Plan

- Date: 26 March 2026
- Objective: Make context awareness driven by dashboard news selection, not static page tags.
- Product truth: The agent must re-tune dynamically when the user clicks a different news item in the ET dashboard list.

---

## 1) True Context-Aware Behavior (Target Flow)

This is the expected runtime behavior we are implementing:

1. User logs into mock ET dashboard with a selected persona.
2. Dashboard shows a list of news cards.
3. User clicks one news card (example: tax, debt, markets, insurance).
4. Frontend sends selected `articleId` + `userId` to backend context service.
5. Backend loads full user profile + full article metadata from Mock DB.
6. Agent memory is updated with this enriched context.
7. All 4 operations (Intent, Gap Detection, Recommendation, Compare) use that selected-news context.
8. If user clicks another news card, context is refreshed and the agent re-tunes immediately.

This click-to-retune behavior is the core of the Super Agent implementation.

---

## 2) Data Model for Dashboard-Driven Context

To keep it zero-budget and hackathon-fast, use JSON/in-memory storage first (upgrade path to SQLite later).

### 2.1 Users Collection
- `userId`
- `name`
- `incomeBand`
- `riskAppetite`
- `activeLoans`
- `portfolioMix`
- `goals`

### 2.2 Articles Collection
- `articleId`
- `headline`
- `section` (Tax, Loans, Investments, Insurance)
- `topicTags`
- `riskSignals`
- `productAffinityHints`

### 2.3 Products Collection
- `productId`
- `category`
- `eligibilityRules`
- `interestOrFee`
- `riskLevel`
- `benefitTags`

### 2.4 Session Context Record
- `sessionId`
- `userId`
- `selectedArticleId`
- `enrichedContextSnapshot`
- `lastUpdatedAt`

---

## 3) Phased Implementation Plan (Rewritten for News Selection)

### Phase 1 - Mock DB Foundation
Goal: Build seed data that can represent real dashboard switching.

- 1.1 Create seed users (at least 4 personas with different risk and debt profiles).
- 1.2 Create seed articles (at least 8, spread across tax/debt/investments/insurance).
- 1.3 Create product inventory with explicit eligibility and risk tags.
- 1.4 Add repository/service layer for `getUserById`, `getArticleById`, `getProductsByCategory`.

### Phase 2 - Dashboard News Selection Context Pipeline
Goal: Wire frontend news click events to backend context updates.

- 2.1 Add dashboard news list endpoint for frontend rendering.
- 2.2 Add context switch endpoint: `POST /api/context/select-article`.
- 2.3 Payload: `sessionId`, `userId`, `articleId`.
- 2.4 Backend context aggregator merges user + article and saves to session context snapshot.
- 2.5 Return `activeContextSummary` to frontend for visual confirmation.

### Phase 3 - Retune the 4 Operations Using Selected News Context
Goal: Ensure every operation reflects the currently selected article.

- 3.1 Intent Node: Add selected article section and user profile hints into prompt features.
- 3.2 Gap Node: Detect user-content mismatch (example: low risk user on high-volatility article).
- 3.3 Recommendation Node: Rank only products aligned to user profile plus selected article intent.
- 3.4 Compare Node: Use selected article affinity and user debt/income constraints for scoring.

### Phase 4 - Frontend Demonstration of Dynamic Retuning
Goal: Make context changes obvious to judges.

- 4.1 Build ET-style dashboard with clickable news list.
- 4.2 Keep one persistent Super Agent widget across all news views.
- 4.3 On news click, call context switch endpoint before next chat turn.
- 4.4 Show active context badge above chat (example: `User: Priya | Article: Tax Regime FY26`).
- 4.5 Expand Traceability Drawer with `selectedArticleId` and `contextVersion`.

### Phase 5 - Validation Scenarios for True Context Awareness
Goal: Prove dynamic behavior is real and deterministic.

- 5.1 Scenario A: Same user, switch from Tax article to Debt article -> recommendations must change.
- 5.2 Scenario B: Same article, switch user persona -> recommendations and compare rankings must change.
- 5.3 Scenario C: Rapid article switching -> no stale context should leak into response.
- 5.4 Scenario D: Missing article in DB -> graceful fallback with explicit traceability flag.

---

## 4) API Additions Required

- `GET /api/dashboard/news`
	- Returns news cards for dashboard list.
- `POST /api/context/select-article`
	- Updates active session context from selected article.
- Existing `POST /api/chat/message`
	- Must read active session context snapshot.
- Existing `POST /api/recommendations/compare`
	- Must use same active session context snapshot.

---

## 5) Completion Criteria (Definition of Done)

1. Clicking a different news item changes agent outputs without restarting session.
2. Traceability visibly shows current selected article context.
3. Compare results differ when context differs.
4. No hardcoded single-page topic flow remains in runtime path.

---

## 6) Immediate Next Build Step

Start with Phase 1.1 to 1.4:
- Create Mock DB seed files and repository services.
- Add at least 4 user personas and 8 news articles.
- Prepare for Phase 2 endpoint wiring.