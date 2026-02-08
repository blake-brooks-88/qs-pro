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
  runToTargetDE: false,
  executionHistory: false,
  versionHistory: false,
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

  http.get("/api/usage", () => {
    return HttpResponse.json({
      queryRuns: {
        current: 0,
        limit: null,
        resetDate: new Date().toISOString(),
      },
      savedQueries: { current: 0, limit: null },
    });
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

  http.get("/api/runs/history", () => {
    return HttpResponse.json({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
  }),

  http.get("/api/saved-queries/:id/versions", () => {
    return HttpResponse.json({ versions: [], total: 0 });
  }),

  http.get("/api/saved-queries/:id/versions/:versionId", ({ params }) => {
    return HttpResponse.json({
      id: params.versionId,
      savedQueryId: params.id,
      sqlText: "SELECT 1",
      versionNumber: 1,
      createdAt: new Date().toISOString(),
    });
  }),
];
