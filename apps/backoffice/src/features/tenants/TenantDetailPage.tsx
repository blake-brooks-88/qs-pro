import { useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";

import { AuditLogCard } from "./components/AuditLogCard";
import { FeatureOverridesCard } from "./components/FeatureOverridesCard";
import { SubscriptionCard } from "./components/SubscriptionCard";
import { UserListCard } from "./components/UserListCard";
import { useTenantDetail } from "./hooks/use-tenant-detail";

function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { canAdmin } = usePermissions();
  const { data: tenant, isLoading, isError } = useTenantDetail(tenantId ?? "");

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="p-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { void navigate("/tenants"); }}
        >
          Back to Tenants
        </Button>
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">Tenant not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { void navigate("/tenants"); }}
          className="mb-4"
        >
          Back to Tenants
        </Button>

        <div className="flex items-center gap-3">
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {tenant.companyName}
          </h1>
          <Badge variant="outline">{tenant.eid}</Badge>
        </div>
        {tenant.signupDate ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Signed up{" "}
            {new Date(tenant.signupDate).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SubscriptionCard tenant={tenant} />
        <UserListCard users={tenant.users} />
        {canAdmin ? (
          <FeatureOverridesCard tenantId={tenant.tenantId} />
        ) : null}
        <AuditLogCard logs={tenant.recentAuditLogs} />
      </div>
    </div>
  );
}

export { TenantDetailPage };
