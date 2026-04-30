// Direct (non-debounced) batch writes to Monday for a single patient.
// All edits are kept local until the user clicks "Send to Monday".
//
// Each column write retries up to 2 times on failure. Any columns that
// still fail after retries are logged to the "Josh Debug" column so
// nothing is silently lost.

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

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

interface WriteTask {
  label: string;
  columnId: string;
  fn: () => Promise<unknown>;
}

/**
 * Execute a single write with retries.
 * Returns null on success, or an error message string on final failure.
 */
async function executeWithRetry(task: WriteTask): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await task.fn();
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[mondayWrite] ${task.label} (${task.columnId}) failed attempt ${attempt + 1}/${MAX_RETRIES + 1}: ${msg}`,
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      } else {
        return `${task.label} (${task.columnId}): ${msg}`;
      }
    }
  }
  return null;
}

/**
 * Push every relevant column for a patient to Monday in one batch.
 * Each column is written independently with retries. Columns that fail
 * after all retries are logged to the Josh Debug column.
 *
 * Throws if any columns failed (after logging), so the UI shows an error.
 */
export async function sendPatientToMonday(p: Patient, context: "benefits" | "submitAuth" | "authOutstanding" = "benefits"): Promise<void> {
  const ins = p.insurance ?? EMPTY_INSURANCE;
  const tasks: WriteTask[] = [];

  // ----- Guard: require Serving + Primary Insurance -----
  const resolved = resolveHcpcs(p.primaryInsurance || null, p.serving || null);
  if (!p.serving || !p.primaryInsurance || resolved.length === 0) {
    throw new Error(
      "Cannot send: Serving and Primary Insurance must both be selected before writing to Monday.",
    );
  }

  // ----- Universal: Active / In-Network -----
  const inNet = ins.universal["in-network"];
  const active = ins.universal["active"];
  if (inNet === "confirmed" && active === "confirmed") {
    tasks.push({
      label: "Active/Network",
      columnId: COL.activeNetwork,
      fn: () => writeStatusIndex(p.id, COL.activeNetwork, UNIVERSAL_INDEX.activeNetwork.pass),
    });
  } else if (inNet === "not-confirmed" || active === "not-confirmed") {
    tasks.push({
      label: "Active/Network",
      columnId: COL.activeNetwork,
      fn: () => writeStatusIndex(p.id, COL.activeNetwork, UNIVERSAL_INDEX.activeNetwork.fail),
    });
  }

  // ----- Universal: DME Benefits -----
  const dme = ins.universal["dme-benefits"];
  if (dme === "confirmed") {
    tasks.push({
      label: "DME Benefits",
      columnId: COL.dmeBenefits,
      fn: () => writeStatusIndex(p.id, COL.dmeBenefits, UNIVERSAL_INDEX.dmeBenefits.pass),
    });
  } else if (dme === "not-confirmed") {
    tasks.push({
      label: "DME Benefits",
      columnId: COL.dmeBenefits,
      fn: () => writeStatusIndex(p.id, COL.dmeBenefits, UNIVERSAL_INDEX.dmeBenefits.fail),
    });
  }

  // ----- Per-product auth-result columns -----
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
      // When sending from Submit Auth tab, flip auth result to "Submitted"
      if (context === "submitAuth") {
        tasks.push({
          label: `Auth result: ${productId}`,
          columnId: authColumnId,
          fn: () => writeStatusIndex(p.id, authColumnId, AUTH_RESULT_INDEX.submitted),
        });
      } else {
        tasks.push({
          label: `Auth result: ${productId}`,
          columnId: authColumnId,
          fn: () => writeStatusIndex(p.id, authColumnId, AUTH_RESULT_INDEX.required),
        });
      }
    } else if (state.auth === "not-required" && context !== "submitAuth" && context !== "authOutstanding") {
      // Skip when in submit-auth flow — leave non-auth-required results untouched
      tasks.push({
        label: `Auth result: ${productId}`,
        columnId: authColumnId,
        fn: () => writeStatusIndex(p.id, authColumnId, AUTH_RESULT_INDEX.noAuthNeeded),
      });
    }
  }

  // Write "Not Serving" for products NOT in this patient's serving type
  // Skip when in submit-auth flow — leave other auth results untouched
  if (context !== "submitAuth" && context !== "authOutstanding") {
    const allProductIds = Object.keys(COL.authResult) as Array<keyof typeof COL.authResult>;
    for (const prodKey of allProductIds) {
      if (!servedProductKeys.has(prodKey)) {
        tasks.push({
          label: `Auth result: ${prodKey} (not serving)`,
          columnId: COL.authResult[prodKey],
          fn: () => writeStatusIndex(p.id, COL.authResult[prodKey], AUTH_RESULT_INDEX.notServing),
        });
      }
    }
  }

  // ----- Not Clear Products dropdown -----
  const notClearIds = entries
    .filter((e) => e.state?.auth !== "required" && e.state?.sos === "not-clear")
    .map((e) => NOT_CLEAR_PRODUCT_ID[e.cid])
    .filter((n): n is number => typeof n === "number");
  tasks.push({
    label: "Not Clear Products",
    columnId: COL.notClearProducts,
    fn: () => writeDropdownIds(p.id, COL.notClearProducts, notClearIds),
  });

  // ----- Aggregate SoS + Auth -----
  const states = entries.map((e) => e.state);
  const allFilled =
    states.length > 0 &&
    states.every((s) => !!s?.auth && (s.auth === "required" || !!s?.sos));
  if (allFilled) {
    const anyAuth = states.some((s) => s?.auth === "required");
    const sosRelevant = states.filter((s) => s?.auth !== "required");
    const anyNotClear = sosRelevant.some((s) => s?.sos === "not-clear");

    tasks.push({
      label: "Auth aggregate",
      columnId: COL.auth,
      fn: () =>
        writeStatusIndex(p.id, COL.auth, anyAuth ? UNIVERSAL_INDEX.auth.required : UNIVERSAL_INDEX.auth.noAuth),
    });

    if (sosRelevant.length === 0) {
      tasks.push({
        label: "SoS aggregate",
        columnId: COL.sos,
        fn: () => writeStatusIndex(p.id, COL.sos, UNIVERSAL_INDEX.sos.skip),
      });
    } else {
      tasks.push({
        label: "SoS aggregate",
        columnId: COL.sos,
        fn: () =>
          writeStatusIndex(p.id, COL.sos, anyNotClear ? UNIVERSAL_INDEX.sos.fail : UNIVERSAL_INDEX.sos.pass),
      });
    }
  }

  // ----- Escalation + Stage Advancer -----
  if (context === "submitAuth") {
    tasks.push({
      label: "Stage Advancer",
      columnId: COL.stageAdvancer,
      fn: () => writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.authOutstanding),
    });
  } else if (context === "authOutstanding") {
    tasks.push({
      label: "Stage Advancer",
      columnId: COL.stageAdvancer,
      fn: () => writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.authOutstanding),
    });
  } else {
    const outcome = deriveInsuranceOutcome(ins);
    if (outcome === "blocker") {
      tasks.push({
        label: "Escalation",
        columnId: COL.escalation,
        fn: () => writeStatusIndex(p.id, COL.escalation, ESCALATION_INDEX.required),
      });
      tasks.push({
        label: "Stage Advancer",
        columnId: COL.stageAdvancer,
        fn: () => writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.stuck),
      });
    } else if (outcome === "all-clear") {
      tasks.push({
        label: "Stage Advancer",
        columnId: COL.stageAdvancer,
        fn: () => writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.complete),
      });
    } else if (outcome === "auth-required") {
      tasks.push({
        label: "Stage Advancer",
        columnId: COL.stageAdvancer,
        fn: () => writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.authOutstanding),
      });
    } else {
      tasks.push({
        label: "Stage Advancer",
        columnId: COL.stageAdvancer,
        fn: () => writeStatusIndex(p.id, COL.stageAdvancer, STAGE_INDEX.benefitsSos),
      });
    }
  }

  // ----- Per-product auth submission fields (Authorizations tab) -----
  for (const { cid, state } of entries) {
    if (!state) continue;
    const productId = PRODUCT_CODE_TO_PRODUCT_ID[cid];

    // Auth Submission Method (dropdown)
    if (state.authSubmissionMethod) {
      const optId = AUTH_METHOD_OPTION_ID[state.authSubmissionMethod];
      if (optId !== undefined) {
        tasks.push({
          label: `Auth method: ${productId}`,
          columnId: COL.authMethod[productId],
          fn: () => writeDropdownIds(p.id, COL.authMethod[productId], [optId]),
        });
      }
    }

    // Auth Submission Date (text column)
    if (state.authSubmissionDate) {
      tasks.push({
        label: `Auth submit date: ${productId}`,
        columnId: COL.authSubmissionDate[productId],
        fn: () => writeText(p.id, COL.authSubmissionDate[productId], state.authSubmissionDate!),
      });
    }

    // Auth ID (text column)
    if (state.authId) {
      tasks.push({
        label: `Auth ID: ${productId}`,
        columnId: COL.authId[productId],
        fn: () => writeText(p.id, COL.authId[productId], state.authId!),
      });
    }

    // Auth Start (date column)
    if (state.authStart) {
      tasks.push({
        label: `Auth start: ${productId}`,
        columnId: COL.authStart[productId],
        fn: () => writeDate(p.id, COL.authStart[productId], state.authStart!),
      });
    }

    // Auth End (date column)
    if (state.authEnd) {
      tasks.push({
        label: `Auth end: ${productId}`,
        columnId: COL.authEnd[productId],
        fn: () => writeDate(p.id, COL.authEnd[productId], state.authEnd!),
      });
    }

    // Auth Units (numeric column)
    if (state.authUnits) {
      tasks.push({
        label: `Auth units: ${productId}`,
        columnId: COL.authUnits[productId],
        fn: () => writeNumber(p.id, COL.authUnits[productId], state.authUnits!),
      });
    }
  }

  // ----- Carecentrix Intake ID (single shared text column) -----
  const allCodeStates = Object.values(ins.codes).filter(Boolean) as ProductCodeState[];
  const intakeId = allCodeStates.map((s) => s.intakeId).find((v) => !!v);
  if (intakeId) {
    tasks.push({
      label: "Carecentrix Intake ID",
      columnId: COL.carecentrixIntakeId,
      fn: () => writeText(p.id, COL.carecentrixIntakeId, intakeId),
    });
  }

  // ----- Notes (long text) -----
  if (typeof p.notes === "string") {
    tasks.push({
      label: "Call Reference Notes",
      columnId: COL.callReferenceNotes,
      fn: () => writeLongText(p.id, COL.callReferenceNotes, p.notes),
    });
  }

  // ----- Execute all writes in parallel, each with independent retries -----
  const results = await Promise.all(tasks.map(executeWithRetry));
  const failures = results.filter((r): r is string => r !== null);

  if (failures.length > 0) {
    // Log failures to Josh Debug column (best-effort, no retry on this one)
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const debugMsg = `[${timestamp}] ${failures.length} write(s) failed:\n${failures.join("\n")}`;
    try {
      await writeText(p.id, COL.joshDebug, debugMsg);
    } catch {
      console.error("[mondayWrite] Could not write to Josh Debug column:", debugMsg);
    }

    const succeeded = tasks.length - failures.length;
    throw new Error(
      `${failures.length} column(s) failed after retries (${succeeded} succeeded). Check "Josh Debug" column. Failed: ${failures.map((f) => f.split(":")[0]).join(", ")}`,
    );
  }
}
