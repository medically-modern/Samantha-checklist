# Samantha Checklist — Developer Guide

> **Who this is for:** Josh and Brandon (and their Claudes). This doc is the single source of truth for how the codebase works, what lives where, and how to make changes without breaking things.

## What This App Does

Internal tool for Medically Modern. Samantha uses it to process patients through the **Benefits → Authorization → Complete** pipeline on a Monday.com board. The app reads patient data from Monday, presents a UI for insurance verification decisions, and writes the results back to Monday when the user clicks "Send to Monday."

## Stack

React + Vite + TypeScript + Tailwind CSS + shadcn/ui. Deployed to **GitHub Pages** via GitHub Actions.

- Repo: `https://github.com/medically-modern/Samantha-checklist`
- Live: `https://medically-modern.github.io/Samantha-checklist/`
- Branch: `main` (push triggers deploy)

## Monday.com Board

All reads and writes go to **Board ID `18410601299`** (Insurance board).

**API setup:** GraphQL endpoint `https://api.monday.com/v2`, POST, header `API-Version: 2024-10`. Token baked in at build time via `VITE_MONDAY_API_TOKEN` env var (set as a GitHub repo secret).

**Groups on this board:**

| Group | ID | Purpose |
|---|---|---|
| Benefits | `group_mm1xr3q3` | Current Benefits tab reads from here |
| Submit Auth | `group_mm1x1416` | Auth tab reads from here |
| Auth Outstanding | `group_mm2v6d1z` | — |
| Escalations | `group_mm2vg9gn` | — |
| Complete / Stuck | `group_mm2vw3c0` | — |

---

## The Data Flow (Read → UI → Write)

Understanding this chain is critical. Here's exactly how data moves:

```
Monday Board
  ↓  fetchGroupItems(groupId)          ← mondayApi.ts
  ↓  mondayItemToPatient(item)         ← mondayMapping.ts
  ↓
Patient object (in React state)
  ↓  useMondayPatients hook            ← hooks/useMondayPatients.ts
  ↓  polls every 30s, local overlay preserves UI edits
  ↓
InsurancePanel.tsx (user makes selections)
  ↓  deriveMondayColumns(patient, resolved)   ← InsurancePanel.tsx ~line 478
  ↓  MondayOutput component                   ← InsurancePanel.tsx ~line 590
  ↓  Shows preview of what will be written
  ↓
User clicks "Send to Monday"
  ↓  sendPatientToMonday(patient)      ← mondayWrite.ts
  ↓  Translates display values → numeric indices from mondayMapping.ts
  ↓  Fires all mutations via Promise.all
  ↓
Monday Board (columns updated)
```

**Key point:** Nothing writes to Monday until the user clicks the button. All selections are local-only until then.

---

## File Map — What Lives Where

### `src/lib/mondayApi.ts` — API Layer (READ + WRITE primitives)

This is the **plumbing**. It defines:

- `BOARD_ID` — the board number (`18410601299`)
- `GROUPS` — group IDs for each section of the board
- `COL` — the master column ID map. **Every column ID in the entire app must come from this object.** Never hardcode a column ID anywhere else.
- `READ_COLUMN_IDS` — the columns fetched on load (currently 6). Keep this minimal — reading too many columns causes 503 errors.
- `fetchGroupItems(groupId)` — reads items from a group
- `writeStatusIndex()`, `writeLongText()`, `writeDropdownIds()` — low-level write functions

**When to edit:** Only if you're adding a new column to read, a new group, or a new write function type. Do NOT put business logic here.

### `src/lib/mondayMapping.ts` — Status Index Constants + Item Conversion

This maps between **Monday's numeric status indices** and the app's types.

**Status indices** (the most important thing in this file):
```typescript
UNIVERSAL_INDEX = {
  activeNetwork: { pass: 1, fail: 2 },
  dmeBenefits:   { pass: 1, fail: 2 },
  sos:           { pass: 1, fail: 2, skip: 0 },
  auth:          { noAuth: 1, required: 0 },
}

STAGE_INDEX = {
  stuck: 2, benefitsSos: 3, authorization: 4,
  authOutstanding: 6, complete: 7,
}

AUTH_RESULT_INDEX = {
  evaluate: 0, authValid: 1, denied: 2,
  noAuthNeeded: 3, submitted: 4, required: 6, notServing: 7,
}

ESCALATION_INDEX = { required: 0, done: 1 }

NOT_CLEAR_PRODUCT_ID = { pump: 1, "cgm-monitor": 2, "cgm-sensors": 3, "infusion-sets": 4, cartridges: 5 }
```

Also contains `mondayItemToPatient()` which converts raw Monday API items into `Patient` objects.

**When to edit:** When a status label is added/removed on the Monday board. Query the column's `settings_str` to find the correct index — **never guess**.

### `src/lib/mondayWrite.ts` — Batch Writer ("Send to Monday")

`sendPatientToMonday(patient)` is the only function here. It:

1. Reads the patient's insurance state
2. Translates each selection into the correct numeric index (from `mondayMapping.ts`)
3. Fires all writes in parallel via `Promise.all`

