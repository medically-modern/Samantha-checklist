import {
  Patient,
  UNIVERSAL_CHECKS,
  PRODUCT_CODES,
  ProductCodeId,
  ProductCodeState,
  CodeStatus,
  EMPTY_INSURANCE,
  deriveInsuranceOutcome,
  AuthChoice,
  SosChoice,
  UniversalChoice,
} from "@/lib/workflow";
import {
  resolveHcpcs,
  PRODUCT_LABELS,
  type PrimaryInsurance,
  type Serving,
  type ProductId,
  type ResolvedProduct,
} from "@/lib/hcpcRules";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck, ShieldAlert, Repeat, Package, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  patient: Patient;
  onUniversalChange: (id: string, value: UniversalChoice) => void;
  onCodeChange: (codeId: ProductCodeId, patch: Partial<ProductCodeState>) => void;
  onNotesChange: (v: string) => void;
}

// Map resolver ProductId → existing ProductCodeId used for state tracking
const PRODUCT_TO_CODE_ID: Record<ProductId, ProductCodeId> = {
  monitor: "cgm-monitor",
  sensors: "cgm-sensors",
  insulin_pump: "pump",
  infusion_set: "infusion-sets",
  cartridge: "cartridges",
};

export function InsurancePanel({
  patient,
  onUniversalChange,
  onCodeChange,
  onNotesChange,
}: Props) {
  const ins = patient.insurance ?? EMPTY_INSURANCE;
  const universalDone = Object.values(ins.universal).every((v) => v === "confirmed");
  const universalCount = Object.values(ins.universal).filter((v) => v === "confirmed").length;

  const serving = patient.serving || "";
  const primaryInsurance = patient.primaryInsurance || "";
  const resolved: ResolvedProduct[] = resolveHcpcs(primaryInsurance || null, serving || null);
  const servedCodeIds = resolved.map((r) => PRODUCT_TO_CODE_ID[r.product]);
  const outcome = deriveInsuranceOutcome(ins, servedCodeIds);
  const dropdownsReady = !!serving && !!primaryInsurance;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Insurance & Benefits · Samantha</h2>
          <p className="text-xs text-muted-foreground">
            Work top to bottom. Each step unlocks the next.
          </p>
        </div>
      </div>

      {/* STEP 1 — Patient context (read-only from Monday) */}
      <StepSection
        number={1}
        title="Patient context"
        subtitle="Serving and insurance pulled from Monday — not editable here."
        complete={dropdownsReady}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Serving
            </label>
            <div className="mt-1 h-9 flex items-center px-3 rounded-md border bg-muted text-sm">
              {serving || <span className="text-muted-foreground">—</span>}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Primary Insurance
            </label>
            <div className="mt-1 h-9 flex items-center px-3 rounded-md border bg-muted text-sm">
              {primaryInsurance || <span className="text-muted-foreground">—</span>}
            </div>
          </div>
        </div>
      </StepSection>

      {/* STEP 2 — Phone call universal checks */}
      <StepSection
        number={2}
        title="Call the payer · confirm universal checks"
        subtitle="Fill these from a phone call to the insurance payer. All three required."
        complete={universalDone}
        rightAccessory={
          <span
            className={cn(
              "text-[10px] font-mono px-2 py-1 rounded",
              universalDone ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {universalCount}/3 confirmed
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {UNIVERSAL_CHECKS.map((check, i) => {
            const value: UniversalChoice = ins.universal[check.id] ?? "";
            const confirmed = value === "confirmed";
            const notConfirmed = value === "not-confirmed";
            return (
              <div
                key={check.id}
                className={cn(
                  "flex flex-col gap-2 p-3 rounded-lg border transition-colors",
                  confirmed && "border-success/40 bg-success/5",
                  notConfirmed && "border-destructive/40 bg-destructive/5",
                  !value && "bg-background",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground">CHECK 0{i + 1}</span>
                    <span className="font-medium text-sm">{check.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{check.hint}</p>
                </div>
                <Select
                  value={value || "__none__"}
                  onValueChange={(v) => onUniversalChange(check.id, (v === "__none__" ? "" : v) as UniversalChoice)}
                >
                  <SelectTrigger
                    className={cn(
                      "mt-auto h-9 text-sm font-medium",
                      confirmed && "bg-success/10 border-success/40 text-success",
                      notConfirmed && "bg-destructive/10 border-destructive/40 text-destructive",
                    )}
                  >
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Not selected —</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="not-confirmed">Not Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </StepSection>

      {/* STEP 3 — Product cards */}
      <StepSection
        number={3}
        title="Product-Specific SoS and Auth Requirements"
        subtitle="For each product, select Auth Requirements and Same or Similar status."
        complete={
          dropdownsReady &&
          resolved.length > 0 &&
          resolved.every((r) => {
            const s = ins.codes[PRODUCT_TO_CODE_ID[r.product]];
            // Auth required → SoS auto-skipped; otherwise both must be set
            return !!s?.auth && (s.auth === "required" || !!s?.sos);
          })
        }
      >
        {!dropdownsReady && (
          <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Select Serving and Primary Insurance to load the codes for this patient.
            </p>
          </div>
        )}

        {dropdownsReady && (
          <div className="space-y-3">
            {resolved.map((r) => {
              const codeId = PRODUCT_TO_CODE_ID[r.product];
              const meta = PRODUCT_CODES.find((c) => c.id === codeId);
              if (!meta) return null;
              const state = ins.codes[codeId] ?? { status: "pending" as CodeStatus };
              return (
                <CodeCard
                  key={codeId}
                  meta={meta}
                  resolved={r}
                  state={state}
                  universalDone={universalDone}
                  onChange={(patch) => onCodeChange(codeId, patch)}
                />
              );
            })}
          </div>
        )}
      </StepSection>

      {/* Notes — copy/paste into Call Reference Notes column */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Notes — copy/paste into Call Reference Notes column</h3>
          <p className="text-[11px] text-muted-foreground">
            Working notes for this call. Copy into the Monday "Call Reference Notes" column when done.
          </p>
        </div>
        <Textarea
          value={patient.notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={5}
          placeholder="Call Reference Notes, including SoS last bill dates and any other important information..."
          className="bg-background"
        />
      </div>

      {/* Monday output */}
      {dropdownsReady && (
        <MondayOutput patient={patient} resolved={resolved} outcome={outcome} />
      )}
    </section>
  );
}

function StepSection({
  number,
  title,
  subtitle,
  complete,
  rightAccessory,
  children,
}: {
  number: number;
  title: string;
  subtitle?: string;
  complete?: boolean;
  rightAccessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-xl border-2 p-4 transition-colors border-border bg-muted/10",
    )}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border-2",
            complete
              ? "bg-success/15 text-success border-success/40"
              : "bg-background text-foreground border-border",
          )}>
            {number}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Step {number} · {title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {rightAccessory}
      </div>
      {children}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: ReturnType<typeof deriveInsuranceOutcome> }) {
  if (outcome === "all-clear") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-success/15 text-success">
        <CheckCircle2 className="h-3.5 w-3.5" /> All clear · ready for welcome call
      </span>
    );
  }
  if (outcome === "auth-required") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-warning/20 text-warning-foreground">
        <Clock className="h-3.5 w-3.5" /> Auth required
      </span>
    );
  }
  if (outcome === "blocker") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/30">
        <AlertTriangle className="h-3.5 w-3.5" /> Escalate
      </span>
    );
  }
  return null;
}

interface CardProps {
  meta: typeof PRODUCT_CODES[number];
  resolved: ResolvedProduct;
  state: ProductCodeState;
  universalDone: boolean;
  onChange: (patch: Partial<ProductCodeState>) => void;
}

function CodeCard({ meta, resolved, state, universalDone, onChange }: CardProps) {
  const billsToMedicaid = resolved.billsTo === "medicaid";
  const auth: AuthChoice = state.auth ?? "";
  const sos: SosChoice = state.sos ?? "";
  const isRecurring = meta.cadence === "RECURRING";

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 border border-border bg-background p-4",
        isRecurring ? "border-l-primary" : "border-l-accent-foreground/40",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full",
                isRecurring
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-foreground/70 border border-border",
              )}
            >
              {isRecurring ? <Repeat className="h-3 w-3" /> : <Package className="h-3 w-3" />}
              {meta.cadence}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">{meta.group}</span>
          </div>
          <h4 className="text-sm font-semibold">{meta.name}</h4>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs font-mono text-muted-foreground">HCPCS · {resolved.hcpc}</p>
            {billsToMedicaid && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                Bills to Medicaid
              </span>
            )}
          </div>
        </div>
        <StatusPill auth={auth} sos={sos} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Auth Requirements
          </label>
          <Select
            value={auth || "__none__"}
            onValueChange={(v) => onChange({ auth: (v === "__none__" ? "" : v) as AuthChoice })}
          >
            <SelectTrigger
              className={cn(
                "mt-1 h-9 font-medium",
                auth === "required" && "bg-warning/15 border-warning/50 text-warning-foreground",
                auth === "not-required" && "bg-success/10 border-success/40 text-success",
              )}
            >
              <SelectValue placeholder="Select auth status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Not selected —</SelectItem>
              <SelectItem value="not-required">Not Required</SelectItem>
              <SelectItem value="required">Required</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Same or Similar
            {auth === "required" && (
              <span className="ml-1.5 text-[9px] font-normal normal-case tracking-normal text-muted-foreground italic">
                (skipped — auth required)
              </span>
            )}
          </label>
          <Select
            value={sos || "__none__"}
            onValueChange={(v) => onChange({ sos: (v === "__none__" ? "" : v) as SosChoice })}
            disabled={auth === "required"}
          >
            <SelectTrigger
              className={cn(
                "mt-1 h-9 font-medium",
                auth === "required" && "bg-muted/40 border-dashed text-muted-foreground italic",
                auth !== "required" && sos === "not-clear" && "bg-warning/15 border-warning/50 text-warning-foreground",
                auth !== "required" && sos === "clear" && "bg-success/10 border-success/40 text-success",
              )}
            >
              <SelectValue placeholder={auth === "required" ? "Skip" : "Select SoS status…"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Not selected —</SelectItem>
              <SelectItem value="clear">Clear</SelectItem>
              <SelectItem value="not-clear">Not Clear</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ auth, sos }: { auth: AuthChoice; sos: SosChoice }) {
  if (!auth || !sos) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium bg-muted text-muted-foreground">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  }
  if (sos === "not-clear") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium bg-warning/20 text-warning-foreground">
        <ShieldAlert className="h-3 w-3" /> SoS not clear
      </span>
    );
  }
  if (auth === "required") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium bg-warning/20 text-warning-foreground">
        <Clock className="h-3 w-3" /> Auth required
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium bg-success/15 text-success">
      <ShieldCheck className="h-3 w-3" /> Clear
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Monday.com output — copy/paste helper
// ─────────────────────────────────────────────────────────────────────

