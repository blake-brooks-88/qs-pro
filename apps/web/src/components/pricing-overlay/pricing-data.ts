import type { SubscriptionTier } from "@qpp/shared-types";

export type BillingInterval = "monthly" | "annual";

export interface TierDefinition {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  highlight: boolean;
  features: string[];
  cta: string;
}

export const TIERS: TierDefinition[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For exploring MCE queries",
    monthlyPrice: 0,
    annualPrice: 0,
    highlight: false,
    features: [
      "5 query runs / day",
      "3 saved queries",
      "Basic linting",
      "Syntax highlighting",
      "System data views",
    ],
    cta: "Current Plan",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For power users and teams",
    monthlyPrice: 29,
    annualPrice: 24,
    highlight: true,
    features: [
      "Unlimited query runs",
      "Unlimited saved queries",
      "Advanced autocomplete",
      "Quick fixes & minimap",
      "Execution history",
      "Version history",
      "Query sharing",
      "Create data extensions",
      "Run to Target DE",
      "Deploy to Automation Studio",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For organizations at scale",
    monthlyPrice: null,
    annualPrice: null,
    highlight: false,
    features: [
      "Everything in Pro",
      "Team collaboration",
      "Team snippets",
      "Audit logs",
      "Priority support",
      "Custom onboarding",
    ],
    cta: "Contact Sales",
  },
];

export interface FeatureRow {
  name: string;
  free: boolean | string;
  pro: boolean | string;
  enterprise: boolean | string;
}

export const FEATURE_COMPARISON: FeatureRow[] = [
  {
    name: "Query runs",
    free: "5 / day",
    pro: "Unlimited",
    enterprise: "Unlimited",
  },
  {
    name: "Saved queries",
    free: "3",
    pro: "Unlimited",
    enterprise: "Unlimited",
  },
  { name: "Basic linting", free: true, pro: true, enterprise: true },
  { name: "Syntax highlighting", free: true, pro: true, enterprise: true },
  { name: "System data views", free: true, pro: true, enterprise: true },
  { name: "Advanced autocomplete", free: false, pro: true, enterprise: true },
  { name: "Quick fixes", free: false, pro: true, enterprise: true },
  { name: "Code minimap", free: false, pro: true, enterprise: true },
  { name: "Query sharing", free: false, pro: true, enterprise: true },
  { name: "Execution history", free: false, pro: true, enterprise: true },
  { name: "Version history", free: false, pro: true, enterprise: true },
  {
    name: "Create data extensions",
    free: false,
    pro: true,
    enterprise: true,
  },
  { name: "Run to Target DE", free: false, pro: true, enterprise: true },
  {
    name: "Deploy to Automation Studio",
    free: false,
    pro: true,
    enterprise: true,
  },
  { name: "Team collaboration", free: false, pro: false, enterprise: true },
  { name: "Team snippets", free: false, pro: false, enterprise: true },
  { name: "Audit logs", free: false, pro: false, enterprise: true },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I try Pro before I buy?",
    answer:
      "Yes! Every new account starts with a 14-day Pro trial. No credit card required.",
  },
  {
    question: "What happens when my trial ends?",
    answer:
      "Your account reverts to the Free plan. All saved queries remain, but usage limits apply. Upgrade anytime to restore full access.",
  },
  {
    question: "Can I switch between monthly and annual?",
    answer:
      "Yes. Switch at any time from the billing portal. Switching to annual prorates the remaining balance.",
  },
  {
    question: "How does Enterprise pricing work?",
    answer:
      "Enterprise pricing is based on team size and usage. Contact our sales team for a custom quote.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, cancel anytime from the billing portal. You keep access until the end of your billing period.",
  },
];
