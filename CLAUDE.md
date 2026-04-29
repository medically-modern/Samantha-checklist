# Samantha Checklist — Insurance & Benefits Tool

## What This Is
Internal tool for Medically Modern's insurance verification workflow. Samantha uses this to process patients through the Benefits → Authorization → Complete pipeline on a Monday.com board.

## Stack
React + Vite + TypeScript + Tailwind CSS + shadcn/ui. Deployed to GitHub Pages via Actions.

## Monday.com Integration
All reads and writes go to **Board ID 18410601299** (Insurance board) via Monday's GraphQL API.

### API Setup
- Endpoint: `https://api.monday.com/v2` (POST, GraphQL)
- Token: baked in at build time via `VITE_MONDAY_API_TOKEN` env var (set as GitHub secret)
- API version header: `2024-10`

### Key Files
```
src/lib/mondayApi.ts      — GraphQL client, board ID, group IDs, column ID map (COL), read query
src/lib/mondayMapping.ts  — Maps Monday items → Patient objects, status index constants
src/lib/mondayWrite.ts    — sendPatientToMonday() — batch writes all columns via Promise.all
src/lib/hcpcRules.ts      — Insurance → HCPC code resolver (which products, which codes, bills-to logic)
src/lib/workflow.ts       — Patient type, InsuranceState type, stage definitions, deriveInsuranceOutcome()
src/hooks/useMondayPatients.ts — React hook: fetches patients, polls every 30s, local overlay for edits
```

### Board Groups
```
Benefits:         group_mm1xr3q3   ← current tab reads from here
Submit Auth:      group_mm1x1416   ← new auth tab reads from here
Auth Outstanding: group_mm2v6d1z
Escalations:      group_mm2vg9gn
Complete / Stuck: group_mm2vw3c0
```

### Column IDs — DO NOT GUESS THESE
All column IDs are defined in `COL` object in `mondayApi.ts`. Never hardcode a column ID anywhere else. If you need a new column, query the board first:
```graphql
{ boards(ids: [18410601299]) { columns { id title type settings_str } } }
```

### Status Columns — Write by Index, Not Label
Monday status columns use numeric indices. The label-to-index mapping is in `mondayMapping.ts`. Example:
- SoS: `{ pass: 1, fail: 2, skip: 0 }` → writes `{"index": 0}` for Skip
- Auth: `{ noAuth: 1, required: 0 }`
- Stage Advancer: `{ stuck: 2, benefitsSos: 3, authorization: 4, authOutstanding: 6, complete: 7 }`

### Read vs Write Flow
- **Read:** `fetchGroupItems(groupId)` pulls items with `READ_COLUMN_IDS` columns. Keep this array minimal (currently 6 columns). More columns = slower API response.
- **Write:** Nothing writes to Monday until user clicks "Send to Monday". `sendPatientToMonday()` fires all mutations in parallel via `Promise.all`.

## Rules
1. **Never add columns to READ_COLUMN_IDS without good reason.** The app was hitting 503s when it read 17 columns. Currently reads 6.
2. **Column IDs are board-specific.** Same board = same IDs across groups. Different board = different IDs entirely.
3. **The `gql()` function must stay clean.** No proxies, no timeouts, no wrappers. Direct fetch to Monday's API.
4. **Status index values come from Monday board settings.** If you need a new status option, query the column's `settings_str` to find or create the index.
5. **Keep automations in separate files.** Each feature/tab should have its own clearly named files.

## Project Structure
```
src/
  components/
    dashboard/          — Main UI panels (InsurancePanel, PatientsSidebar, SendToMondayButton, etc.)
    ui/                 — shadcn/ui primitives (don't modify these)
  hooks/
    useMondayPatients.ts
  lib/
    mondayApi.ts        — API layer (READ)
    mondayWrite.ts      — API layer (WRITE)
    mondayMapping.ts    — Monday ↔ app type conversions + status indices
    hcpcRules.ts        — Insurance/product resolution logic
    workflow.ts         — Core types and business logic
  pages/
    Index.tsx           — Main page, wires everything together
```

## Deployment
Push to `main` → GitHub Actions builds → deploys to GitHub Pages at:
`https://medically-modern.github.io/Samantha-checklist/`

The Monday API token must be set as a repository secret named `VITE_MONDAY_API_TOKEN`.

## Rules & Configuration (for Brandon)

The business rules live in two files. Everything else consumes their output — do not scatter rules into other files.

### `src/lib/hcpcRules.ts` — Product & Insurance Rules
This file answers: "Given a patient's insurance and serving type, what products do they get and what HCPC codes apply?"

- **`SERVING_PRODUCTS`** — Maps each serving type (e.g. "Insulin Pump + CGM") to its list of active products. Edit this to change what products appear for each serving type.
- **`SUPPLY_HCPC_GROUP_BY_PAYER`** — Maps each insurance to a supply code group (A, B, or C). Groups determine which infusion set / cartridge HCPC codes are used. Edit this when adding a new insurance or changing a payer's group.
- **`SUPPLY_HCPC_GROUPS`** — Defines the actual HCPC codes for each group (A/B/C). Only edit if the codes themselves change.
- **`SUPPLIES_ROUTE_TO_MEDICAID`** — Set of insurances where supplies bill to Medicaid instead of primary. Edit this when adding/removing a Medicaid-routing payer.
- **`PRIMARY_INSURANCE_OPTIONS`** / **`SERVING_OPTIONS`** — The dropdown lists shown in the UI. Must stay in sync with Monday board dropdown labels.

### `src/lib/mondayMapping.ts` — Status Index Mappings
This file answers: "What number do I write to Monday for each status label?"

- **`UNIVERSAL_INDEX`** — Indices for Active/Network, DME Benefits, SoS, Auth columns.
- **`AUTH_RESULT_INDEX`** — Indices for the 5 per-product auth result columns (Evaluate, Auth Valid, Denied, No Auth Needed, Submitted, Required, Not Serving).
- **`STAGE_INDEX`** — Stage Advancer indices.
- **`ESCALATION_INDEX`** — Escalation column indices.
- **`NOT_CLEAR_PRODUCT_ID`** — Dropdown option IDs for the "Not Clear Products" column.

**If you add a new status label on the Monday board**, query the column's `settings_str` to find its index, then add it here. Never guess indices.

### What NOT to edit for rule changes
- `mondayApi.ts` — API plumbing, not rules
- `mondayWrite.ts` — Reads from the mapping files above, doesn't contain rules
- `workflow.ts` — Type definitions and outcome logic, not insurance/product rules
