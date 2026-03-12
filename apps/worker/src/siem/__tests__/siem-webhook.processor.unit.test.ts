import { createHmac } from "node:crypto";

import type { ISiemWebhookConfigRepository } from "@qpp/database";
import axios from "axios";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SiemWebhookProcessor,
  type SiemWebhookJobData,
} from "../siem-webhook.processor";

vi.mock("axios");

const mockEncryptionService = {
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
};

const mockSiemRepo: ISiemWebhookConfigRepository = {
  findByTenantId: vi.fn(),
  upsert: vi.fn(),
  updateStatus: vi.fn(),
  incrementFailures: vi.fn(),
  resetFailures: vi.fn(),
  disable: vi.fn(),
};

const mockRlsContext = {
  runWithTenantContext: vi.fn(
    (_t: string, _m: string, fn: () => unknown) => fn(),
  ),
};

function buildJob(
  overrides: Partial<SiemWebhookJobData> = {},
): Job<SiemWebhookJobData> {
  return {
    data: {
      payload: {
        id: "evt-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        version: "1.0",
        tenantId: "tenant-1",
        mid: "12345",
        event: {
          type: "auth.login",
          actorType: "user",
          actorId: "user-1",
          actorEmail: "test@example.com",
          targetId: null,
          ipAddress: "1.2.3.4",
          metadata: null,
        },
      },
      webhookUrl: "https://siem.example.com/hook",
      secretEncrypted: "enc:my-secret",
      tenantId: "tenant-1",
      ...overrides,
    },
  } as Job<SiemWebhookJobData>;
}

describe("SiemWebhookProcessor", () => {
  let processor: SiemWebhookProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new SiemWebhookProcessor(
      mockEncryptionService as never,
      mockSiemRepo,
      mockRlsContext as never,
    );
  });

  describe("process", () => {
    it("delivers signed webhook payload and resets failures on success", async () => {
      vi.mocked(axios.post).mockResolvedValue({ status: 200, data: "ok" });
      vi.mocked(mockSiemRepo.resetFailures).mockResolvedValue(undefined);

      await processor.process(buildJob());

      expect(axios.post).toHaveBeenCalledWith(
        "https://siem.example.com/hook",
        expect.any(String),
        expect.objectContaining({
          timeout: 10_000,
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "X-QPP-Event-ID": "evt-1",
          }),
        }),
      );

      const callArgs = vi.mocked(axios.post).mock.calls[0];
      const headers = (callArgs?.[2] as { headers: Record<string, string> })
        ?.headers;
      expect(headers["X-QPP-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(headers["X-QPP-Timestamp"]).toMatch(/^\d+$/);

      expect(mockSiemRepo.resetFailures).toHaveBeenCalledWith("tenant-1");
    });

    it("computes correct HMAC-SHA256 signature", async () => {
      const now = Math.floor(Date.now() / 1000);
      vi.spyOn(Date, "now").mockReturnValue(now * 1000);
      vi.mocked(axios.post).mockResolvedValue({ status: 200, data: "ok" });
      vi.mocked(mockSiemRepo.resetFailures).mockResolvedValue(undefined);

      const job = buildJob();
      await processor.process(job);

      const body = JSON.stringify(job.data.payload);
      const expected = createHmac("sha256", "my-secret")
        .update(`${now}.${body}`)
        .digest("hex");

      const callArgs = vi.mocked(axios.post).mock.calls[0];
      const headers = (callArgs?.[2] as { headers: Record<string, string> })
        ?.headers;
      expect(headers["X-QPP-Signature"]).toBe(`sha256=${expected}`);

      vi.spyOn(Date, "now").mockRestore();
    });

    it("increments failure count on delivery failure", async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error("Connection refused"));
      vi.mocked(mockSiemRepo.incrementFailures).mockResolvedValue(1);

      await expect(processor.process(buildJob())).rejects.toThrow(
        "Webhook delivery failed: Connection refused",
      );

      expect(mockSiemRepo.incrementFailures).toHaveBeenCalledWith(
        "tenant-1",
        "Connection refused",
      );
    });

    it("auto-disables webhook after 10 consecutive failures", async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error("Timeout"));
      vi.mocked(mockSiemRepo.incrementFailures).mockResolvedValue(10);
      vi.mocked(mockSiemRepo.disable).mockResolvedValue(undefined);

      await expect(processor.process(buildJob())).rejects.toThrow(
        "Webhook delivery failed",
      );

      expect(mockSiemRepo.disable).toHaveBeenCalledWith(
        "tenant-1",
        "10 consecutive delivery failures",
      );
    });

    it("does not auto-disable before 10 failures", async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error("Timeout"));
      vi.mocked(mockSiemRepo.incrementFailures).mockResolvedValue(9);

      await expect(processor.process(buildJob())).rejects.toThrow();

      expect(mockSiemRepo.disable).not.toHaveBeenCalled();
    });

    it("throws error on non-2xx response to trigger retry", async () => {
      vi.mocked(axios.post).mockRejectedValue(
        new Error("Request failed with status code 500"),
      );
      vi.mocked(mockSiemRepo.incrementFailures).mockResolvedValue(1);

      await expect(processor.process(buildJob())).rejects.toThrow(
        "Webhook delivery failed",
      );
    });

    it("throws when secret decryption fails", async () => {
      vi.mocked(mockEncryptionService.decrypt).mockReturnValue(null as unknown as string);

      await expect(processor.process(buildJob())).rejects.toThrow(
        "Failed to decrypt webhook secret",
      );
    });
  });
});
