import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "@/App";
import { CheckoutReturnPage } from "@/components/CheckoutReturnPage";
import { ThemeProvider } from "@/components/theme-provider";
import { startEmbeddedJwtListener } from "@/services/embedded-jwt";

import { initSentry } from "./instrument";
import { sanitizeCurrentLocationAndBufferJwt } from "./sanitize-location";

const queryClient = new QueryClient();

const checkoutParam = new URLSearchParams(window.location.search).get(
  "checkout",
);
const isCheckoutReturn =
  checkoutParam === "success" || checkoutParam === "cancel";

sanitizeCurrentLocationAndBufferJwt();
initSentry();

if (!isCheckoutReturn) {
  startEmbeddedJwtListener();
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {isCheckoutReturn ? (
        <CheckoutReturnPage />
      ) : (
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
