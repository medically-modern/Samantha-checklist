import { useEffect, useMemo, useState } from "react";
import { useMondayPatients } from "@/hooks/useMondayPatients";
import {
  Patient,
  ProductCodeId,
  ProductCodeState,
  EMPTY_INSURANCE,
  UniversalChoice,
} from "@/lib/workflow";
import { type Serving, type PrimaryInsurance } from "@/lib/hcpcRules";
import { InsurancePanel } from "@/components/dashboard/InsurancePanel";
import { AuthorizationsPanel } from "@/components/dashboard/AuthorizationsPanel";
import { PatientsSidebar } from "@/components/dashboard/PatientsSidebar";
import { PatientProfileCard } from "@/components/dashboard/PatientProfileCard";
import { SendToMondayButton } from "@/components/dashboard/SendToMondayButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { RotateCcw, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { sendPatientToMonday } from "@/lib/mondayWrite";

const Index = () => {
  const { patients, loading, error, refetch, update, clearOverlay } = useMondayPatients();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && patients.length > 0) setSelectedId(patients[0].id);
  }, [patients, selectedId]);

  const selected: Patient | undefined = useMemo(
    () => patients.find((p) => p.id === selectedId),
    [patients, selectedId],
  );

  // ===== Local-only edit handlers (no Monday writes) =====
  const onUniversalChange = (id: string, value: UniversalChoice) => {
    if (!selected) return;
    const ins = selected.insurance ?? EMPTY_INSURANCE;
    const next = { ...ins, universal: { ...ins.universal, [id]: value } };
    update(selected.id, { insurance: next });
  };

  const updateCode = (codeId: ProductCodeId, patch: Partial<ProductCodeState>) => {
    if (!selected) return;
    const ins = selected.insurance ?? EMPTY_INSURANCE;
    const prev = ins.codes[codeId] ?? { status: "pending" as const };
    const nextCode = { ...prev, ...patch };
    const next = { ...ins, codes: { ...ins.codes, [codeId]: nextCode } };
    update(selected.id, { insurance: next });
  };

  const resetCodeStatuses = (ins = selected?.insurance ?? EMPTY_INSURANCE) => {
    const codes: typeof ins.codes = {};
    for (const [k, v] of Object.entries(ins.codes)) {
      if (v) codes[k as ProductCodeId] = { ...v, status: "pending", authSubmittedAt: undefined, authApprovedAt: undefined };
    }
    return { ...ins, codes };
  };

  const setServing = (v: Serving) => {
    if (!selected) return;
    const ins = resetCodeStatuses();
    update(selected.id, { serving: v, insurance: ins });
  };

  const setPrimaryInsurance = (v: PrimaryInsurance) => {
    if (!selected) return;
    const ins = resetCodeStatuses();
    update(selected.id, { primaryInsurance: v, insurance: ins });
  };

  const resetForNewPatient = () => {
    if (!selected) return;
    clearOverlay(selected.id);
    update(selected.id, {
      insurance: EMPTY_INSURANCE,
      notes: "",
    });
    toast.success("Cleared local edits — refetching from Monday");
    refetch();
  };

  const handleSend = async () => {
    if (!selected) return;
    try {
      await sendPatientToMonday(selected);
      toast.success("Sent to Monday");
    } catch (e) {
      toast.error("Send to Monday failed", { description: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-subtle">
        <PatientsSidebar
          patients={patients}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
          error={error}
          onRefresh={refetch}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-gradient-navy text-navy-foreground border-b border-sidebar-border">
            <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="text-navy-foreground hover:bg-white/10" />
                <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-elevate">
                  <Stethoscope className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Medically Modern · Onboarding Tool</p>
                  <h1 className="text-xl font-semibold">
                    {selected ? `${selected.name} · Insurance & Benefits` : "Samantha · Insurance & Benefits"}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={resetForNewPatient}
                  disabled={!selected}
                  className="gap-2 bg-white text-navy hover:bg-white/90 shadow-elevate"
                >
                  <RotateCcw className="h-4 w-4" /> Reset for new patient
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-6 py-6">
            <section className="max-w-5xl mx-auto space-y-5">
              {!selected && (
                <div className="rounded-xl bg-card border shadow-card p-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {loading
                      ? "Loading patients from Monday…"
                      : error
                        ? error
                        : "Select a patient from the sidebar to begin."}
                  </p>
                </div>
              )}

              {selected && (
                <Tabs defaultValue="benefits" className="space-y-5">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="benefits">Benefits</TabsTrigger>
                    <TabsTrigger value="authorizations">Authorizations</TabsTrigger>
                  </TabsList>

                  <TabsContent value="benefits" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />

                    <InsurancePanel
                      patient={selected}
                      onUniversalChange={onUniversalChange}
                      onCodeChange={updateCode}
                      onServingChange={setServing}
                      onPrimaryInsuranceChange={setPrimaryInsurance}
                      onNotesChange={(v) => update(selected.id, { notes: v })}
                    />

                    <div className="rounded-xl bg-card border shadow-card p-5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Insurance Verification</p>
                      <p className="text-sm text-muted-foreground">
                        Edits stay local until you click "Send to Monday". List refreshes every 60 seconds.
                      </p>
                    </div>

                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>

                  <TabsContent value="authorizations" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} showInsuranceContext />

                    <AuthorizationsPanel
                      patient={selected}
                      onCodeChange={updateCode}
                    />

                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>
                </Tabs>
              )}
            </section>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
