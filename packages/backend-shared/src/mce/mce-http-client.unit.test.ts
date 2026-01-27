import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../common/errors";
import { MCE_TIMEOUTS } from "./http-timeout.config";
import { MceHttpClient } from "./mce-http-client";

vi.mock("axios");

describe("MceHttpClient", () => {
  let client: MceHttpClient;

  beforeEach(() => {
    client = new MceHttpClient();
    vi.clearAllMocks();
  });

  describe("request", () => {
    it("returns response data on success", async () => {
      const mockData = { items: [1, 2, 3] };
      vi.mocked(axios.request).mockResolvedValue({ data: mockData });

      const result = await client.request({ url: "/test" });

      expect(result).toEqual(mockData);
    });

    it("maps 400 status to MCE_BAD_REQUEST", async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 400, data: "Bad request" },
        config: { url: "/test" },
      };
      vi.mocked(axios.request).mockRejectedValue(axiosError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      await expect(client.request({ url: "/test" })).rejects.toMatchObject({
        code: ErrorCode.MCE_BAD_REQUEST,
      });
    });

    it("maps 401 status to MCE_AUTH_EXPIRED", async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 401, data: "Unauthorized" },
        config: { url: "/test" },
      };
      vi.mocked(axios.request).mockRejectedValue(axiosError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      await expect(client.request({ url: "/test" })).rejects.toMatchObject({
        code: ErrorCode.MCE_AUTH_EXPIRED,
      });
    });

    it("maps 403 status to MCE_FORBIDDEN", async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 403, data: "Forbidden" },
        config: { url: "/test" },
      };
      vi.mocked(axios.request).mockRejectedValue(axiosError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      await expect(client.request({ url: "/test" })).rejects.toMatchObject({
        code: ErrorCode.MCE_FORBIDDEN,
      });
    });

    it("maps 5xx status to MCE_SERVER_ERROR", async () => {
      const axiosError = {
        isAxiosError: true,
        response: { status: 502, data: "Bad gateway" },
        config: { url: "/test" },
      };
      vi.mocked(axios.request).mockRejectedValue(axiosError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      await expect(client.request({ url: "/test" })).rejects.toMatchObject({
        code: ErrorCode.MCE_SERVER_ERROR,
      });
    });

    it("passes through existing AppError", async () => {
      const existingError = new AppError(ErrorCode.CONFIG_ERROR);
      vi.mocked(axios.request).mockRejectedValue(existingError);

      await expect(client.request({ url: "/test" })).rejects.toBe(
        existingError,
      );
    });

    it("wraps non-axios errors as MCE_SERVER_ERROR", async () => {
      vi.mocked(axios.request).mockRejectedValue(new Error("Network error"));
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      await expect(client.request({ url: "/test" })).rejects.toMatchObject({
        code: ErrorCode.MCE_SERVER_ERROR,
      });
    });
  });

  describe("timeout behavior", () => {
    it("applies DEFAULT timeout when none specified", async () => {
      vi.mocked(axios.request).mockResolvedValue({ data: {} });

      await client.request({ url: "/test" });

      expect(axios.request).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: MCE_TIMEOUTS.DEFAULT }),
      );
    });

    it("uses custom timeout when provided", async () => {
      vi.mocked(axios.request).mockResolvedValue({ data: {} });
      const customTimeout = 60_000;

      await client.request({ url: "/test" }, customTimeout);

      expect(axios.request).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: customTimeout }),
      );
    });

    it("translates ECONNABORTED to MCE_SERVER_ERROR with timeout message", async () => {
      const timeoutError = {
        isAxiosError: true,
        code: "ECONNABORTED",
        config: { url: "/data/v1/async/status" },
      };
      vi.mocked(axios.request).mockRejectedValue(timeoutError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const error = (await client
        .request({ url: "/data/v1/async/status" })
        .catch((e) => e)) as AppError;

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.MCE_SERVER_ERROR);
      expect(error.context?.statusMessage).toBe("Request timed out");
    });

    it("includes operation URL in timeout error context", async () => {
      const testUrl = "/data/v1/async/query/12345/status";
      const timeoutError = {
        isAxiosError: true,
        code: "ECONNABORTED",
        config: { url: testUrl },
      };
      vi.mocked(axios.request).mockRejectedValue(timeoutError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const error = (await client
        .request({ url: testUrl })
        .catch((e) => e)) as AppError;

      expect(error.context?.operation).toBe(testUrl);
    });

    it("strips query string from URL in timeout error context", async () => {
      const urlWithQuery = "/data/v1/async/query?token=secret&page=1";
      const timeoutError = {
        isAxiosError: true,
        code: "ECONNABORTED",
        config: { url: urlWithQuery },
      };
      vi.mocked(axios.request).mockRejectedValue(timeoutError);
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      const error = (await client
        .request({ url: urlWithQuery })
        .catch((e) => e)) as AppError;

      expect(error.context?.operation).toBe("/data/v1/async/query");
    });

    it("uses MCE_TIMEOUTS.DATA_RETRIEVAL for large data operations", async () => {
      vi.mocked(axios.request).mockResolvedValue({ data: { rows: [] } });

      await client.request({ url: "/rowset" }, MCE_TIMEOUTS.DATA_RETRIEVAL);

      expect(axios.request).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 120_000 }),
      );
    });
  });
});
