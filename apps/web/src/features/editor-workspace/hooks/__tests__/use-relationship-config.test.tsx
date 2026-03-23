import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { server } from "@/test/mocks/server";

import {
  useDeleteRelationship,
  useDismissRelationship,
  useSaveRelationship,
} from "../use-relationship-config";
import { relationshipGraphKeys } from "../use-relationship-graph";

let queryClient: QueryClient;

function createWrapper() {
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

describe("use-relationship-config hooks", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(relationshipGraphKeys.graph, {
      edges: [
        {
          sourceDE: "A",
          sourceColumn: "c",
          targetDE: "B",
          targetColumn: "d",
          confidence: "confirmed",
          source: "user",
        },
      ],
      exclusions: [],
    });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("useSaveRelationship", () => {
    it("calls POST /api/relationships/rules with correct body", async () => {
      let capturedBody: unknown;
      server.use(
        http.post("/api/relationships/rules", async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            RuleID: "new-rule",
            RuleType: "explicit_link",
            Payload: "{}",
          });
        }),
      );

      const { result } = renderHook(() => useSaveRelationship(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        ruleType: "explicit_link",
        sourceDE: "Subscribers",
        sourceColumn: "SubscriberKey",
        targetDE: "Orders",
        targetColumn: "SubscriberKey",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(capturedBody).toEqual({
        ruleType: "explicit_link",
        sourceDE: "Subscribers",
        sourceColumn: "SubscriberKey",
        targetDE: "Orders",
        targetColumn: "SubscriberKey",
      });
    });

    it("invalidates relationship graph cache on success", async () => {
      server.use(
        http.post("/api/relationships/rules", () => {
          return HttpResponse.json({
            RuleID: "r1",
            RuleType: "explicit_link",
            Payload: "{}",
          });
        }),
      );

      const { result } = renderHook(() => useSaveRelationship(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        ruleType: "explicit_link",
        sourceDE: "A",
        sourceColumn: "c",
        targetDE: "B",
        targetColumn: "d",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryState = queryClient.getQueryState(relationshipGraphKeys.graph);
      expect(queryState?.isInvalidated).toBe(true);
    });
  });

  describe("useDismissRelationship", () => {
    it("calls POST /api/relationships/dismiss with correct body", async () => {
      let capturedBody: unknown;
      server.use(
        http.post("/api/relationships/dismiss", async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({
            RuleID: "d1",
            RuleType: "exclusion",
            Payload: "{}",
          });
        }),
      );

      const { result } = renderHook(() => useDismissRelationship(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        sourceDE: "Subscribers",
        sourceColumn: "Email",
        targetDE: "Campaigns",
        targetColumn: "Email",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(capturedBody).toEqual({
        sourceDE: "Subscribers",
        sourceColumn: "Email",
        targetDE: "Campaigns",
        targetColumn: "Email",
      });
    });

    it("invalidates relationship graph cache on success", async () => {
      server.use(
        http.post("/api/relationships/dismiss", () => {
          return HttpResponse.json({
            RuleID: "d1",
            RuleType: "exclusion",
            Payload: "{}",
          });
        }),
      );

      const { result } = renderHook(() => useDismissRelationship(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        sourceDE: "A",
        sourceColumn: "c",
        targetDE: "B",
        targetColumn: "d",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryState = queryClient.getQueryState(relationshipGraphKeys.graph);
      expect(queryState?.isInvalidated).toBe(true);
    });
  });

  describe("useDeleteRelationship", () => {
    it("calls DELETE /api/relationships/rules/:ruleId", async () => {
      let capturedRuleId: string | undefined;
      server.use(
        http.delete("/api/relationships/rules/:ruleId", ({ params }) => {
          capturedRuleId = params.ruleId as string;
          return HttpResponse.json({ success: true });
        }),
      );

      const { result } = renderHook(() => useDeleteRelationship(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("rule-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(capturedRuleId).toBe("rule-123");
    });

    it("invalidates relationship graph cache on success", async () => {
      server.use(
        http.delete("/api/relationships/rules/:ruleId", () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const { result } = renderHook(() => useDeleteRelationship(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("rule-456");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const queryState = queryClient.getQueryState(relationshipGraphKeys.graph);
      expect(queryState?.isInvalidated).toBe(true);
    });
  });
});
