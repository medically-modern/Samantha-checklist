// Direct (non-debounced) batch writes to Monday for a single patient.
// All edits are kept local until the user clicks "Send to Monday".

import { writeStatusIndex, writeLongText, writeDropdownIds, writeText, writeDate, writeNumber, COL } from "./mondayApi";
import { resolveHcpcs } from "./hcpcRules";
import {
  AUTH_RESULT_INDEX,
  AUTH_METHOD_OPTION_ID,
  ESCALATION_INDEX,
  NOT_CLEAR_PRODUCT_ID,
  PRODUCT_CODE_TO_PRODUCT_ID,
  STAGE_INDEX,
  UNIVERSAL_INDEX,
} from "./mondayMapping";
import type { Patient, ProductCodeId, ProductCodeState } from "./workflow";
import { EMPTY_INSURANCE, deriveInsuranceOutcome } from "./workflow";

/**
 * Push every relevant column for a patient to Monday in one batch.
 * Resolves once all writes succeed; rejects on the first failure.
 */
export async function sendPatientToMonday(p: Patient): Promise<void> {
  const ins = p.insurance ?? EMPTY_INSURANCE;
  const tasks: Promise<unknown>[] = [];

  // ----- Universal: Active / In-Network -----
  const inNet = ins.universal["in-network"];
  const active = ins.universal["active"];
  if (inNet === "confirmed" && active === "confirmed") {
    tasks.push(writeStatusIndex(p.id, COL.activeNetwork, UNIVERSAL_INDEX.activeNetwork.pass));
  } else if (inNet === "not-confirmed" || active === "not-confirmed") {
    tasks.push(writeStatusIndex(p.id, COL.activeNetwork, UNIVERSAL_INDEX.activeNetwork.fail));
  }

  // ----- Universal: DME Benefits -----
  const dme = ins.universal["dme-benefits"];
  if (dme === "confirmed") {
    tasks.push(writeStatusIndex(p.id, COL.dmeBenefits, UNIVERSAL_INDEX.dmeBenefits.pass));
  } else if (dme === "not-confirmed") {
    tasks.push(writeStatusIndex(p.id, COL.dmeBenefits, UNIVERSAL_INDEX.dmeBenefits.fail));
  }

  // ----- Per-product auth-result columns -----
  const resolved = resolveHcpcs(p.primaryInsurance || null, p.serving || null);
  const entries = resolved
    .map((r) => {
      const cid = Object.entries(PRODUCT_CODE_TO_PRODUCT_ID).find(([, v]) => v === r.product)?.[0] as
        | ProductCodeId
        | undefined;
      return cid ? { cid, state: ins.codes[cid] } : null;
    })
    .filter((e): e is { cid: ProductCodeId; state: ProductCodeState | undefined } => !!e);

  // Write auth result for served products
  const servedProductKeys = new Set(entries.map((e) => PRODUCT_CODE_TO_PRODUCT_ID[e.cid]));
  for (const { cid, state } of entries) {
    if (!state?.auth) continue;
    const productId = PRODUCT_CODE_TO_PRODUCT_ID[cid];
    const authColumnId = COL.authResult[productId];
    if (state.auth === "required") {
      tasks.push(writeStatusIndex(p.id, authColumnId, AUTH_RESULT_INDEX.required));
    } else if (state.auth === "not-required") {
      tasks.push(writeStatusIndex(p.id, authColumnId, AUTH_RESULT_INDEX.noAuthNeeded));
    }
  }

  // Write "Not Serving" for products NOT in this patient's serving type
  const allProductIds = Object.keys(COL.authResult) as Array<keyof typeof COL.authResult>;
  for (const prodKey of allProductIds) {
    if (!servedProductKeys.has(prodKey)) {
      tasks.push(writeStatusIndex(p.id, COL.authResult[prodKey], AUTH_RESULT_INDEX.notServing));
    }
  }

  // ----- Not Clear Products dropdown — skip products whose auth is required (SoS doesn't apply) -----
  const notClearIds = entries
    .filter((e) => e.state?.auth !== "required" && e.state?.sos === "not-clear")
    .map((e) => NOT_CLEAR_PRODUCT_ID[e.cid])
    .filter((n): n is number => typeof n === "number");
  tasks.push(writeDropdownIds(p.id, COL.notClearProducts, notClearIds));

  // ----- Aggregate SoS + Auth -----
  // A product whose auth is "required" auto-skips SoS.
  const states = entries.map((e) => e.state);
  const allFilled =
    states.length > 0 &&
    states.every((s) => !!s?.auth && (s.auth === "required" || !!s?.sos));
  if (allFilled) {
    const anyAuth = states.some((s) => s?.auth === "required");
    const sosRelevant = states.filter((s) => s?.auth !== "required");
    const anyNotClear = sosRelevant.some((s) => s?.sos === "not-clear");
    tasks.push(
      writeStatusIndex(p.id, COL.auth, anyAuth ? UNIVERSAL_INDEX.auth.required : UNIVERSAL_INDEX.auth.noAuth),
    );
    if (sosRelevant.length === 0) {
      tasks.push(writeStatusIndex(p.id, COL.sos, UNIVERSAL_INDEX.sos.skip));
    } else {
      tasks.push(
        writeStatusIndex(p.id, COL.sos, anyNotClear ? UNIVERSAL_INDEX.sos.fail : UNIVERSAL_INDEX.sos.pass),
      );
    }
  }

  // ----- Escalation + Stage Advancer -----
  const outcome = deriveInsuranceOutcome(ins);
  if (outcome === "blocker") {
    tasks.push(writeStatusIndex(p.id, COL.escalation, ESCALATION_INDEX.required));
    tasks.push(writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.stuck));
  } else if (outcome === "all-clear") {
    tasks.push(writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.complete));
  } else if (outcome === "auth-required") {
    tasks.push(writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.authorization));
  } else {
    tasks.push(writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.benefitsSos));
  }


  // ----- Per-product auth submission fields (Authorizations tab) -----
  for (const { cid, state } of entries) {
    if (!state) continue;
    const productId = PRODUCT_CODE_TO_PRODUCT_ID[cid];

    // Auth Submission Method (dropdown)
    if (state.authSubmissionMethod) {
      const optId = AUTH_METHOD_OPTION_ID[state.authSubmissionMethod];
      if (optId !== undefined) {
        tasks.push(writeDropdownIds(p.id, COL.authMethod[productId], [optId]));
      }
    }

    // Auth Submission Date (text column)
    if (state.authSubmissionDate) {
      tasks.push(writeText(p.id, COL.authSubmissionDate[productId], state.authSubmissionDate));
    }

    // Auth ID (text column)
    if (state.authId) {
      tasks.push(writeText(p.id, COL.authId[productId], state.authId));
    }

    // Auth Start (date column)
    if (state.authStart) {
      tasks.push(writeDate(p.id, COL.authStart[productId], state.authStart));
    }

    // Auth End (date column)
    if (state.authEnd) {
      tasks.push(writeDate(p.id, COL.authEnd[productId], state.authEnd));
    }

    // Auth Units (numeric column)
    if (state.authUnits) {
      tasks.push(writeNumber(p.id, COL.authUnits[productId], state.authUnits));
    }
  }

  // ----- Carecentrix Intake ID (single shared text column) -----
  // All products share one column; write the first non-empty intakeId found
  const intakeId = entries
    .map((e) => e.state?.intakeId)
    .find((v) => !!v);
  if (intakeId) {
    tasks.push(writeText(p.id, COL.carecentrixIntakeId, intakeId));
  }

  // ----- Notes (long text) -----
  if (typeof p.notes === "string") {
    tasks.push(writeLongText(p.id, COL.callReferenceNotes, p.notes));
  }

  await Promise.all(tasks);
}