function deriveMondayColumns(patient: Patient, resolved: ResolvedProduct[]) {
  const ins = patient.insurance ?? EMPTY_INSURANCE;
  const u = ins.universal;

  const universalAllConfirmed =
    u["in-network"] === "confirmed" &&
    u["active"] === "confirmed" &&
    u["dme-benefits"] === "confirmed";
  const anyUniversalNotConfirmed = Object.values(u).some((v) => v === "not-confirmed");

  // 1) Active/Network — both must be confirmed
  const activeNetwork =
    u["in-network"] === "confirmed" && u["active"] === "confirmed" ? "Active/In-network" : "Stuck";

  // 2) DME Benefits
  const dmeBenefits = u["dme-benefits"] === "confirmed" ? "Yes" : "Partial / No";

  // Per-product states (only those active for this serving)
  const productStates = resolved.map((r) => {
    const codeId = PRODUCT_TO_CODE_ID[r.product];
    const s = ins.codes[codeId];
    return {
      product: r.product,
      label: PRODUCT_LABELS[r.product],
      auth: (s?.auth ?? "") as AuthChoice,
      sos: (s?.sos ?? "") as SosChoice,
    };
  });

  // A product whose auth is "required" auto-skips SoS — SoS only matters when auth isn't required
  const allFilled =
    productStates.length > 0 &&
    productStates.every((p) => !!p.auth && (p.auth === "required" || !!p.sos));

  // 3) Auth — only depends on auth selections, not SoS
  const anyAuthRequired = productStates.some((p) => p.auth === "required");
  const allAuthsFilled =
    productStates.length > 0 && productStates.every((p) => !!p.auth);
  const auth = !allAuthsFilled ? "—" : anyAuthRequired ? "Auths Required" : "No Auths Required";

  // 4) SoS — ignore SoS on products that already require auth
  const sosRelevant = productStates.filter((p) => p.auth !== "required");
  const anyNotClear = sosRelevant.some((p) => p.sos === "not-clear");
  const sosCol = !allFilled
    ? "—"
    : sosRelevant.length === 0
      ? "Skip"
      : anyNotClear
        ? "Partial / Not Clear"
        : "All Clear";

  // 5) Not Clear Products — only count products where SoS still applies
  const notClearProducts = sosRelevant
    .filter((p) => p.sos === "not-clear")
    .map((p) => p.label)
    .join(", ");

  // 6) Stage Advancer
  // - If any universal not confirmed OR SoS not clear → "Benefits / SoS"
  // - Else if auths required → "Authorization"
  // - Else if all clear → "Complete"
  // - Else (still working / not all filled) → "Benefits / SoS"
  let stageAdvancer: string;
  if (anyUniversalNotConfirmed || !universalAllConfirmed || !allFilled || anyNotClear) {
    stageAdvancer = "Benefits / SoS";
  } else if (anyAuthRequired) {
    stageAdvancer = "Authorization";
  } else {
    stageAdvancer = "Complete";
  }

  // 7) Escalation column
  // Escalate if any universal explicitly not confirmed, or SoS not clear (when filled)
  const shouldEscalate =
    anyUniversalNotConfirmed || (allFilled && anyNotClear);
  const escalation = shouldEscalate ? "Escalation Required" : "—";

  return {
    activeNetwork,
    dmeBenefits,
    auth,
    sos: sosCol,
    notClearProducts: notClearProducts || "—",
    stageAdvancer,
    escalation,
    allFilled,
    shouldEscalate,
  };
}

