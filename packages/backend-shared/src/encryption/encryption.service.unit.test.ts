import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../common/errors";
import { EncryptionService } from "./encryption.service";

// Valid 64-char hex key (256 bits for AES-256)
const VALID_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("EncryptionService", () => {
  let service: EncryptionService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe("encrypt", () => {
    it("returns base64 string for non-empty input", () => {
      vi.mocked(configService.get).mockReturnValue(VALID_KEY);

      const result = service.encrypt("hello world");

      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      // AES-256-GCM output is base64 encoded
      expect(() => Buffer.from(result as string, "base64")).not.toThrow();
    });

    it("returns null when given null", () => {
      const result = service.encrypt(null);

      expect(result).toBeNull();
      expect(configService.get).not.toHaveBeenCalled();
    });

    it("returns undefined when given undefined", () => {
      const result = service.encrypt(undefined);

      expect(result).toBeUndefined();
      expect(configService.get).not.toHaveBeenCalled();
    });

    it("returns empty string when given empty string", () => {
      const result = service.encrypt("");

      expect(result).toBe("");
      expect(configService.get).not.toHaveBeenCalled();
    });

    it("throws AppError when ENCRYPTION_KEY is missing", () => {
      vi.mocked(configService.get).mockReturnValue(undefined);

      expect(() => service.encrypt("test")).toThrow(AppError);
      try {
        service.encrypt("test");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.CONFIG_ERROR);
        expect((error as AppError).context).toEqual({
          reason: "ENCRYPTION_KEY not configured",
        });
      }
    });
  });

  describe("decrypt", () => {
    it("returns original plaintext after encrypt/decrypt cycle", () => {
      vi.mocked(configService.get).mockReturnValue(VALID_KEY);
      const plaintext = "sensitive data here";

      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("returns null when given null", () => {
      const result = service.decrypt(null);

      expect(result).toBeNull();
      expect(configService.get).not.toHaveBeenCalled();
    });

    it("returns undefined when given undefined", () => {
      const result = service.decrypt(undefined);

      expect(result).toBeUndefined();
      expect(configService.get).not.toHaveBeenCalled();
    });

    it("returns empty string when given empty string", () => {
      const result = service.decrypt("");

      expect(result).toBe("");
      expect(configService.get).not.toHaveBeenCalled();
    });

    it("throws on corrupted ciphertext", () => {
      vi.mocked(configService.get).mockReturnValue(VALID_KEY);

      expect(() => service.decrypt("not-valid-base64-ciphertext!")).toThrow();
    });

    it("throws AppError when ENCRYPTION_KEY is missing", () => {
      vi.mocked(configService.get).mockReturnValue(undefined);

      expect(() => service.decrypt("encrypted")).toThrow(AppError);
      try {
        service.decrypt("encrypted");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.CONFIG_ERROR);
      }
    });
  });
});
