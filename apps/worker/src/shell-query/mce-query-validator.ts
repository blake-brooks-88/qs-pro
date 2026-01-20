import { Injectable, Logger } from "@nestjs/common";
import { MceBridgeService } from "@qpp/backend-shared";
import * as crypto from "crypto";

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ValidationContext {
  tenantId: string;
  userId: string;
  mid: string;
}

interface MceValidationResponse {
  queryValid: boolean;
  errorMessage?: string;
}

@Injectable()
export class MceQueryValidator {
  private readonly logger = new Logger(MceQueryValidator.name);

  constructor(private readonly mceBridge: MceBridgeService) {}

  async validateQuery(
    sqlText: string,
    context: ValidationContext,
  ): Promise<ValidationResult> {
    const sqlHash = crypto.createHash("sha256").update(sqlText).digest("hex");

    try {
      this.logger.debug({
        message: "Validating query with MCE",
        sqlHash,
        tenantId: context.tenantId,
      });

      const response = await this.mceBridge.request<MceValidationResponse>(
        context.tenantId,
        context.userId,
        context.mid,
        {
          method: "POST",
          url: "/automation/v1/queries/actions/validate/",
          data: { Text: sqlText },
        },
      );

      if (response.queryValid) {
        this.logger.debug({
          message: "Query validation passed",
          sqlHash,
        });
        return { valid: true };
      }

      this.logger.warn({
        message: "Query validation failed",
        sqlHash,
        errorMessage: response.errorMessage,
      });

      return {
        valid: false,
        errors: response.errorMessage
          ? [response.errorMessage]
          : ["Query validation failed"],
      };
    } catch (error: unknown) {
      const err = error as { message?: string; status?: number };
      this.logger.warn({
        message:
          "Query validation endpoint error - proceeding with execution (graceful degradation)",
        sqlHash,
        error: err.message,
        status: err.status,
      });

      return { valid: true };
    }
  }
}
