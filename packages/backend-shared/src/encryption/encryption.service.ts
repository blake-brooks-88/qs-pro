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

    return encrypt(plaintext, this.getKey());
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

    return decrypt(ciphertext, this.getKey());
  }

  private getKey(): string {
    const key = this.configService.get<string>("ENCRYPTION_KEY");
    if (!key) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason: "ENCRYPTION_KEY not configured",
      });
    }
    return key;
  }
}
