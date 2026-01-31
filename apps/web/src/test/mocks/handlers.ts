import type { TenantFeatures } from "@qpp/shared-types";
import { http, HttpResponse } from "msw";

export const defaultFeatures: TenantFeatures = {
  basicLinting: true,
  syntaxHighlighting: true,
  quickFixes: false,
  minimap: false,
  advancedAutocomplete: false,
  teamSnippets: false,
  auditLogs: false,
  createDataExtension: false,
  deployToAutomation: false,
  systemDataViews: true,
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

  http.get("/api/folders", () => {
    return HttpResponse.json([]);
  }),

  http.get("/api/saved-queries", () => {
    return HttpResponse.json([]);
  }),

  http.get("/api/saved-queries/count", () => {
    return HttpResponse.json({ count: 0 });
  }),

  http.get("/api/auth/refresh", () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch("/api/folders/:id", () => {
    return HttpResponse.json({ id: "1", name: "Updated", parentId: null });
  }),

  http.delete("/api/folders/:id", () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch("/api/saved-queries/:id", () => {
    return HttpResponse.json({ id: "1", name: "Updated", folderId: null });
  }),

  http.delete("/api/saved-queries/:id", () => {
    return HttpResponse.json({ success: true });
  }),
];
