import { http, HttpResponse } from "msw";
import type { TenantFeatures } from "@qs-pro/shared-types";

export const defaultFeatures: TenantFeatures = {
  basicLinting: true,
  syntaxHighlighting: true,
  quickFixes: false,
  minimap: false,
  advancedAutocomplete: false,
  teamSnippets: false,
  auditLogs: false,
  deployToAutomation: false,
};

export const handlers = [
  http.get("/api/features", () => {
    return HttpResponse.json(defaultFeatures);
  }),

  http.get("/api/metadata/folders", () => {
    return HttpResponse.json([]);
  }),

  http.get("/api/metadata/data-extensions", () => {
    return HttpResponse.json([]);
  }),

  http.get("/api/metadata/fields", () => {
    return HttpResponse.json([]);
  }),
];