// Monday auth-result column labels per product
const PRODUCT_AUTH_COLUMN: Record<ProductId, string> = {
  monitor: "CGM auth result",
  sensors: "Sensors auth result",
  insulin_pump: "Insulin pump auth result",
  infusion_set: "Infusion set auth result",
  cartridge: "Cartridges auth result",
};

const ALL_AUTH_PRODUCTS: ProductId[] = ["monitor", "sensors", "insulin_pump", "infusion_set", "cartridge"];

const GOOD_VALUES = new Set(["Active/In-network", "Yes", "No Auths Required", "All Clear", "Complete"]);
const WARN_VALUES = new Set(["Stuck", "Partial / No", "Auths Required", "Partial / Not Clear", "Authorization", "Benefits / SoS"]);
const BAD_VALUES = new Set(["Escalation Required"]);
const SKIP_VALUES = new Set(["Skip"]);
function valueTone(v: string): "good" | "warn" | "bad" | "skip" | "neutral" {
  if (GOOD_VALUES.has(v)) return "good";
  if (WARN_VALUES.has(v)) return "warn";
  if (BAD_VALUES.has(v)) return "bad";
  if (SKIP_VALUES.has(v)) return "skip";
  return "neutral";
}

function MondayOutput({
  patient,
  resolved,
  outcome,
}: {
  patient: Patient;
  resolved: ResolvedProduct[];
  outcome: ReturnType<typeof deriveInsuranceOutcome>;
}) {
  const cols = deriveMondayColumns(patient, resolved);
  const ins = patient.insurance ?? EMPTY_INSURANCE;

  const rows: { key: string; label: string; value: string }[] = [
    { key: "active", label: "Active/Network", value: cols.activeNetwork },
    { key: "dme", label: "DME Benefits", value: cols.dmeBenefits },
    { key: "auth", label: "Auth", value: cols.auth },
    { key: "sos", label: "SoS", value: cols.sos },
    { key: "notclear", label: "Not Clear Products", value: cols.notClearProducts },
    { key: "stage", label: "Stage Advancer", value: cols.stageAdvancer },
    { key: "escalation", label: "Escalation", value: cols.escalation },
  ];

  // Auth result columns: show all 5 only if any product requires auth
  const anyAuthRequired = resolved.some(
    (r) => ins.codes[PRODUCT_TO_CODE_ID[r.product]]?.auth === "required",
  );
  const requiredSet = new Set(
    resolved
      .filter((r) => ins.codes[PRODUCT_TO_CODE_ID[r.product]]?.auth === "required")
      .map((r) => r.product),
  );
  const servedSet = new Set(resolved.map((r) => r.product));
  const authResultRows = anyAuthRequired
    ? ALL_AUTH_PRODUCTS.map((p) => ({
        key: `auth-${p}`,
        label: PRODUCT_AUTH_COLUMN[p],
        value: requiredSet.has(p)
          ? "Required"
          : servedSet.has(p)
            ? "No Auth Needed"
            : "Not Serving",
      }))
    : [];

  return (
    <div className="space-y-4">
      {/* Part 1 — main columns */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Monday board · main columns</h3>
            <p className="text-[11px] text-muted-foreground">
              Pick the matching dropdown option for each column on the Monday board.
            </p>
          </div>
        </div>

        <div className="rounded-md border bg-background divide-y">
          {rows.map((r) => {
            const tone = valueTone(r.value);
            return (
              <div key={r.key} className="grid grid-cols-[220px_1fr] items-center gap-3 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </span>
                <span
                  className={cn(
                    "inline-flex w-fit items-center px-2 py-0.5 rounded text-sm font-medium",
                    tone === "good" && "bg-success/15 text-success",
                    tone === "warn" && "bg-warning/20 text-warning-foreground",
                    tone === "bad" && "bg-destructive/15 text-destructive border border-destructive/30",
                    tone === "skip" && "bg-sky-400/20 text-sky-700 dark:text-sky-300 border border-sky-500/40",
                    tone === "neutral" && "font-mono text-foreground",
                  )}
                >
                  {r.value}
                </span>
              </div>
            );
          })}
        </div>

        {!cols.allFilled && (
          <p className="text-[11px] text-muted-foreground italic">
            Fill Auth + SoS for every product to compute Auth and SoS columns.
          </p>
        )}
      </div>

      {/* Part 2 — product-specific auth result columns */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Monday board · product-specific auth result columns</h3>
          <p className="text-[11px] text-muted-foreground">
            {anyAuthRequired
              ? 'Set each of the 5 auth result columns on the Monday board to the value below.'
              : 'No auths required — leave the auth result columns blank on the Monday board.'}
          </p>
        </div>

        {anyAuthRequired && (
          <div className="rounded-md border bg-background divide-y">
            {authResultRows.map((r) => (
              <div key={r.key} className="grid grid-cols-[220px_1fr] items-center gap-3 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </span>
                <span
                  className={cn(
                    "inline-flex w-fit items-center px-2 py-0.5 rounded text-sm font-medium",
                    r.value === "Required" && "bg-warning/20 text-warning-foreground",
                    r.value === "Not Serving" && "bg-success/15 text-success",
                    r.value === "No Auth Needed" && "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                  )}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
