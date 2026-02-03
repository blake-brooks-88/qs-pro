import { Test, TestingModule } from "@nestjs/testing";
import { MceBridgeService } from "@qpp/backend-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MceQueryValidator } from "./mce-query-validator";

describe("MceQueryValidator", () => {
  let validator: MceQueryValidator;
  let mockMceBridge: { request: ReturnType<typeof vi.fn> };

  const mockContext = {
    tenantId: "tenant-1",
    userId: "user-1",
    mid: "mid-1",
  };

  beforeEach(async () => {
    mockMceBridge = {
      request: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MceQueryValidator,
        { provide: MceBridgeService, useValue: mockMceBridge },
      ],
    }).compile();

    validator = module.get<MceQueryValidator>(MceQueryValidator);
  });

  it("returns valid:true for query that passes MCE validation", async () => {
    // Arrange
    mockMceBridge.request.mockResolvedValue({ queryValid: true });

    // Act
    const result = await validator.validateQuery(
      "SELECT SubscriberKey FROM _Subscribers",
      mockContext,
    );

    // Assert - observable behavior: validation result indicates query is valid
    expect(result).toEqual({
      valid: true,
      errors: undefined,
    });
  });

  it("returns valid:false with MCE error messages for invalid query", async () => {
    // Arrange
    mockMceBridge.request.mockResolvedValue({
      queryValid: false,
      errorMessage: 'Syntax error near "SELCT"',
    });

    // Act
    const result = await validator.validateQuery("SELCT 1", mockContext);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Syntax error near "SELCT"');
  });

  it("returns valid:false with MCE errors array when errorMessage is missing", async () => {
    mockMceBridge.request.mockResolvedValue({
      queryValid: false,
      errors: ['Invalid object name "Master Subscriber"'],
    });

    const result = await validator.validateQuery(
      "SELECT * FROM [Master Subscriber]",
      mockContext,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid object name "Master Subscriber"');
  });

  it("proceeds with execution (returns valid:true) on validation endpoint 5xx error", async () => {
    // Arrange
    const serverError = new Error("Internal Server Error");
    (serverError as Error & { status: number }).status = 500;
    mockMceBridge.request.mockRejectedValue(serverError);

    // Act
    const result = await validator.validateQuery("SELECT 1", mockContext);

    // Assert: Graceful degradation - proceed with execution
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("proceeds with execution (returns valid:true) on validation endpoint timeout", async () => {
    // Arrange
    const timeoutError = new Error("Request timeout");
    timeoutError.name = "TimeoutError";
    mockMceBridge.request.mockRejectedValue(timeoutError);

    // Act
    const result = await validator.validateQuery("SELECT 1", mockContext);

    // Assert: Graceful degradation - proceed with execution
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("proceeds with execution (returns valid:true) on network error", async () => {
    // Arrange
    const networkError = new Error("Network Error");
    networkError.name = "AxiosError";
    mockMceBridge.request.mockRejectedValue(networkError);

    // Act
    const result = await validator.validateQuery("SELECT 1", mockContext);

    // Assert: Graceful degradation - proceed with execution
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });
});
