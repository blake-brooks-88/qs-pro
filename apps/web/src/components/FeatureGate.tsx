import type { ReactNode } from "react";
import type { FeatureKey } from "@qs-pro/shared-types";
import { useFeature } from "@/hooks/use-feature";
import {
  LockedOverlay,
  type LockedOverlayProps,
} from "@/components/ui/locked-overlay";

const FEATURE_CONFIG: Record<
  string,
  { title: string; description: string; tier: "pro" | "enterprise" }
> = {
  createDataExtension: {
    title: "Create Data Extension",
    description:
      "Create new Data Extensions directly from query results with automatic schema detection.",
    tier: "pro",
  },
  advancedAutocomplete: {
    title: "Advanced Autocomplete",
    description:
      "Get intelligent code suggestions based on your data extensions and schema.",
    tier: "pro",
  },
  quickFixes: {
    title: "Quick Fixes",
    description: "Automatically fix common SQL issues with one click.",
    tier: "pro",
  },
  minimap: {
    title: "Code Minimap",
    description:
      "See a bird's-eye view of your entire query for easy navigation.",
    tier: "pro",
  },
  deployToAutomation: {
    title: "Deploy to Automation",
    description:
      "Deploy queries as permanent MCE Query Activities for scheduled automation workflows.",
    tier: "enterprise",
  },
  teamSnippets: {
    title: "Team Snippets",
    description: "Share and collaborate on SQL snippets with your team.",
    tier: "enterprise",
  },
  auditLogs: {
    title: "Audit Logs",
    description: "Track all query executions and changes for compliance.",
    tier: "enterprise",
  },
};

export interface FeatureGateProps extends Pick<
  LockedOverlayProps,
  "variant" | "badgeSize" | "badgePosition"
> {
  feature: FeatureKey;
  children: ReactNode;
  onUpgradeClick?: () => void;
}

export function FeatureGate({
  feature,
  variant = "button",
  badgeSize,
  badgePosition,
  children,
  onUpgradeClick,
}: FeatureGateProps) {
  const isEnabled = useFeature(feature);
  const config = FEATURE_CONFIG[feature] ?? {
    title: "Premium Feature",
    description: "Upgrade to unlock this feature.",
    tier: "pro" as const,
  };

  return (
    <LockedOverlay
      locked={!isEnabled}
      variant={variant}
      tier={config.tier}
      title={config.title}
      description={config.description}
      ctaLabel={`Upgrade to ${config.tier === "enterprise" ? "Enterprise" : "Pro"}`}
      onCtaClick={onUpgradeClick}
      badgeSize={badgeSize}
      badgePosition={badgePosition}
    >
      {children}
    </LockedOverlay>
  );
}
