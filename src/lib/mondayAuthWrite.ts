// Per-field auth writes to Monday — fires on each field change (no batch).
// Each function is fire-and-forget from the UI; errors are logged + surfaced via toast.

import {
  COL,
  writeText,
  writeDate,
  writeNumber,
  writeDropdownIds,
} from "./mondayApi";
import type { ProductCodeId, AuthSubmissionMethod } from "./workflow";
import { PRODUCT_CODE_TO_PRODUCT_ID } from "./mondayMapping";
import type { ProductId } from "./hcpcRules";

// Auth Method dropdown option IDs on Monday
const AUTH_METHOD_OPTION_ID: Record<Exclude<AuthSubmissionMethod, "">, number> = {
  "Availity Portal": 1,
  "Fax": 2,
  "United Portal": 3,
  "Fidelis Portal": 4,
  "Carecentrix Portal": 5,
  "Magnacare Portal": 6,
  "UMR Portal": 7,
  "E-paces": 8,
};

function productKey(codeId: ProductCodeId): ProductId {
  return PRODUCT_CODE_TO_PRODUCT_ID[codeId];
}

/** Write Auth Submission Method dropdown for a single product. */
export async function writeAuthMethod(
  itemId: string,
  codeId: ProductCodeId,
  method: AuthSubmissionMethod,
): Promise<void> {
  const col = COL.authMethod[productKey(codeId)];
  const ids = method ? [AUTH_METHOD_OPTION_ID[method]] : [];
  await writeDropdownIds(itemId, col, ids);
}

/** Write Auth Submission Date (text column) for a single product. */
export async function writeAuthSubmissionDate(
  itemId: string,
  codeId: ProductCodeId,
  date: string,
): Promise<void> {
  const col = COL.authSubmissionDate[productKey(codeId)];
  await writeText(itemId, col, date);
}

/** Write Auth ID (text column) for a single product. */
export async function writeAuthId(
  itemId: string,
  codeId: ProductCodeId,
  authId: string,
): Promise<void> {
  const col = COL.authId[productKey(codeId)];
  await writeText(itemId, col, authId);
}

/** Write Auth Start date for a single product. */
export async function writeAuthStart(
  itemId: string,
  codeId: ProductCodeId,
  date: string,
): Promise<void> {
  const col = COL.authStart[productKey(codeId)];
  await writeDate(itemId, col, date);
}

/** Write Auth End date for a single product. */
export async function writeAuthEnd(
  itemId: string,
  codeId: ProductCodeId,
  date: string,
): Promise<void> {
  const col = COL.authEnd[productKey(codeId)];
  await writeDate(itemId, col, date);
}

/** Write Auth Units (numeric column) for a single product. */
export async function writeAuthUnits(
  itemId: string,
  codeId: ProductCodeId,
  units: string,
): Promise<void> {
  const col = COL.authUnits[productKey(codeId)];
  await writeNumber(itemId, col, units);
}
