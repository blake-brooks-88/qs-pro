import { Injectable, Logger } from "@nestjs/common";
import { AppError, MCE_TIMEOUTS, MceBridgeService } from "@qpp/backend-shared";
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
  errors?: unknown;
}

function extractValidationErrors(response: MceValidationResponse): string[] {
  const collected: string[] = [];

  if (typeof response.errorMessage === "string" && response.errorMessage) {
    collected.push(response.errorMessage);
  }

  const rawErrors = response.errors;
  if (Array.isArray(rawErrors)) {
    for (const entry of rawErrors) {
      if (typeof entry === "string" && entry) {
        collected.push(entry);
        continue;
      }

      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const message = record.message ?? record.errorMessage ?? record.Error;
        if (typeof message === "string" && message) {
          collected.push(message);
        }
      }
    }
  }

  return collected.length > 0 ? collected : ["Query validation failed"];
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
        MCE_TIMEOUTS.METADATA,
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
        errors: Array.isArray(response.errors) ? response.errors : undefined,
      });

      return {
        valid: false,
        errors: extractValidationErrors(response),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const errorCode = error instanceof AppError ? error.code : undefined;
      this.logger.warn({
        message:
          "Query validation endpoint error - proceeding with execution (graceful degradation)",
        sqlHash,
        error: message,
        errorCode,
      });

      return { valid: true };
    }
  }
}
