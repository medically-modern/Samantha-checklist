import { useEffect, useMemo, useState } from "react";
import { useMondayPatients, type SidebarGroup } from "@/hooks/useMondayPatients";
import {
  Patient,
  ProductCodeId,
  ProductCodeState,
  EMPTY_INSURANCE,
  UniversalChoice,
} from "@/lib/workflow";
import { InsurancePanel } from "@/components/dashboard/InsurancePanel";
import { AuthorizationsPanel } from "@/components/dashboard/AuthorizationsPanel";
import { AuthOutstandingPanel } from "@/components/dashboard/AuthOutstandingPanel";
import { PatientsSidebar } from "@/components/dashboard/PatientsSidebar";
import { PatientProfileCard } from "@/components/dashboard/PatientProfileCard";
import { SendToMondayButton } from "@/components/dashboard/SendToMondayButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AlertTriangle, RotateCcw, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { sendPatientToMonday } from "@/lib/mondayWrite";

const Index = () => {
  const [mainTab, setMainTab] = useState<"benefits" | "authorizations" | "authOutstanding">("benefits");

  // Sidebar group is driven by the main tab
  const activeGroup: SidebarGroup = mainTab === "authOutstanding" ? "authOutstanding" : mainTab === "authorizations" ? "submitAuth" : "benefits";

  const { patients, loading, error, refetch, update, clearOverlay } = useMondayPatients(activeGroup);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleMainTabChange = (tab: string) => {
    setMainTab(tab as "benefits" | "authorizations" | "authOutstanding");
    setSelectedId(null);
  };

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

  const toggleEscalate = () => {
    if (!selected) return;
    update(selected.id, { escalated: !selected.escalated });
  };

  const handleSend = async () => {
    if (!selected) return;
    const context = mainTab === "authorizations" ? "submitAuth" as const
      : mainTab === "authOutstanding" ? "authOutstanding" as const
      : "benefits" as const;
    try {
      await sendPatientToMonday(selected, context);
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
          activeGroup={activeGroup}
        />

        <Tabs value={mainTab} onValueChange={handleMainTabChange} className="flex-1 flex flex-col min-w-0">
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

          <div className="flex justify-center py-3 border-b bg-background">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="benefits">Benefits</TabsTrigger>
              <TabsTrigger value="authorizations">Submit Auth</TabsTrigger>
              <TabsTrigger value="authOutstanding">Auth Outstanding</TabsTrigger>
            </TabsList>
          </div>

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
                <>
                  <TabsContent value="benefits" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} />

                    <InsurancePanel
                      patient={selected}
                      onUniversalChange={onUniversalChange}
                      onCodeChange={updateCode}
                      onNotesChange={(v) => update(selected.id, { notes: v })}
                    />

                    <div className="rounded-xl bg-card border shadow-card p-5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Insurance Verification</p>
                      <p className="text-sm text-muted-foreground">
                        Edits stay local until you click "Send to Monday". List refreshes every 60 seconds.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                      onClick={toggleEscalate}
                      variant={selected.escalated ? "destructive" : "outline"}
                      className={selected.escalated
                        ? "gap-2 bg-red-100 hover:bg-red-200 text-red-600 border-red-400 shadow-md hover:animate-shake"
                        : "gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:animate-shake"}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {selected.escalated ? "Escalation Required" : "Escalate"}
                    </Button>
                    </div>
                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>

                  <TabsContent value="authorizations" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} showInsuranceContext />

                    <AuthorizationsPanel
                      patient={selected}
                      onCodeChange={updateCode}
                    />

                    <div className="flex items-center gap-3">
                      <Button
                      onClick={toggleEscalate}
                      variant={selected.escalated ? "destructive" : "outline"}
                      className={selected.escalated
                        ? "gap-2 bg-red-100 hover:bg-red-200 text-red-600 border-red-400 shadow-md hover:animate-shake"
                        : "gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:animate-shake"}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {selected.escalated ? "Escalation Required" : "Escalate"}
                    </Button>
                    </div>
                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>
                  <TabsContent value="authOutstanding" className="space-y-5 mt-0">
                    <PatientProfileCard patient={selected} showInsuranceContext />

                    <AuthOutstandingPanel
                      patient={selected}
                      onCodeChange={updateCode}
                    />

                    <div className="flex items-center gap-3">
                      <Button
                      onClick={toggleEscalate}
                      variant={selected.escalated ? "destructive" : "outline"}
                      className={selected.escalated
                        ? "gap-2 bg-red-100 hover:bg-red-200 text-red-600 border-red-400 shadow-md hover:animate-shake"
                        : "gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:animate-shake"}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {selected.escalated ? "Escalation Required" : "Escalate"}
                    </Button>
                    </div>
                    <SendToMondayButton onSend={handleSend} disabled={!selected} />
                  </TabsContent>
                </>
              )}
            </section>
          </main>
        </Tabs>
      </div>
    </SidebarProvider>
  );
};

export default Index;