**What it writes:**
- Active/Network status
- DME Benefits status
- Per-product auth results (Required / No Auth Needed / Not Serving)
- Not Clear Products dropdown
- SoS status (All Clear / Partial-Not Clear / Skip)
- Auth determination (Auths Required / No Auths Required)
- Stage Advancer (Benefits/SoS → Authorization → Complete → Stuck)
- Escalation (if needed)
- Call Reference Notes (long text)

**When to edit:** When you add a new column to write, or change the write logic (e.g., what triggers an escalation).

### `src/lib/hcpcRules.ts` — Insurance & Product Rules ⭐ BRANDON'S PRIMARY EDIT TARGET

This is the **business rules engine**. Given a patient's insurance + serving type, it resolves which products they get and which HCPC codes apply.

**Key data structures Brandon will edit:**

| Constant | What it controls | Example change |
|---|---|---|
| `SERVING_PRODUCTS` | Which products are active for each serving type | Adding a new serving type |
| `SUPPLY_HCPC_GROUP_BY_PAYER` | Which payer group (A/B/C) each insurance maps to | Adding a new insurance, changing a payer's group |
| `SUPPLY_HCPC_GROUPS` | The actual HCPC codes for groups A, B, C | Changing a code (rare) |
| `SUPPLIES_ROUTE_TO_MEDICAID` | Insurances where supplies bill to Medicaid | Adding/removing a Medicaid-routing payer |
| `PRIMARY_INSURANCE_OPTIONS` | Insurance dropdown list in the UI | Adding a new insurance option |
| `SERVING_OPTIONS` | Serving dropdown list in the UI | Adding a new serving option |

**The three payer groups:**
- **Group A** (most commercial + Medicaid): Infusion Set = A4230, Cartridge = A4232
- **Group B** (Medicare + some national): Infusion Set = A4224, Cartridge = A4225
- **Group C** (Aetna only): Infusion Set = A4231, Cartridge = A4232

**When to edit:** When insurance rules change, a new payer is added, HCPC codes change, or Medicaid routing rules change.

### `src/lib/workflow.ts` — Core Types & Business Logic

Defines `Patient`, `InsuranceState`, `ProductCodeState`, and `deriveInsuranceOutcome()`.

`deriveInsuranceOutcome()` determines the overall result:
- `"incomplete"` — user hasn't finished filling everything out
- `"all-clear"` — no auths needed, SoS all clear
- `"auth-required"` — at least one product needs authorization
- `"blocker"` — universal check failed or SoS not clear → escalation

**When to edit:** When outcome logic changes (e.g., new escalation conditions). Rarely needs editing.

### `src/components/dashboard/InsurancePanel.tsx` — Main UI + Routing Logic

This is a big file (~714 lines) that contains:

1. **The UI** — universal checks, per-product auth/SoS dropdowns, notes
2. **`deriveMondayColumns(patient, resolved)`** (~line 478) — the routing function that converts user selections into display values for the Monday output preview
3. **`MondayOutput` component** (~line 590) — renders the Monday output preview and computes per-product auth result rows inline

**The routing logic in `deriveMondayColumns()`:**

```
User selects "In-Network: Confirmed" + "Active: Confirmed"
  → deriveMondayColumns returns activeNetwork = "Active/In-network"
  → mondayWrite.ts translates that to UNIVERSAL_INDEX.activeNetwork.pass (= 1)
  → writes {"index": 1} to Monday column color_mm2vhwan

User selects Auth = "Required" for CGM Monitor
  → deriveMondayColumns returns auth = "Auths Required"
  → MondayOutput shows CGM auth result = "Required"
  → mondayWrite.ts writes AUTH_RESULT_INDEX.required (= 6) to COL.authResult.monitor

All products have auth = "required" (no SoS-relevant products)
  → deriveMondayColumns returns sos = "Skip"
  → mondayWrite.ts writes UNIVERSAL_INDEX.sos.skip (= 0) to Monday
```

**When to edit:** When you want to change how user selections map to Monday output values. This is where "if I select X, Y, Z → Monday should show W" lives.

### `src/hooks/useMondayPatients.ts` — Data Fetching Hook

React hook that:
- Calls `fetchGroupItems()` on mount and every 30 seconds
- Maintains a **local overlay** (`overlayRef`) so UI edits survive polling re-fetches
- Exposes `update(id, patch)` for local-only changes and `clearOverlay(id)` after successful writes

**When to edit:** Rarely. Only if you need to change polling behavior or add a second data source.

### `src/components/dashboard/SendToMondayButton.tsx` — The Submit Button

Calls `sendPatientToMonday()` and shows success/error state. Straightforward.

---

## Monday Column IDs — Why They Matter

Monday's API uses opaque column IDs like `color_mm2vhwan`. These IDs are:

- **Board-specific** — the same column on a different board has a different ID
- **Immutable** — Monday assigns them when the column is created, they never change
- **Not guessable** — you must query them from the API

**All column IDs live in the `COL` object in `mondayApi.ts`.** This is the single source of truth. If you need a column ID that isn't in `COL`, query the board:

```graphql
{ boards(ids: [18410601299]) { columns { id title type settings_str } } }
```

