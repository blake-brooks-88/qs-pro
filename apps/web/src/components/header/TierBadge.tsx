import { CrownStar } from "@solar-icons/react";

import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { cn } from "@/lib/utils";

export function TierBadge() {
  const { data } = useTenantFeatures();
  const tier = data?.tier ?? "free";

  if (tier === "free") {
    return null;
  }

  const isPro = tier === "pro";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        isPro
          ? "bg-pro-badge-bg/15 text-pro-badge-bg"
          : "bg-enterprise-badge-bg/15 text-enterprise-badge-bg",
      )}
    >
      <CrownStar weight="Bold" className="h-3 w-3" />
      {isPro ? "Pro" : "Enterprise"}
    </span>
  );
}
