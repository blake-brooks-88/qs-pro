import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import type {
  BlastRadiusResponse,
  DriftCheckResponse,
  PublishQueryResponse,
} from "@qpp/shared-types";

import api from "@/services/api";

import { checkDrift, getBlastRadius, publishQuery } from "../query-activities";

describe("publish API client functions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("publishQuery()", () => {
    it("posts to /query-activities/publish/<savedQueryId> with versionId body", async () => {
      const savedQueryId = "sq-pub-001";
      const params = { versionId: "ver-abc-123" };
      const responseData: PublishQueryResponse = {
        publishEventId: "evt-001",
        versionId: "ver-abc-123",
        savedQueryId: "sq-pub-001",
        publishedSqlHash: "hash-xyz",
        publishedAt: "2026-02-10T12:00:00.000Z",
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: responseData });

      const result = await publishQuery(savedQueryId, params);

      expect(api.post).toHaveBeenCalledWith(
        `/query-activities/publish/${savedQueryId}`,
        params,
      );
      expect(result).toEqual(responseData);
    });

    it("returns the full PublishQueryResponse shape", async () => {
      const responseData: PublishQueryResponse = {
        publishEventId: "evt-002",
        versionId: "ver-def-456",
        savedQueryId: "sq-pub-002",
        publishedSqlHash: "hash-abc",
        publishedAt: "2026-02-10T15:30:00.000Z",
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: responseData });

      const result = await publishQuery("sq-pub-002", {
        versionId: "ver-def-456",
      });

      expect(result).toEqual(
        expect.objectContaining({
          publishEventId: expect.any(String),
          versionId: expect.any(String),
          savedQueryId: expect.any(String),
          publishedSqlHash: expect.any(String),
          publishedAt: expect.any(String),
        }),
      );
    });

    it("passes different savedQueryId values correctly in URL", async () => {
      const responseData: PublishQueryResponse = {
        publishEventId: "evt-003",
        versionId: "ver-ghi-789",
        savedQueryId: "sq-different-id",
        publishedSqlHash: "hash-def",
        publishedAt: "2026-02-10T18:00:00.000Z",
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: responseData });

      await publishQuery("sq-different-id", { versionId: "ver-ghi-789" });

      expect(api.post).toHaveBeenCalledWith(
        "/query-activities/publish/sq-different-id",
        { versionId: "ver-ghi-789" },
      );
    });
  });

  describe("checkDrift()", () => {
    it("calls GET on /query-activities/drift/<savedQueryId>", async () => {
      const savedQueryId = "sq-drift-001";
      const responseData: DriftCheckResponse = {
        hasDrift: true,
        localSql: "SELECT Id FROM Subscribers",
        remoteSql: "SELECT Id, Email FROM Subscribers",
        localHash: "local-hash-aaa",
        remoteHash: "remote-hash-bbb",
      };

      vi.mocked(api.get).mockResolvedValueOnce({ data: responseData });

      const result = await checkDrift(savedQueryId);

      expect(api.get).toHaveBeenCalledWith(
        `/query-activities/drift/${savedQueryId}`,
      );
      expect(result).toEqual(responseData);
    });

    it("returns drift response with hasDrift=false for matching SQL", async () => {
      const responseData: DriftCheckResponse = {
        hasDrift: false,
        localSql: "SELECT Id FROM Subscribers",
        remoteSql: "SELECT Id FROM Subscribers",
        localHash: "same-hash",
        remoteHash: "same-hash",
      };

      vi.mocked(api.get).mockResolvedValueOnce({ data: responseData });

      const result = await checkDrift("sq-no-drift");

      expect(result.hasDrift).toBe(false);
      expect(result.localHash).toBe(result.remoteHash);
    });
  });

  describe("getBlastRadius()", () => {
    it("calls GET on /query-activities/blast-radius/<savedQueryId>", async () => {
      const savedQueryId = "sq-blast-001";
      const responseData: BlastRadiusResponse = {
        automations: [
          {
            id: "auto-1",
            name: "Daily Send",
            status: "Active",
            isHighRisk: true,
          },
          {
            id: "auto-2",
            name: "Welcome Journey",
            description: "Triggered on new subscriber",
            status: "Paused",
            isHighRisk: false,
          },
        ],
        totalCount: 2,
      };

      vi.mocked(api.get).mockResolvedValueOnce({ data: responseData });

      const result = await getBlastRadius(savedQueryId);

      expect(api.get).toHaveBeenCalledWith(
        `/query-activities/blast-radius/${savedQueryId}`,
      );
      expect(result).toEqual(responseData);
    });

    it("returns empty automations array when no automations reference the query", async () => {
      const responseData: BlastRadiusResponse = {
        automations: [],
        totalCount: 0,
      };

      vi.mocked(api.get).mockResolvedValueOnce({ data: responseData });

      const result = await getBlastRadius("sq-no-blast");

      expect(result.automations).toEqual([]);
      expect(result.totalCount).toBe(0);
    });
  });
});
