import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode, ErrorMessages } from "../common/errors";
import { MCE_AUTH_PROVIDER, MceAuthProvider } from "./mce-auth.provider";
import { MceBridgeService } from "./mce-bridge.service";
import { MceHttpClient } from "./mce-http-client";

describe("MceBridgeService", () => {
  let service: MceBridgeService;
  let authProvider: MceAuthProvider;
  let mockHttpClient: { request: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockHttpClient = {
      request: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MceBridgeService,
        {
          provide: MCE_AUTH_PROVIDER,
          useValue: {
            refreshToken: vi.fn().mockResolvedValue({
              accessToken: "valid-token",
              tssd: "test-tssd",
            }),
            invalidateToken: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
          },
        },
        {
          provide: MceHttpClient,
          useValue: mockHttpClient,
        },
      ],
    }).compile();

    service = module.get<MceBridgeService>(MceBridgeService);
    authProvider = module.get<MceAuthProvider>(MCE_AUTH_PROVIDER);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("buildSoapEnvelope", () => {
    it("should construct a valid SOAP envelope with token", () => {
      const body = "<RetrieveRequest>...</RetrieveRequest>";
      const token = "my-access-token";
      const envelope = service.buildSoapEnvelope(token, body);

      expect(envelope).toContain("<soap:Envelope");
      expect(envelope).toContain(token);
      expect(envelope).toContain(body);
      expect(envelope).toContain("http://schemas.xmlsoap.org/soap/envelope/");
    });
  });

  describe("request", () => {
    it("should make a request with refreshed token and correct base URL", async () => {
      mockHttpClient.request.mockResolvedValue({ success: true });

      const response = await service.request("tenant-1", "user-1", "mid-1", {
        method: "GET",
        url: "/asset/v1/content/assets", // Relative URL
      });

      expect(vi.mocked(authProvider.refreshToken)).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "mid-1",
        false, // forceRefresh parameter
      );
      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://test-tssd.rest.marketingcloudapis.com",
          url: "/asset/v1/content/assets",
          headers: expect.objectContaining({
            Authorization: "Bearer valid-token",
          }),
        }),
        undefined, // timeout parameter (optional, defaults in MceHttpClient)
      );
      expect(response).toEqual({ success: true });
    });

    it("should handle SOAP requests using POST and specific content type", async () => {
      vi.spyOn(axios, "request").mockResolvedValue({
        data: "<soap>response</soap>",
      });

      const soapBody = "<RetrieveRequestMsg>...</RetrieveRequestMsg>";

      await service.soapRequest(
        "tenant-1",
        "user-1",
        "mid-1",
        soapBody,
        "Retrieve",
      );

      expect(vi.mocked(axios.request)).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://test-tssd.soap.marketingcloudapis.com",
          url: "/Service.asmx",
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "text/xml",
            SOAPAction: "Retrieve",
          }),
          data: expect.stringContaining("soap:Envelope"),
        }),
      );
    });

    it("should retry once when SOAP returns Login Failed security fault", async () => {
      const faultXml = `
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <soap:Fault>
              <faultcode xmlns:q0="...wssecurity...">q0:Security</faultcode>
              <faultstring>Login Failed</faultstring>
            </soap:Fault>
          </soap:Body>
        </soap:Envelope>
      `;

      vi.spyOn(axios, "request")
        .mockResolvedValueOnce({ data: faultXml })
        .mockResolvedValueOnce({ data: "<soap>ok</soap>" });

      await service.soapRequest(
        "tenant-1",
        "user-1",
        "mid-1",
        "<RetrieveRequestMsg>...</RetrieveRequestMsg>",
        "Retrieve",
      );

      expect(vi.mocked(authProvider.invalidateToken)).toHaveBeenCalledWith(
        "tenant-1",
        "user-1",
        "mid-1",
      );
      expect(vi.mocked(authProvider.refreshToken)).toHaveBeenNthCalledWith(
        1,
        "tenant-1",
        "user-1",
        "mid-1",
        false,
      );
      expect(vi.mocked(authProvider.refreshToken)).toHaveBeenNthCalledWith(
        2,
        "tenant-1",
        "user-1",
        "mid-1",
        true,
      );
      expect(vi.mocked(axios.request)).toHaveBeenCalledTimes(2);
    });

    it("should retry internally on 401 and succeed", async () => {
      // MceHttpClient throws AppError with MCE_AUTH_EXPIRED for 401
      mockHttpClient.request
        .mockRejectedValueOnce(new AppError(ErrorCode.MCE_AUTH_EXPIRED))
        .mockResolvedValueOnce({ success: true });

      const response = await service.request("t1", "u1", "m1", {
        url: "/test",
      });

      expect(vi.mocked(authProvider.invalidateToken)).toHaveBeenCalled();
      expect(vi.mocked(authProvider.refreshToken)).toHaveBeenCalledTimes(2);
      expect(response).toEqual({ success: true });
    });

    it("should throw MCE_AUTH_EXPIRED after 401 retry fails", async () => {
      // MceHttpClient throws AppError with MCE_AUTH_EXPIRED for 401
      mockHttpClient.request
        .mockRejectedValueOnce(new AppError(ErrorCode.MCE_AUTH_EXPIRED))
        .mockRejectedValueOnce(new AppError(ErrorCode.MCE_AUTH_EXPIRED));

      try {
        await service.request("t1", "u1", "m1", { url: "/test" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect(error).toBeInstanceOf(AppError);
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect((error as AppError).code).toBe(ErrorCode.MCE_AUTH_EXPIRED);
      }
    });

    it("should throw MCE_BAD_REQUEST for 400", async () => {
      // MceHttpClient throws AppError with MCE_BAD_REQUEST for 400
      mockHttpClient.request.mockRejectedValue(
        new AppError(ErrorCode.MCE_BAD_REQUEST),
      );

      try {
        await service.request("t1", "u1", "m1", { url: "/test" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect(error).toBeInstanceOf(AppError);
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect((error as AppError).code).toBe(ErrorCode.MCE_BAD_REQUEST);
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect((error as AppError).message).toBe(
          ErrorMessages[ErrorCode.MCE_BAD_REQUEST],
        );
      }
    });

    it("should throw MCE_FORBIDDEN for 403", async () => {
      // MceHttpClient throws AppError with MCE_FORBIDDEN for 403
      mockHttpClient.request.mockRejectedValue(
        new AppError(ErrorCode.MCE_FORBIDDEN),
      );

      try {
        await service.request("t1", "u1", "m1", { url: "/test" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect(error).toBeInstanceOf(AppError);
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect((error as AppError).code).toBe(ErrorCode.MCE_FORBIDDEN);
      }
    });

    it("should retry 5xx via withRetry then throw MCE_SERVER_ERROR after exhausting retries", async () => {
      // MceHttpClient throws AppError with MCE_SERVER_ERROR for 500
      // withRetry will retry this (maxRetries=3 means 4 total attempts)
      mockHttpClient.request.mockRejectedValue(
        new AppError(ErrorCode.MCE_SERVER_ERROR),
      );

      try {
        await service.request("t1", "u1", "m1", { url: "/test" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect(error).toBeInstanceOf(AppError);
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect((error as AppError).code).toBe(ErrorCode.MCE_SERVER_ERROR);
      }

      // Verify withRetry attempted 4 times (1 initial + 3 retries)
      expect(mockHttpClient.request).toHaveBeenCalledTimes(4);
    }, 30000); // Extended timeout for retry delays

    it("should pass through AppError from AuthService", async () => {
      const authError = new AppError(ErrorCode.MCE_CREDENTIALS_MISSING);
      vi.mocked(authProvider.refreshToken).mockRejectedValue(authError);

      try {
        await service.request("t1", "u1", "m1", { url: "/test" });
        expect.fail("Expected AppError to be thrown");
      } catch (error) {
        // eslint-disable-next-line vitest/no-conditional-expect -- verifying error properties after catching
        expect(error).toBe(authError); // Same instance, not wrapped
      }
    });
  });
});
