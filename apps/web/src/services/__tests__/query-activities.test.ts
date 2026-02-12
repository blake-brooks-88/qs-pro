import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import type {
  CreateQueryActivityDto,
  LinkQueryResponse,
  QADetail,
  QAListItem,
} from "@qpp/shared-types";

import api from "@/services/api";

import {
  createQueryActivity,
  getQueryActivityDetail,
  linkQuery,
  listQueryActivities,
  unlinkQuery,
} from "../query-activities";

describe("query-activities service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("createQueryActivity()", () => {
    it("posts dto to /query-activities and returns response data", async () => {
      const dto: CreateQueryActivityDto = {
        name: "My Query Activity",
        queryText: "SELECT SubscriberKey FROM _Subscribers",
        targetDataExtensionCustomerKey: "target-de-key",
        targetUpdateType: "Overwrite",
      };
      const responseData = {
        objectId: "obj-123",
        customerKey: "qa-key-456",
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: responseData });

      const result = await createQueryActivity(dto);

      expect(api.post).toHaveBeenCalledWith("/query-activities", dto);
      expect(result).toEqual(responseData);
    });
  });

  describe("listQueryActivities()", () => {
    it("fetches from /query-activities and returns response data", async () => {
      const items: QAListItem[] = [
        {
          objectId: "obj-1",
          customerKey: "qa-1",
          name: "First QA",
          isLinked: false,
          linkedToQueryName: null,
        },
        {
          objectId: "obj-2",
          customerKey: "qa-2",
          name: "Second QA",
          isLinked: true,
          linkedToQueryName: "Saved Query 1",
        },
      ];

      vi.mocked(api.get).mockResolvedValueOnce({ data: items });

      const result = await listQueryActivities();

      expect(api.get).toHaveBeenCalledWith("/query-activities");
      expect(result).toEqual(items);
    });
  });

  describe("getQueryActivityDetail()", () => {
    it("fetches detail by customerKey and returns response data", async () => {
      const detail: QADetail = {
        objectId: "obj-1",
        customerKey: "qa-detail-key",
        name: "Detail QA",
        queryText: "SELECT Email FROM Subscribers",
        isLinked: false,
        linkedToQueryName: null,
        targetDEName: "TargetDE",
        targetDECustomerKey: "target-de-key",
      };

      vi.mocked(api.get).mockResolvedValueOnce({ data: detail });

      const result = await getQueryActivityDetail("qa-detail-key");

      expect(api.get).toHaveBeenCalledWith("/query-activities/qa-detail-key");
      expect(result).toEqual(detail);
    });
  });

  describe("linkQuery()", () => {
    it("posts link params and returns response data", async () => {
      const savedQueryId = "sq-abc-123";
      const params = {
        qaCustomerKey: "qa-key-789",
        conflictResolution: "keep-local" as const,
      };
      const linkResponse: LinkQueryResponse = {
        linkedQaObjectId: "obj-789",
        linkedQaCustomerKey: "qa-key-789",
        linkedQaName: "Linked QA",
        linkedAt: "2026-02-10T12:00:00.000Z",
        sqlUpdated: true,
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: linkResponse });

      const result = await linkQuery(savedQueryId, params);

      expect(api.post).toHaveBeenCalledWith(
        `/query-activities/link/${savedQueryId}`,
        params,
      );
      expect(result).toEqual(linkResponse);
    });

    it("sends params without conflictResolution when not provided", async () => {
      const savedQueryId = "sq-def-456";
      const params = { qaCustomerKey: "qa-key-000" };
      const linkResponse: LinkQueryResponse = {
        linkedQaObjectId: "obj-000",
        linkedQaCustomerKey: "qa-key-000",
        linkedQaName: "No Conflict QA",
        linkedAt: "2026-02-10T13:00:00.000Z",
        sqlUpdated: false,
      };

      vi.mocked(api.post).mockResolvedValueOnce({ data: linkResponse });

      const result = await linkQuery(savedQueryId, params);

      expect(api.post).toHaveBeenCalledWith(
        `/query-activities/link/${savedQueryId}`,
        params,
      );
      expect(result).toEqual(linkResponse);
    });
  });

  describe("unlinkQuery()", () => {
    it("sends delete request and returns void", async () => {
      const savedQueryId = "sq-unlink-123";

      vi.mocked(api.delete).mockResolvedValueOnce({});

      const result = await unlinkQuery(savedQueryId);

      expect(api.delete).toHaveBeenCalledWith(
        `/query-activities/link/${savedQueryId}`,
        { data: undefined },
      );
      expect(result).toBeUndefined();
    });

    it("sends options in delete body when provided", async () => {
      const savedQueryId = "sq-unlink-456";
      const options = { deleteLocal: true, deleteRemote: false };

      vi.mocked(api.delete).mockResolvedValueOnce({});

      await unlinkQuery(savedQueryId, options);

      expect(api.delete).toHaveBeenCalledWith(
        `/query-activities/link/${savedQueryId}`,
        { data: options },
      );
    });
  });
});
