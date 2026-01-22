import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../common/errors";
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
});
