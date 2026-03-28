# ET Super Agent – Dynamic Profile Lens (The "Trump Card")

- **Status:** Strategic Planning
- **Goal:** Shift from 1-to-1 User/Profile to 1-to-Many "Sub-Profiles" (Lenses) per Account
- **Feature Name:** "Contextual Lenses" (Dynamic Sub-Profiles)

## 1. The Strategy (Why this wins hackathons)
Currently, an account holds exactly one set of answers. Real users have multiple dimensions: they might be an "Aggressive Crypto Trader" in the morning and a "Conservative Tax Planner" in the evening. 

By allowing a user to create **multiple Lenses (Sub-Profiles)** dynamically, defining them with natural language (up to 1000 characters) and tags, we create a hyper-personalized agent. 

To keep the system zero-budget, lightweight, and fast, we will use an **LLM-based Semantic Extractor** instead of a heavy Vector DB. The LLM will parse the user's 1000-character description and tags, distill it into highly dense "Agent Instructions & Key Insights", and inject that precisely into the LangGraph state when that "Lens" is active.

---

## 2. Phased Execution Plan

### Phase 1: Storage & API Architecture (Data Layer) - [COMPLETED] & API Architecture (Data Layer)
*Objective: Upgrade the backend to support Sub-Profiles without breaking existing sessions.*
- **Action 1:** Update `types.ts` `PersistedProfile` to include an array of `SubProfile` objects (`id, name, description, tags, extractedContext`).
- **Action 2:** Build CRUD backend routes (`/api/profile/lens/create`, `/api/profile/lens/delete`, `/api/profile/lens/list`).
- **Action 3:** Update `sessionStore` to track the `activeLensId` so the session knows *which* sub-profile is currently steering the AI.

### Phase 2: The UI Control Center (Frontend Layer)
*Objective: Build the interface for users to manage their Lenses.*
- **Action 1:** Create a new "Lens Manager" panel or modal in `App.tsx` (or a dedicated component).
- **Action 2:** Add a form with:
  - Lens Name (e.g., "Retirement Planner")
  - Description Textarea (Max 1000 chars)
  - Tag Input (e.g., `[Tax, Conservative, 401k]`)
- **Action 3:** Add Create / Delete buttons and a "Switch Lens" selector so the user can easily swap perspectives on the fly.

### Phase 3: Semantic Extraction Engine (The "Vector" Alternative)
*Objective: Process the raw text and tags into a concentrated payload for the Agent.*
- **Action 1:** When a new Lens is created, invoke the LLM silently in the background.
- **Action 2:** Extract core intents, risk assumptions, and contextual hooks from the 1000-character text and tags.
- **Action 3:** Save this dense extraction in the database as `extractedContext`. 

### Phase 4: Agent Prompt Orchestration (The Brain Integration)
*Objective: Make the LLM structurally behave according to the active Lens.*
- **Action 1:** Update `graph.ts` (LangGraph state) to fetch the `activeLens`'s `extractedContext`.
- **Action 2:** Modify the main `RESPONSE_COMPOSER` system prompt. If a Lens is active, strictly align the tone, tool recommendations, and strategy to match the extracted keywords.
- **Action 3:** Add an indicator in the UI Traceability Drawer showing "Active Lens Rules Enforced".

---

## 3. Go/No-Go Decision
Since this fundamentally alters how Sessions and Profiles are mapped, it must be executed strictly phase-by-phase to ensure the current stable release is not corrupted. Do not proceed to Phase 2 until Phase 1 is fully tested.