import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, User, AlertCircle } from "lucide-react";
import type { Patient } from "@/lib/workflow";
import type { SidebarGroup as SidebarGroupType } from "@/hooks/useMondayPatients";
import { cn } from "@/lib/utils";

const GROUP_TABS: { key: SidebarGroupType; label: string; shortLabel: string }[] = [
  { key: "benefits", label: "Benefits", shortLabel: "Ben" },
  { key: "submitAuth", label: "Submit Auth", shortLabel: "Sub" },
  { key: "authOutstanding", label: "Auth Outstanding", shortLabel: "Out" },
];

interface Props {
  patients: Patient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  activeGroup: SidebarGroupType;
  onGroupChange: (group: SidebarGroupType) => void;
}

export function PatientsSidebar({ patients, selectedId, onSelect, loading, error, onRefresh, activeGroup, onGroupChange }: Props) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const activeLabel = GROUP_TABS.find((t) => t.key === activeGroup)?.label ?? "Benefits";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Monday · {activeLabel}</p>
              <p className="text-sm font-semibold truncate">Patients ({patients.length})</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh from Monday"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {!collapsed && (
          <div className="flex gap-1 mt-2">
            {GROUP_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => onGroupChange(tab.key)}
                className={cn(
                  "flex-1 text-[10px] font-medium py-1 px-1 rounded transition-colors truncate",
                  activeGroup === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {error && !collapsed && (
          <div className="m-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive flex gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {patients.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    isActive={selectedId === p.id}
                    onClick={() => onSelect(p.id)}
                    className={cn(
                      "flex items-start gap-2 py-2 h-auto",
                      selectedId === p.id && "bg-sidebar-accent",
                    )}
                  >
                    <User className="h-4 w-4 mt-0.5 shrink-0" />
                    {!collapsed && (
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {p.primaryInsurance || "—"} · {p.serving || "—"}
                        </p>
                      </div>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {!loading && patients.length === 0 && !error && !collapsed && (
                <p className="px-3 py-4 text-xs text-muted-foreground">No patients in {activeLabel} group.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