**Status columns are written by numeric index, not by label text.** The label "Active/In-network" doesn't go to Monday — the number `1` does. The index-to-label mapping is defined in the board's column settings and mirrored in `mondayMapping.ts`. If someone adds a new status label on the Monday board, you need to:

1. Query the column's `settings_str` to find the new index
2. Add it to the appropriate constant in `mondayMapping.ts`
3. Reference it from `mondayWrite.ts`

**Never guess an index.** Getting it wrong writes the wrong status to the board.

---

## Collaboration Rules — Don't Step on Each Other

### Josh's territory:
- `mondayApi.ts` — API plumbing, new columns, new groups
- `mondayWrite.ts` — write logic, new column writes
- `useMondayPatients.ts` — data fetching
- `InsurancePanel.tsx` — UI layout, routing logic in `deriveMondayColumns()`
- GitHub Actions / deployment config

### Brandon's territory:
- `hcpcRules.ts` — insurance rules, payer groups, HCPC codes, dropdown options
- `mondayMapping.ts` — status index values (when Monday board labels change)

### Shared / be careful:
- `workflow.ts` — types and outcome logic (discuss before changing)
- `InsurancePanel.tsx` routing logic — if Brandon needs to change "what gets written when," coordinate with Josh since the routing function touches both rules and write logic

### Before pushing changes:
1. **Test locally** — `npm run dev` and verify the UI renders correctly
2. **Check Monday output preview** — pick a test patient, make selections, verify the Monday Output section shows the right values
3. **Don't edit `READ_COLUMN_IDS`** without discussing — adding columns can cause 503 errors if you read too many
4. **Don't modify `gql()`** — no proxies, no timeouts, no wrappers. Direct fetch only.

---

## Local Development

```bash
# Clone
git clone https://github.com/medically-modern/Samantha-checklist.git
cd Samantha-checklist

# Install
npm install

# Create .env with the Monday API token
echo "VITE_MONDAY_API_TOKEN=your_token_here" > .env

# Run dev server
npm run dev
```

The Monday API token is the same one used in production. Get it from Josh or from the GitHub repo secrets.

**Build for production:**
```bash
npx vite build --base=/Samantha-checklist/
```

**Deploy:** Just push to `main`. GitHub Actions handles the rest.

---

## Project Structure

```
Samantha-checklist/
├── .github/workflows/deploy.yml    ← GitHub Pages deploy (auto on push to main)
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── InsurancePanel.tsx   ← Main UI + routing logic + Monday output
│   │   │   ├── AuthorizationsPanel.tsx
│   │   │   ├── PatientsSidebar.tsx  ← Patient list sidebar
│   │   │   ├── SendToMondayButton.tsx
│   │   │   ├── PatientCard.tsx
│   │   │   ├── PatientProfileCard.tsx
│   │   │   ├── PillarsChecklist.tsx
│   │   │   ├── PathwayPanel.tsx
│   │   │   └── DoctorRequestPanel.tsx
│   │   └── ui/                     ← shadcn/ui primitives (don't modify)
│   ├── hooks/
│   │   └── useMondayPatients.ts    ← Fetch + poll + local overlay
│   ├── lib/
│   │   ├── mondayApi.ts            ← API client, board/group/column IDs
│   │   ├── mondayMapping.ts        ← Status indices, item→Patient conversion
│   │   ├── mondayWrite.ts          ← sendPatientToMonday() batch writer
│   │   ├── hcpcRules.ts            ← Insurance rules engine (Brandon's file)
│   │   └── workflow.ts             ← Types, outcome logic
│   └── pages/
│       └── Index.tsx               ← Main page, wires everything together
├── CLAUDE.md                       ← This file
├── package.json
├── vite.config.ts
└── index.html
```

---

## Common Tasks

### "Add a new insurance option"
1. Add the insurance name to the `PrimaryInsurance` type in `hcpcRules.ts`
2. Add it to `PRIMARY_INSURANCE_OPTIONS` array in the same file
3. Add its payer group assignment to `SUPPLY_HCPC_GROUP_BY_PAYER`
4. If it routes supplies to Medicaid, add it to `SUPPLIES_ROUTE_TO_MEDICAID`

### "Change what HCPC code a payer gets"
1. Move the payer to the correct group (A/B/C) in `SUPPLY_HCPC_GROUP_BY_PAYER`
2. Or if it's a new group, add it to `SUPPLY_HCPC_GROUPS`

### "Add a new status label on the Monday board"
1. Query the column's `settings_str` to find the new label's index
2. Add the index to the appropriate constant in `mondayMapping.ts`
3. Reference it from `mondayWrite.ts` in the appropriate section

### "Change what Monday writes when the user selects X"
1. Find the routing logic in `InsurancePanel.tsx` → `deriveMondayColumns()`
2. Trace how that display value maps to an index in `mondayWrite.ts`
3. Change the conditional logic in whichever file is appropriate

### "Read a new column from Monday on page load"
1. Add the column ID to `COL` in `mondayApi.ts`
2. Add it to `READ_COLUMN_IDS` — **but be careful, keep this array small**
3. Map it in `mondayItemToPatient()` in `mondayMapping.ts`
