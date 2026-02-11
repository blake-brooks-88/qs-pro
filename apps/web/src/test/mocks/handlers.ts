import type { TenantFeatures } from "@qpp/shared-types";
import { http, HttpResponse } from "msw";

export const defaultFeatures: TenantFeatures = {
  basicLinting: true,
  syntaxHighlighting: true,
  quickFixes: false,
  minimap: false,
  advancedAutocomplete: false,
  querySharing: false,
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
      lineCount: 1,
      source: "save",
      restoredFromId: null,
      versionName: null,
      createdAt: new Date().toISOString(),
    });
  }),

  http.get("/api/query-activities", () => {
    return HttpResponse.json([]);
  }),

  http.post("/api/query-activities", () => {
    return HttpResponse.json({
      objectId: "qa-obj-new",
      customerKey: "qa-key-new",
    });
  }),

  http.post("/api/query-activities/link/:savedQueryId", () => {
    return HttpResponse.json({
      linkedQaObjectId: "qa-obj-1",
      linkedQaCustomerKey: "qa-key-1",
      linkedQaName: "Linked QA",
      linkedAt: new Date().toISOString(),
      sqlUpdated: false,
    });
  }),

  http.delete("/api/query-activities/link/:savedQueryId", () => {
    return HttpResponse.json({ success: true });
  }),

  http.post("/api/query-activities/publish/:savedQueryId", () => {
    return HttpResponse.json({
      publishEventId: "pub-evt-1",
      versionId: "ver-1",
      savedQueryId: "sq-1",
      publishedSqlHash: "abc123",
      publishedAt: new Date().toISOString(),
    });
  }),

  http.get("/api/query-activities/drift/:savedQueryId", () => {
    return HttpResponse.json({
      hasDrift: false,
      localSql: "SELECT 1",
      remoteSql: "SELECT 1",
      localHash: "hash1",
      remoteHash: "hash1",
    });
  }),

  http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
    return HttpResponse.json({
      automations: [],
      totalCount: 0,
    });
  }),
];
