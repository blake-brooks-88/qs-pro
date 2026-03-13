import { AltArrowLeft } from "@solar-icons/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/use-role";
import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { cn } from "@/lib/utils";

import { AuditLogTab } from "./components/AuditLogTab";
import { BillingTab } from "./components/BillingTab";
import { MembersTab } from "./components/MembersTab";

type SettingsTab = "members" | "billing" | "audit-log";

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const { isAdmin, isOwner } = useRole();
  const { data: features } = useTenantFeatures();
  const [activeTab, setActiveTab] = useState<SettingsTab>("members");

  const hasAuditLogs = features?.features.auditLogs === true;

  useEffect(() => {
    if (!isAdmin) {
      onBack();
    }
  }, [isAdmin, onBack]);

  const tabs: { id: SettingsTab; label: string; visible: boolean }[] = [
    { id: "members", label: "Members", visible: true },
    { id: "billing", label: "Billing", visible: isOwner },
    { id: "audit-log", label: "Audit Log", visible: hasAuditLogs },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);

  return (
    <div className="flex-1 overflow-auto bg-background scrollbar-visible">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="font-display text-xl font-bold tracking-tight">
            Settings
          </h1>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <AltArrowLeft size={16} className="mr-1.5" />
            Back to Editor
          </Button>
        </div>
      </div>

      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto flex gap-1 px-6">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {activeTab === "members" && <MembersTab />}
        {activeTab === "billing" && isOwner ? <BillingTab /> : null}
        {activeTab === "audit-log" && <AuditLogTab />}
      </div>
    </div>
  );
}
