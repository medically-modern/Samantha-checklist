import {
  Patient,
  PRODUCT_CODES,
  ProductCodeId,
  ProductCodeState,
  EMPTY_INSURANCE,
  AUTH_SUBMISSION_METHODS,
  AuthSubmissionMethod,
} from "@/lib/workflow";
import {
  resolveHcpcs,
  PRODUCT_LABELS,
  type ProductId,
  type ResolvedProduct,
} from "@/lib/hcpcRules";
import { Input } from "@/components/ui/input";
import { Package, Repeat, Send, Inbox, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  patient: Patient;
  onCodeChange: (codeId: ProductCodeId, patch: Partial<ProductCodeState>) => void;
}

const PRODUCT_TO_CODE_ID: Record<ProductId, ProductCodeId> = {
  monitor: "cgm-monitor",
  sensors: "cgm-sensors",
  insulin_pump: "pump",
  infusion_set: "infusion-sets",
  cartridge: "cartridges",
};

export function AuthOutstandingPanel({ patient, onCodeChange }: Props) {
  const ins = patient.insurance ?? EMPTY_INSURANCE;
  const serving = patient.serving || "";
  const primaryInsurance = patient.primaryInsurance || "";
  const dropdownsReady = !!serving && !!primaryInsurance;

  const resolved: ResolvedProduct[] = resolveHcpcs(primaryInsurance || null, serving || null);

  // Only products that are being served AND require auth
  const authRequired = resolved.filter(
    (r) => ins.codes[PRODUCT_TO_CODE_ID[r.product]]?.auth === "required",
  );

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Authorizations Outstanding</h2>
          <p className="text-xs text-muted-foreground">
            Review submission info and enter approval details for each required product.
          </p>
        </div>
      </div>

      {!dropdownsReady && (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Select Serving and Primary Insurance on the Benefits tab to load auth-eligible products.
          </p>
        </div>
      )}

      {dropdownsReady && (
        <AuthRequirementsMatrix
          resolved={resolved}
          ins={ins}
        />
      )}

      {dropdownsReady && authRequired.length === 0 && (
        <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No products with auth required found.
          </p>
        </div>
      )}

      {dropdownsReady && authRequired.length > 0 && (
        <div className="space-y-4">
          {authRequired.map((r) => {
            const codeId = PRODUCT_TO_CODE_ID[r.product];
            const meta = PRODUCT_CODES.find((c) => c.id === codeId);
            if (!meta) return null;
            const state = ins.codes[codeId] ?? { status: "pending" as const };
            return (
              <ProductAuthBlock
                key={codeId}
                meta={meta}
                resolved={r}
                state={state}
                onChange={(patch) => onCodeChange(codeId, patch)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

interface BlockProps {
  meta: typeof PRODUCT_CODES[number];
  resolved: ResolvedProduct;
  state: ProductCodeState;
  onChange: (patch: Partial<ProductCodeState>) => void;
}

function ProductAuthBlock({ meta, resolved, state, onChange }: BlockProps) {
  const isRecurring = meta.cadence === "RECURRING";

  return (
    <div
      className={cn(
        "rounded-xl border-l-4 border bg-card overflow-hidden",
        isRecurring ? "border-l-primary" : "border-l-accent-foreground/40",
      )}
    >
      {/* Product header */}
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 bg-muted/30 border-b">
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
          <p className="text-xs font-mono text-muted-foreground">HCPCS · {resolved.hcpc}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium bg-warning/20 text-warning-foreground">
          Auth Required
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-muted/20">

        {/* STEP 1 — Submit Auth (read-only EXCEPT Auth ID) */}
        <StageBlock
          stepNumber={1}
          icon={<Send className="h-3.5 w-3.5" />}
          title="Submit Auth"
          subtitle="Read-only — submitted previously"
          tone="active"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <FieldLabel>Auth Submission Method</FieldLabel>
              <div className="mt-1 h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-medium text-foreground/80">
                {state.authSubmissionMethod || "—"}
              </div>
            </div>
            <div>
              <FieldLabel>Auth Submission Date</FieldLabel>
              <div className="mt-1 h-9 flex items-center px-3 rounded-md border bg-muted text-sm text-foreground/80">
                {state.authSubmissionDate || "—"}
              </div>
            </div>
            <div>
              <FieldLabel>Auth ID</FieldLabel>
              <div className="mt-1 h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-mono text-foreground/80">
                {state.authId || "—"}
              </div>
            </div>
            {state.authSubmissionMethod === "Carecentrix Portal" && (
              <div className="sm:col-span-2">
                <FieldLabel>Intake ID · Carecentrix</FieldLabel>
                <div className="mt-1 h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-mono text-foreground/80">
                  {state.intakeId || "—"}
                </div>
              </div>
            )}
          </div>
        </StageBlock>

        {/* STEP 2 — Authorizations Outstanding (fully editable) */}
        <StageBlock
          stepNumber={2}
          icon={<Inbox className="h-3.5 w-3.5" />}
          title="Authorizations Outstanding"
          subtitle="Enter approval details"
          tone="waiting"
        >
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div className="sm:col-span-5">
              <FieldLabel>Auth ID</FieldLabel>
              <Input
                value={state.authId ?? ""}
                onChange={(e) => onChange({ authId: e.target.value })}
                placeholder="e.g. AUTH-123456"
                className="mt-1 h-9 bg-background font-mono text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Auth Start</FieldLabel>
              <Input
                type="date"
                value={state.authStart ?? ""}
                onChange={(e) => onChange({ authStart: e.target.value })}
                className="mt-1 h-9 bg-background"
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Auth End</FieldLabel>
              <Input
                type="date"
                value={state.authEnd ?? ""}
                onChange={(e) => onChange({ authEnd: e.target.value })}
                className="mt-1 h-9 bg-background"
              />
            </div>
            <div>
              <FieldLabel>Units</FieldLabel>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={state.authUnits ?? ""}
                onChange={(e) => onChange({ authUnits: e.target.value })}
                placeholder="90"
                className="mt-1 h-9 bg-background"
              />
            </div>
          </div>
        </StageBlock>
      </div>
    </div>
  );
}

function StageBlock({
  stepNumber,
  icon,
  title,
  subtitle,
  tone = "active",
  children,
}: {
  stepNumber: 1 | 2;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone?: "active" | "waiting";
  children: React.ReactNode;
}) {
  const isActive = tone === "active";
  const palette = isActive
    ? {
        cardBorder: "border-[#7BA89C]/40 shadow-card",
        headerBg: "bg-[#E8F4F0] border-[#7BA89C]/25",
        badgeBg: "bg-[#7BA89C] text-white border-[#7BA89C]",
      }
    : {
        cardBorder: "border-[#0F4C5C]/35 shadow-card",
        headerBg: "bg-[#0F4C5C]/10 border-[#0F4C5C]/20",
        badgeBg: "bg-[#0F4C5C] text-white border-[#0F4C5C]",
      };

  return (
    <div
      className={cn(
        "rounded-lg border bg-background overflow-hidden flex flex-col",
        palette.cardBorder,
      )}
    >
      <div className={cn("flex items-center gap-3 px-4 py-3 border-b", palette.headerBg)}>
        <span
          className={cn(
            "h-9 w-9 rounded-full flex items-center justify-center text-base font-bold shrink-0 border-2",
            palette.badgeBg,
          )}
          aria-label={`Step ${stepNumber}`}
        >
          {stepNumber}
        </span>
        <div className="min-w-0 flex-1">
          <h5 className="text-sm font-semibold leading-tight">{title}</h5>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="p-4 flex-1">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  );
}

function AuthRequirementsMatrix({
  resolved,
  ins,
}: {
  resolved: ResolvedProduct[];
  ins: { codes: Partial<Record<ProductCodeId, ProductCodeState>> };
}) {
  const ALL: ProductId[] = ["monitor", "sensors", "insulin_pump", "infusion_set", "cartridge"];
  const servedSet = new Set(resolved.map((r) => r.product));

  return (
    <div className="rounded-xl border-2 border-border bg-muted/10 p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-8 w-8 rounded-full bg-background border-2 border-border flex items-center justify-center shrink-0">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Auth Status from Monday</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Read-only — these values are pulled directly from the Monday board.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {ALL.map((p) => {
          const codeId = PRODUCT_TO_CODE_ID[p];
          const isServed = servedSet.has(p);
          const state = ins.codes[codeId];
          const label = state?._mondayAuthLabel || "";
          const isNotServing = label.toLowerCase() === "not serving";
          const isRequired = label.toLowerCase() === "required";
          const isNoAuth = label.toLowerCase() === "no auth needed";

          return (
            <div
              key={p}
              className={cn(
                "rounded-lg border p-3 bg-background flex flex-col gap-2",
                isNotServing && "opacity-60",
                isRequired && "border-warning/50 bg-warning/5",
                isNoAuth && "border-success/40 bg-success/5",
              )}
            >
              <div>
                <p className="text-sm font-semibold leading-tight">{PRODUCT_LABELS[p]}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {isServed && !isNotServing ? "Serving" : "Not Serving"}
                </p>
              </div>
              <div
                className={cn(
                  "mt-auto h-9 flex items-center px-3 rounded-md border text-sm font-medium bg-muted",
                  isRequired && "bg-warning/15 border-warning/50 text-warning-foreground",
                  isNoAuth && "bg-success/10 border-success/40 text-success",
                  isNotServing && "text-muted-foreground",
                )}
              >
                {label || "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
