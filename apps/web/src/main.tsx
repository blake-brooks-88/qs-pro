import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "@/App";
import { ThemeProvider } from "@/components/theme-provider";
import { startEmbeddedJwtListener } from "@/services/embedded-jwt";

import { initSentry } from "./instrument";
import { sanitizeCurrentLocationAndBufferJwt } from "./sanitize-location";

const queryClient = new QueryClient();

sanitizeCurrentLocationAndBufferJwt();
initSentry();
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
