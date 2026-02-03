import "./index.css";

import { getTierFeatures, type SubscriptionTier } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "@/App";
import { ThemeProvider } from "@/components/theme-provider";
import { startEmbeddedJwtListener } from "@/services/embedded-jwt";

const queryClient = new QueryClient();

if (import.meta.env.DEV) {
  const tierOverride = localStorage.getItem(
    "dev-tier-override",
  ) as SubscriptionTier | null;
  if (
    tierOverride === "free" ||
    tierOverride === "pro" ||
    tierOverride === "enterprise"
  ) {
    const mockFeatures = getTierFeatures(tierOverride);
    queryClient.setQueryData(["features", "tenant", "unknown"], mockFeatures);
  }
}

startEmbeddedJwtListener();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
