// Monday.com GraphQL client — direct from browser.
// Token is read from VITE_MONDAY_API_TOKEN at build time.

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_VERSION = "2024-10";

export const BOARD_ID = 18410601299;

export const GROUPS = {
  benefits: "group_mm1xr3q3",
  submitAuth: "group_mm1x1416",
  authOutstanding: "group_mm2v6d1z",
  escalations: "group_mm2vg9gn",
  complete: "group_mm2vw3c0",
} as const;

// Read columns
export const COL = {
  serving: "color_mm1w1cm9",
  primaryInsurance: "color_mm1x157j",
  doctorName: "text_mm1x46et",
  clinicName: "dropdown_mm1xbvas",
  dob: "text_mm1xvxst",
  memberId1: "text_mm1x2qk2",
  memberId2: "text_mm1xaccx",

  // Universal write columns
  activeNetwork: "color_mm2vhwan",
  dmeBenefits: "color_mm2vt8xg",
  sos: "color_mm2vemyy",
  auth: "color_mm2vg3ew",

  // Escalation + stage flow
  escalation: "color_mm2vsh2f",
  stageAdvancer: "color_mm1ws96t",
  notClearProducts: "dropdown_mm2vez5a",

  callReferenceNotes: "long_text_mm2ffsme",

  // Per-product auth result columns
  authResult: {
    monitor: "color_mm1wgjd1",
    sensors: "color_mm1x5c99",
    insulin_pump: "color_mm1xnzmn",
    infusion_set: "color_mm1xr2j1",
    cartridge: "color_mm1xybvt",
  },
} as const;

export const READ_COLUMN_IDS = [
  COL.serving,
  COL.primaryInsurance,
  COL.dob,
  COL.memberId1,
  COL.memberId2,
  COL.callReferenceNotes,
];

/** Extended read columns for auth groups — includes auth results + universal statuses */
export const AUTH_READ_COLUMN_IDS = [
  ...READ_COLUMN_IDS,
  COL.activeNetwork,
  COL.dmeBenefits,
  COL.sos,
  COL.auth,
  COL.authResult.monitor,
  COL.authResult.sensors,
  COL.authResult.insulin_pump,
  COL.authResult.infusion_set,
  COL.authResult.cartridge,
];

const AUTH_GROUP_IDS = new Set([GROUPS.submitAuth, GROUPS.authOutstanding]);

export interface MondayColumnValue {
  id: string;
  text: string | null;
  value: string | null;
}

export interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
}

function getToken(): string {
  return (import.meta.env.VITE_MONDAY_API_TOKEN as string | undefined) ?? "";
}

export function hasToken(): boolean {
  return !!getToken();
}

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("VITE_MONDAY_API_TOKEN is not set");
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Monday API HTTP error", { status: res.status, body });
    throw new Error(`Monday request failed (${res.status})`);
  }
  const json = await res.json();
  if (json.errors) {
    console.error("Monday API GraphQL error", json.errors);
    throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
  }
  return json.data as T;
}

export async function fetchGroupItems(groupId: string = GROUPS.benefits): Promise<MondayItem[]> {
  const query = `
    query ($boardId: ID!, $cols: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 100, query_params: { rules: [{ column_id: "group", compare_value: ${JSON.stringify([groupId])} }] }) {
          items {
            id
            name
            column_values(ids: $cols) { id text value }
          }
        }
      }
    }
  `;
  const cols = AUTH_GROUP_IDS.has(groupId) ? AUTH_READ_COLUMN_IDS : READ_COLUMN_IDS;
  const data = await gql<{ boards: { items_page: { items: MondayItem[] } }[] }>(query, {
    boardId: BOARD_ID,
    cols,
  });
  return data.boards?.[0]?.items_page?.items ?? [];
}

/**
 * Write a status column by index. value is a JSON string like '{"index": 1}'.
 */
export async function writeStatusIndex(itemId: string, columnId: string, index: number): Promise<void> {
  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
    }
  `;
  await gql(query, {
    boardId: BOARD_ID,
    itemId,
    columnId,
    value: JSON.stringify({ index }),
  });
}

/**
 * Write a long_text column.
 */
export async function writeLongText(itemId: string, columnId: string, text: string): Promise<void> {
  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
    }
  `;
  await gql(query, {
    boardId: BOARD_ID,
    itemId,
    columnId,
    value: JSON.stringify({ text }),
  });
}

/**
 * Write a dropdown column (multi-select) by option ids.
 */
export async function writeDropdownIds(itemId: string, columnId: string, ids: number[]): Promise<void> {
  const query = `
    mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
    }
  `;
  await gql(query, {
    boardId: BOARD_ID,
    itemId,
    columnId,
    value: JSON.stringify({ ids }),
  });
}

