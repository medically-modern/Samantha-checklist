import type { Patient } from "@/lib/workflow";
import { CalendarDays, IdCard, User, Stethoscope, ShieldCheck } from "lucide-react";

interface Props {
  patient: Patient;
  /** Show Serving + Primary Insurance fields (used on Authorizations tab). */
  showInsuranceContext?: boolean;
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </p>
        <p className="text-sm font-medium truncate" title={value || "—"}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export function PatientProfileCard({ patient, showInsuranceContext = false }: Props) {
  const hasMember2 = !!patient.memberId2 && patient.memberId2.trim().length > 0;

  // Benefits tab (no insurance context) keeps the original single-row layout
  if (!showInsuranceContext) {
    return (
      <div className="rounded-xl bg-card border shadow-card p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Patient Profile
        </p>
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            hasMember2 ? "lg:grid-cols-4" : "lg:grid-cols-3"
          } gap-4`}
        >
          <Field icon={<User className="h-4 w-4" />} label="Name" value={patient.name} />
          <Field icon={<CalendarDays className="h-4 w-4" />} label="Date of Birth" value={patient.dob} />
          <Field
            icon={<IdCard className="h-4 w-4" />}
            label="Member ID"
            value={patient.memberId1 ?? ""}
          />
          {hasMember2 && (
            <Field
              icon={<IdCard className="h-4 w-4" />}
              label="Member ID 2"
              value={patient.memberId2 ?? ""}
            />
          )}
        </div>
      </div>
    );
  }

  // Authorizations tab — two-row layout for breathing room
  // Row 1: Name · DOB · Serving
  // Row 2: Primary Insurance · Member ID (· Member ID 2)

  return (
    <div className="rounded-xl bg-card border shadow-card p-4 space-y-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Patient Profile
      </p>

      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field icon={<User className="h-4 w-4" />} label="Name" value={patient.name} />
        <Field icon={<CalendarDays className="h-4 w-4" />} label="Date of Birth" value={patient.dob} />
        <Field
          icon={<Stethoscope className="h-4 w-4" />}
          label="Serving"
          value={patient.serving ?? ""}
        />
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Row 2 — keep 3-col grid so fields align with Row 1 (Name · DOB · Serving) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Primary Insurance"
          value={patient.primaryInsurance ?? ""}
        />
        <Field
          icon={<IdCard className="h-4 w-4" />}
          label="Member ID"
          value={patient.memberId1 ?? ""}
        />
        {hasMember2 && (
          <Field
            icon={<IdCard className="h-4 w-4" />}
            label="Member ID 2"
            value={patient.memberId2 ?? ""}
          />
        )}
      </div>
    </div>
  );
}
