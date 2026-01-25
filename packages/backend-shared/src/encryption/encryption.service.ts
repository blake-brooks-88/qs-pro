import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { decrypt, encrypt } from "@qpp/database";

import { AppError, ErrorCode } from "../common/errors";

@Injectable()
export class EncryptionService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string | null | undefined): string | null | undefined {
    if (plaintext === null) {
      return null;
    }
    if (plaintext === undefined) {
      return undefined;
    }
    if (plaintext === "") {
      return "";
    }

    return encrypt(plaintext, this.getPrimaryKey());
  }

  decrypt(ciphertext: string | null | undefined): string | null | undefined {
    if (ciphertext === null) {
      return null;
    }
    if (ciphertext === undefined) {
      return undefined;
    }
    if (ciphertext === "") {
      return "";
    }

    const keys = this.getKeys();
    let lastError: unknown;

    for (const key of keys) {
      try {
        return decrypt(ciphertext, key);
      } catch (error) {
        lastError = error;
      }
    }

    // Preserve decrypt error semantics when all keys fail.
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error("Failed to decrypt ciphertext");
  }

  private getKeys(): string[] {
    const rawKeys = this.configService.get<string>("ENCRYPTION_KEYS");
    if (typeof rawKeys === "string" && rawKeys.trim()) {
      const keys = rawKeys
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key.length > 0);
      if (keys.length > 0) {
        return keys;
      }
    }

    const key = this.configService.get<string>("ENCRYPTION_KEY");
    if (!key || !key.trim()) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason: "ENCRYPTION_KEY not configured",
      });
    }

    return [key.trim()];
  }

  private getPrimaryKey(): string {
    const keys = this.getKeys();
    const primary = keys[0];
    if (!primary) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason: "ENCRYPTION_KEY not configured",
      });
    }
    return primary;
  }
}
