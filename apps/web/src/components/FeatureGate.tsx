import type { FeatureKey } from "@qpp/shared-types";
import type { ReactNode } from "react";

import {
  LockedOverlay,
  type LockedOverlayProps,
} from "@/components/ui/locked-overlay";
import { useFeature } from "@/hooks/use-feature";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

const FEATURE_CONFIG: Record<
  string,
  { title: string; description: string; tier: "pro" | "enterprise" }
> = {
  createDataExtension: {
    title: "Create Data Extension",
    description:
      "Skip the manual DE setup. Create Data Extensions directly from query results with automatic schema detection.",
    tier: "pro",
  },
  advancedAutocomplete: {
    title: "Advanced Autocomplete",
    description:
      "Write queries faster with intelligent suggestions based on your data extensions and schema.",
    tier: "pro",
  },
  quickFixes: {
    title: "Quick Fixes",
    description:
      "Stop debugging syntax errors. Fix common SQL issues automatically with one click.",
    tier: "pro",
  },
  minimap: {
    title: "Code Minimap",
    description:
      "Navigate long queries instantly with a bird's-eye minimap view.",
    tier: "pro",
  },
  deployToAutomation: {
    title: "Automation Studio",
    description:
      "Automate your queries. Create and publish Query Activities for scheduled workflows in MCE.",
    tier: "enterprise",
  },
  teamSnippets: {
    title: "Team Snippets",
    description:
      "Save, share, and reuse SQL snippets across your team with VS Code-style tab-stop placeholders.",
    tier: "pro",
  },
  auditLogs: {
    title: "Audit Logs",
    description:
      "Stay audit-ready. Track every query execution and change for compliance.",
    tier: "enterprise",
  },
  runToTargetDE: {
    title: "Run to Target DE",
    description:
      "Populate DEs in one step. Run query results directly to any existing Data Extension.",
    tier: "pro",
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
  const { enabled: isEnabled } = useFeature(feature);
  const openPricing = usePricingOverlayStore((s) => s.open);
  /**
   * ESLINT-DISABLE JUSTIFICATION:
   * This eslint-disable is an exception to project standards, not a pattern to follow.
   *
   * Why this is safe: `feature` is typed as `FeatureKey`, which is a Zod enum defined
   * in packages/shared-types/src/features.ts with compile-time constant values. The
   * FEATURE_CONFIG object keys are string literals matching the FeatureKey values.
   * TypeScript enforces that only valid FeatureKey values can be passed as the `feature`
   * prop. User input cannot reach this code path because the prop must satisfy the
   * FeatureKey type at compile time.
   *
   * Why not refactor: Converting FEATURE_CONFIG to a Map would add unnecessary
   * complexity for a simple static lookup table. The fallback value handles any
   * missing keys gracefully, and the typed prop ensures only valid keys are used.
   */
  // eslint-disable-next-line security/detect-object-injection
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
      onCtaClick={onUpgradeClick ?? (() => openPricing("feature_gate"))}
      badgeSize={badgeSize}
      badgePosition={badgePosition}
    >
      {children}
    </LockedOverlay>
  );
}
