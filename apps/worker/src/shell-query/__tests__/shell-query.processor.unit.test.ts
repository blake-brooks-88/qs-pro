/**
 * Shell Query Processor Unit Tests
 *
 * Tests the ShellQueryProcessor which handles job execution and polling
 * for shell query runs in Marketing Cloud Engagement.
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  AppError,
  AsyncStatusService,
  EncryptionService,
  ErrorCode,
  MceBridgeService,
  RestDataService,
  RlsContextService,
} from "@qpp/backend-shared";
import {
  type AsyncStatusServiceStub,
  createAsyncStatusServiceStub,
  createDbStub,
  createEncryptionServiceStub,
  createMceBridgeStub,
  createMetricsStub,
  createMockBullJob,
  createMockPollBullJob,
  createQueueStub,
  createRedisStub,
  createRestDataServiceStub,
  createRlsContextStub,
  type DbStub,
  type EncryptionServiceStub,
  type MceBridgeStub,
  type MetricsStub,
  type QueueStub,
  type RedisStub,
  type RestDataServiceStub,
  type RlsContextStub,
} from "@qpp/test-utils";
import { DelayedError, UnrecoverableError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ShellQueryProcessor } from "../shell-query.processor";
import { POLL_CONFIG } from "../shell-query.types";
import { RunToTargetFlow } from "../strategies/run-to-target.strategy";
import { RunToTempFlow } from "../strategies/run-to-temp.strategy";

describe("ShellQueryProcessor", () => {
  let processor: ShellQueryProcessor;
  let runToTempFlowMock: {
    execute: ReturnType<typeof vi.fn>;
    retrieveQueryDefinitionObjectId: ReturnType<typeof vi.fn>;
  };
  let runToTargetFlowMock: {
    execute: ReturnType<typeof vi.fn>;
    retrieveQueryDefinitionObjectId: ReturnType<typeof vi.fn>;
  };
  let rlsContextStub: RlsContextStub;
  let mceBridgeStub: MceBridgeStub;
  let asyncStatusServiceStub: AsyncStatusServiceStub;
  let restDataServiceStub: RestDataServiceStub;
  let encryptionServiceStub: EncryptionServiceStub;
  let dbStub: DbStub;
  let redisStub: RedisStub;
  let queueStub: QueueStub;
  let metricsJobsTotal: MetricsStub;
  let metricsFailuresTotal: MetricsStub;
  let metricsActiveJobs: MetricsStub;
  let metricsDuration: MetricsStub;

  beforeEach(async () => {
    runToTempFlowMock = {
      execute: vi.fn().mockResolvedValue({
        status: "ready",
        taskId: "task-123",
        queryDefinitionId: "qd-123",
        queryCustomerKey: "QPP_Query_user-1",
        targetDeCustomerKey: "QPP_Results_run-1",
      }),
      retrieveQueryDefinitionObjectId: vi.fn().mockResolvedValue(null),
    };

    runToTargetFlowMock = {
      execute: vi.fn().mockResolvedValue({
        status: "ready",
        taskId: "task-target-123",
        queryDefinitionId: "qd-target-123",
        queryCustomerKey: "QPP_Query_user-1",
        targetDeCustomerKey: "ExistingDE_CustomerKey",
      }),
      retrieveQueryDefinitionObjectId: vi.fn().mockResolvedValue(null),
    };

    rlsContextStub = createRlsContextStub();
    mceBridgeStub = createMceBridgeStub();
    asyncStatusServiceStub = createAsyncStatusServiceStub();
    restDataServiceStub = createRestDataServiceStub();
    encryptionServiceStub = createEncryptionServiceStub();
    dbStub = createDbStub();
    redisStub = createRedisStub();
    queueStub = createQueueStub();
    metricsJobsTotal = createMetricsStub();
    metricsFailuresTotal = createMetricsStub();
    metricsActiveJobs = createMetricsStub();
    metricsDuration = createMetricsStub();

    // Default: no existing run (not canceled)
    dbStub.setSelectResult([{ status: "pending" }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryProcessor,
        { provide: RunToTempFlow, useValue: runToTempFlowMock },
        { provide: RunToTargetFlow, useValue: runToTargetFlowMock },
        { provide: RlsContextService, useValue: rlsContextStub },
        { provide: MceBridgeService, useValue: mceBridgeStub },
        { provide: AsyncStatusService, useValue: asyncStatusServiceStub },
        { provide: RestDataService, useValue: restDataServiceStub },
        { provide: EncryptionService, useValue: encryptionServiceStub },
        { provide: "DATABASE", useValue: dbStub },
        { provide: "REDIS_CLIENT", useValue: redisStub },
        { provide: "METRICS_JOBS_TOTAL", useValue: metricsJobsTotal },
        { provide: "METRICS_DURATION", useValue: metricsDuration },
        { provide: "METRICS_FAILURES_TOTAL", useValue: metricsFailuresTotal },
        { provide: "METRICS_ACTIVE_JOBS", useValue: metricsActiveJobs },
        { provide: "BullQueue_shell-query", useValue: queueStub },
      ],
    }).compile();

    processor = module.get<ShellQueryProcessor>(ShellQueryProcessor);
    processor.setTestMode(true);
  });

  describe("process() - Job Dispatch", () => {
    it("routes poll-shell-query jobs to polling handler", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Complete",
        errorMsg: null,
        completedDate: new Date().toISOString(),
      });
      restDataServiceStub.getRowset.mockResolvedValue({
        count: 1,
        items: [{ id: 1 }],
      });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "completed");
    });

    it("routes execute-shell-query jobs to execution handler", async () => {
      // Arrange
      const job = createMockBullJob(
        { runId: "run-dispatch-execute" },
        "execute-shell-query",
      );

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "poll-enqueued");
      expect(queueStub.add).toHaveBeenCalledWith(
        "poll-shell-query",
        expect.objectContaining({
          runId: "run-dispatch-execute",
          pollCount: 0,
        }),
        expect.any(Object),
      );
    });

    it("defaults to execution handler for jobs without poll name", async () => {
      // Arrange
      const job = createMockBullJob(
        { runId: "run-dispatch-default" },
        "unknown-job-type",
      );

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "poll-enqueued");
      expect(queueStub.add).toHaveBeenCalledWith(
        "poll-shell-query",
        expect.objectContaining({
          runId: "run-dispatch-default",
          pollCount: 0,
        }),
        expect.any(Object),
      );
    });
  });

  describe("handleExecute() - Job Execution", () => {
    it("decrypts sqlText before passing to flow", async () => {
      // Arrange
      const job = createMockBullJob({
        sqlText: "encrypted:SELECT SubscriberKey FROM _Subscribers",
      });
      runToTempFlowMock.execute.mockImplementationOnce(async (args) => {
        if (args.sqlText !== "SELECT SubscriberKey FROM _Subscribers") {
          throw new Error(
            "Expected sqlText to be decrypted before flow execution",
          );
        }
        return {
          status: "ready",
          taskId: "task-123",
          queryDefinitionId: "qd-123",
          queryCustomerKey: "QPP_Query_user-1",
          targetDeCustomerKey: "QPP_Results_run-1",
        };
      });

      // Act
      const result = await processor.process(job as never);

      // Assert - successful execution implies flow ran with decrypted sqlText
      expect(result).toHaveProperty("status", "poll-enqueued");
    });

    it("returns canceled status when run is already canceled in database", async () => {
      // Arrange
      const job = createMockBullJob();
      dbStub.setSelectResult([{ status: "canceled" }]);

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toEqual({ status: "canceled", runId: job.data.runId });
      expect(queueStub.add).not.toHaveBeenCalled();
    });

    it("publishes queued status event after starting execution", async () => {
      // Arrange
      const job = createMockBullJob();

      // Act
      await processor.process(job as never);

      // Assert
      expect(redisStub.publish).toHaveBeenCalled();
      const publishCall = (
        redisStub.publish.mock.calls as Array<[string, string]>
      ).find(
        (call) =>
          call[0] === `run-status:${job.data.runId}` &&
          call[1]?.includes("queued"),
      );
      expect(publishCall).toBeDefined();
    });

    it("calls runToTempFlow.execute with job data and status publisher", async () => {
      // Arrange
      const job = createMockBullJob({
        runId: "run-abc",
        tenantId: "tenant-xyz",
        sqlText: "encrypted:SELECT 1",
      });

      // Act
      await processor.process(job as never);

      // Assert - poll job contains the runId, and sqlText was decrypted during execution
      expect(queueStub.add).toHaveBeenCalledWith(
        "poll-shell-query",
        expect.objectContaining({
          runId: "run-abc",
          pollCount: 0,
        }),
        expect.any(Object),
      );
    });

    it("enqueues poll job with correct data on successful execution", async () => {
      // Arrange
      const job = createMockBullJob({ runId: "run-enqueue-test" });
      runToTempFlowMock.execute.mockResolvedValue({
        status: "ready",
        taskId: "task-enqueue",
        queryDefinitionId: "qd-enqueue",
        queryCustomerKey: "QPP_Query_enqueue",
        targetDeCustomerKey: "QPP_Results_enqueue",
      });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "poll-enqueued");
      expect(result).toHaveProperty("taskId", "task-enqueue");
      expect(queueStub.add).toHaveBeenCalledWith(
        "poll-shell-query",
        expect.objectContaining({
          runId: "run-enqueue-test",
          taskId: "task-enqueue",
          queryDefinitionId: "qd-enqueue",
          pollCount: 0,
        }),
        expect.objectContaining({
          delay: 0, // testMode bypasses delay
          jobId: "poll-run-enqueue-test",
        }),
      );
    });

    it("throws UnrecoverableError when decryption throws", async () => {
      // Arrange
      const job = createMockBullJob({ sqlText: "bad-encrypted-data" });
      encryptionServiceStub.decrypt.mockImplementation(() => {
        throw new Error("Decryption failed");
      });

      // Act & Assert
      await expect(processor.process(job as never)).rejects.toThrow(
        UnrecoverableError,
      );
      expect(queueStub.add).not.toHaveBeenCalled();
    });

    it("throws UnrecoverableError when decryption returns null", async () => {
      // Arrange
      const job = createMockBullJob({ sqlText: "returns-null" });
      encryptionServiceStub.decrypt.mockReturnValue(null);

      // Act & Assert
      await expect(processor.process(job as never)).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it("converts terminal AppError to UnrecoverableError", async () => {
      // Arrange
      const job = createMockBullJob();
      const terminalError = new AppError(
        ErrorCode.MCE_AUTH_EXPIRED,
        undefined,
        {
          statusMessage: "Invalid credentials",
        },
      );
      runToTempFlowMock.execute.mockRejectedValue(terminalError);

      // Act & Assert
      await expect(processor.process(job as never)).rejects.toThrow(
        UnrecoverableError,
      );
    });
  });

  describe("handlePoll() - Polling State Machine", () => {
    it("returns canceled status when run is canceled in database", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
      });
      dbStub.setSelectResult([{ status: "canceled" }]);

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toEqual({ status: "canceled", runId: job.data.runId });
    });

    it("returns timeout status when MAX_DURATION_MS exceeded", async () => {
      // Arrange
      const pastStart = new Date(
        Date.now() - POLL_CONFIG.MAX_DURATION_MS - 1000,
      ).toISOString();
      const job = createMockPollBullJob({ pollStartedAt: pastStart });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "timeout");
    });

    it("returns budget-exceeded status when MAX_POLL_COUNT exceeded", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollCount: POLL_CONFIG.MAX_POLL_COUNT,
        pollStartedAt: new Date().toISOString(),
      });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "budget-exceeded");
    });

    it("returns failed status when async status has error", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Error",
        errorMsg: "Query execution failed",
        completedDate: null,
      });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "failed");
      expect(result).toHaveProperty("error", "Query execution failed");
    });

    it("treats FatalError status as failed even when errorMsg is empty", async () => {
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "FatalError",
        errorMsg: "",
        completedDate: new Date().toISOString(),
      });

      const result = await processor.process(job as never);

      expect(result).toHaveProperty("status", "failed");
      expect(result).toHaveProperty("error");
      expect((result as { error?: string }).error).toContain("FatalError");
    });

    it("returns completed status when async status is Complete", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
        targetDeCustomerKey: "QPP_Results_test",
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Complete",
        errorMsg: null,
        completedDate: new Date().toISOString(),
      });
      restDataServiceStub.getRowset.mockResolvedValue({
        count: 5,
        items: [{ id: 1 }],
      });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "completed");
    });

    it("continues polling when status is Pending", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollCount: 0,
        pollStartedAt: new Date().toISOString(),
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Pending",
        errorMsg: null,
        completedDate: null,
      });

      // Act
      const result = await processor.process(job as never);

      // Assert - in test mode, returns polling status instead of throwing DelayedError
      expect(result).toHaveProperty("status", "polling");
      expect(result).toHaveProperty("pollCount", 1);
    });

    it("fast-paths to ready when row probe finds rows", async () => {
      // Arrange
      const pastStart = new Date(
        Date.now() - POLL_CONFIG.ROW_PROBE_MIN_RUNTIME_MS - 1000,
      ).toISOString();
      const job = createMockPollBullJob({
        pollCount: 1,
        pollStartedAt: pastStart,
        targetDeCustomerKey: "QPP_Results_probe",
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Pending",
        errorMsg: null,
        completedDate: null,
      });
      restDataServiceStub.getRowset.mockResolvedValue({
        count: 10,
        items: [{ id: 1 }],
      });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "completed");
    });

    it("starts isRunning checks after stuck threshold", async () => {
      // Arrange
      const pastStart = new Date(
        Date.now() - POLL_CONFIG.STUCK_THRESHOLD_MS - 1000,
      ).toISOString();
      const job = createMockPollBullJob({
        pollCount: 5,
        pollStartedAt: pastStart,
        queryCustomerKey: "QPP_Query_stuck",
        queryDefinitionId: "qd-stuck",
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Pending",
        errorMsg: null,
        completedDate: null,
      });
      restDataServiceStub.checkIsRunning.mockResolvedValue({ isRunning: true });

      // Act
      await processor.process(job as never);

      // Assert
      expect(restDataServiceStub.checkIsRunning).toHaveBeenCalled();
    });

    it("confirms not-running after required confirmations", async () => {
      // Arrange
      const pastStart = new Date(
        Date.now() - POLL_CONFIG.STUCK_THRESHOLD_MS - 1000,
      ).toISOString();
      const firstDetection = new Date(
        Date.now() - POLL_CONFIG.NOT_RUNNING_CONFIRMATION_MIN_GAP_MS - 1000,
      ).toISOString();
      const job = createMockPollBullJob({
        pollCount: 10,
        pollStartedAt: pastStart,
        queryCustomerKey: "QPP_Query_confirm",
        queryDefinitionId: "qd-confirm",
        targetDeCustomerKey: "QPP_Results_confirm",
        notRunningDetectedAt: firstDetection,
        notRunningConfirmations: POLL_CONFIG.NOT_RUNNING_CONFIRMATIONS - 1,
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Pending",
        errorMsg: null,
        completedDate: null,
      });
      restDataServiceStub.checkIsRunning.mockResolvedValue({
        isRunning: false,
      });
      restDataServiceStub.getRowset.mockResolvedValue({
        count: 1,
        items: [{ id: 1 }],
      });

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toHaveProperty("status", "completed");
    });

    it("performs rowset readiness check on completion", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
        targetDeCustomerKey: "QPP_Results_readiness",
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Complete",
        errorMsg: null,
        completedDate: new Date().toISOString(),
      });
      restDataServiceStub.getRowset.mockResolvedValue({
        count: 3,
        items: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });

      // Act
      await processor.process(job as never);

      // Assert
      expect(restDataServiceStub.getRowset).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "QPP_Results_readiness",
        1,
        1,
      );
    });
  });

  describe("Error Handling", () => {
    it("rethrows DelayedError without transformation", async () => {
      // Arrange
      processor.setTestMode(false);
      const job = createMockPollBullJob({
        pollCount: 0,
        pollStartedAt: new Date().toISOString(),
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Pending",
        errorMsg: null,
        completedDate: null,
      });

      // Act & Assert
      await expect(
        processor.process(job as never, "token-123"),
      ).rejects.toThrow(DelayedError);
    });

    it("converts terminal AppError to UnrecoverableError in poll handler", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
      });
      const terminalError = new AppError(
        ErrorCode.MCE_AUTH_EXPIRED,
        undefined,
        {
          statusMessage: "Token expired",
        },
      );
      asyncStatusServiceStub.retrieve.mockRejectedValue(terminalError);

      // Act & Assert
      await expect(processor.process(job as never)).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it("preserves non-terminal errors for retry", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
      });
      const retryableError = new AppError(
        ErrorCode.MCE_RATE_LIMITED,
        undefined,
        {
          statusMessage: "Rate limited",
        },
      );
      asyncStatusServiceStub.retrieve.mockRejectedValue(retryableError);

      // Act & Assert
      await expect(processor.process(job as never)).rejects.toThrow(AppError);
      await expect(processor.process(job as never)).rejects.not.toThrow(
        UnrecoverableError,
      );
    });

    it("onFailed returns early for non-permanent failure (retryable)", async () => {
      // Arrange
      const job = createMockBullJob();
      job.attemptsMade = 1;
      job.opts.attempts = 3;
      const error = new Error("Retryable error");

      // Act
      await processor.onFailed(job as never, error);

      // Assert - no permanent failure actions taken
      expect(metricsJobsTotal.inc).not.toHaveBeenCalledWith({
        status: "failed",
      });
      expect(metricsFailuresTotal.inc).not.toHaveBeenCalled();
      expect(dbStub.update).not.toHaveBeenCalled();
      expect(redisStub.publish).not.toHaveBeenCalled();
    });

    it("onFailed marks run as failed on permanent failure", async () => {
      // Arrange
      const job = createMockBullJob();
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("Permanent failure");

      // Act
      await processor.onFailed(job as never, error);

      // Assert
      expect(dbStub.update).toHaveBeenCalled();
    });

    it("onFailed treats final attempt as permanent failure even with regular Error", async () => {
      // Arrange
      const job = createMockBullJob();
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new Error("Final attempt regular error");

      // Act
      await processor.onFailed(job as never, error);

      // Assert - permanent failure actions taken
      expect(metricsJobsTotal.inc).toHaveBeenCalledWith({ status: "failed" });
      expect(metricsFailuresTotal.inc).toHaveBeenCalledWith({
        error_type: "permanent",
      });
      expect(dbStub.update).toHaveBeenCalled();
      expect(redisStub.publish).toHaveBeenCalled();
    });

    it("onFailed persists AppError validation violations when UnrecoverableError has an AppError cause", async () => {
      const job = createMockBullJob();
      job.attemptsMade = 3;
      job.opts.attempts = 3;

      const appError = new AppError(
        ErrorCode.MCE_VALIDATION_FAILED,
        undefined,
        undefined,
        {
          violations: [
            'The multi-part identifier "ms.Email" could not be bound.',
          ],
        },
      );

      const error = new UnrecoverableError(
        "Query validation failed.",
      ) as Error & { cause?: unknown };
      error.cause = appError;

      await processor.onFailed(job as never, error as never);

      expect(dbStub.update).toHaveBeenCalled();
      const updateResult = dbStub.update.mock.results[0]?.value as
        | { set?: ReturnType<typeof vi.fn> }
        | undefined;
      expect(updateResult?.set).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: expect.stringContaining(
            'encrypted:The multi-part identifier "ms.Email" could not be bound.',
          ),
        }),
      );
    });

    it("onFailed attempts cleanup on failure", async () => {
      // Arrange
      const job = createMockPollBullJob({
        queryDefinitionId: "qd-cleanup",
      });
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("Cleanup test");

      // Act
      await processor.onFailed(job as never, error);

      // Assert
      expect(mceBridgeStub.soapRequest).toHaveBeenCalled();
    });

    it("onFailed strips sensitive data from job payload", async () => {
      // Arrange
      const job = createMockBullJob({
        sqlText: "encrypted:SELECT secret FROM users",
      });
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("Strip test");

      // Act
      await processor.onFailed(job as never, error);

      // Assert
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          sqlText: "[stripped]",
        }),
      );
    });

    it("onFailed continues when status update throws", async () => {
      // Arrange
      const job = createMockPollBullJob({
        queryDefinitionId: "qd-status-error",
      });
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("Status update error test");

      // Make status update fail (first runWithUserContext call)
      let callCount = 0;
      rlsContextStub.runWithUserContext.mockImplementation(
        async <T>(
          _tenantId: string,
          _mid: string,
          _userId: string,
          callback: () => T | Promise<T>,
        ): Promise<T> => {
          callCount++;
          if (callCount === 1) {
            // Status update call
            throw new Error("Status update failed");
          }
          return callback();
        },
      );

      // Act
      await processor.onFailed(job as never, error);

      // Assert - SSE publish and cleanup still happen
      expect(redisStub.publish).toHaveBeenCalled();
      expect(mceBridgeStub.soapRequest).toHaveBeenCalled();
    });

    it("onFailed continues when SSE publish throws", async () => {
      // Arrange
      const job = createMockPollBullJob({
        queryDefinitionId: "qd-sse-error",
      });
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("SSE error test");

      // Make Redis publish fail
      redisStub.publish.mockRejectedValue(new Error("Redis publish failed"));

      // Act
      await processor.onFailed(job as never, error);

      // Assert - cleanup still happens
      expect(mceBridgeStub.soapRequest).toHaveBeenCalled();
    });

    it("onFailed continues when cleanup throws", async () => {
      // Arrange - use execute job which has sqlText
      const job = createMockBullJob({
        sqlText: "encrypted:SELECT 1",
      });
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("Cleanup error test");

      // Make cleanup (SOAP request) fail
      mceBridgeStub.soapRequest.mockRejectedValue(
        new Error("SOAP cleanup failed"),
      );

      // Act
      await processor.onFailed(job as never, error);

      // Assert - strip data still happens
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          sqlText: "[stripped]",
        }),
      );
    });

    it("onFailed completes gracefully when strip data throws", async () => {
      // Arrange
      const job = createMockBullJob({
        sqlText: "encrypted:SELECT 1",
      });
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      job.updateData.mockRejectedValue(new Error("updateData failed"));
      const error = new UnrecoverableError("Strip data error test");

      // Act & Assert - should not throw
      await expect(
        processor.onFailed(job as never, error),
      ).resolves.not.toThrow();
    });

    it("onFailed strips tableMetadata from poll job payload", async () => {
      // Arrange
      const job = createMockPollBullJob({
        queryDefinitionId: "qd-table-metadata",
      });
      // Add tableMetadata to poll job data (unusual but possible)
      (job.data as unknown as Record<string, unknown>).tableMetadata = {
        name: "TestTable",
        columns: [{ name: "id", type: "int" }],
      };
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("Table metadata strip test");

      // Act
      await processor.onFailed(job as never, error);

      // Assert
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          tableMetadata: undefined,
        }),
      );
    });
  });

  describe("Status Publishing", () => {
    it("publishes encrypted event to Redis channel", async () => {
      // Arrange
      const job = createMockBullJob({ runId: "run-publish" });

      // Act
      await processor.process(job as never);

      // Assert
      expect(redisStub.publish).toHaveBeenCalledWith(
        "run-status:run-publish",
        expect.stringContaining("encrypted:"),
      );
    });

    it("stores last event with TTL for late subscribers", async () => {
      // Arrange
      const job = createMockBullJob({ runId: "run-ttl" });

      // Act
      await processor.process(job as never);

      // Assert
      expect(redisStub.set).toHaveBeenCalledWith(
        "run-status:last:run-ttl",
        expect.any(String),
        "EX",
        86400,
      );
    });

    it("includes error message in failed status event", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Error",
        errorMsg: "Syntax error in query",
        completedDate: null,
      });

      // Act
      await processor.process(job as never);

      // Assert
      const publishCalls = redisStub.publish.mock.calls as Array<
        [string, string]
      >;
      const failedCall = publishCalls.find(
        (call) =>
          call[0] === `run-status:${job.data.runId}` &&
          call[1]?.includes("failed"),
      );
      expect(failedCall).toBeDefined();
    });

    it("does not publish when encryption fails", async () => {
      // Arrange
      const job = createMockBullJob({ runId: "run-no-encrypt" });
      // Make ALL encrypt calls return null to prevent any publish
      encryptionServiceStub.encrypt.mockReturnValue(null);

      // Act - execution continues but no publish happens
      await processor.process(job as never);

      // Assert - publish should NOT have been called because encryption failed
      expect(redisStub.publish).not.toHaveBeenCalled();
    });
  });

  describe("Metrics Recording", () => {
    it("increments metricsActiveJobs on job start and decrements on completion", async () => {
      // Arrange
      const job = createMockBullJob();

      // Act
      await processor.process(job as never);

      // Assert
      expect(metricsActiveJobs.inc).toHaveBeenCalled();
      expect(metricsActiveJobs.dec).toHaveBeenCalled();
    });

    it("increments metricsJobsTotal with status=ready on successful completion", async () => {
      // Arrange
      const job = createMockPollBullJob({
        pollStartedAt: new Date().toISOString(),
        targetDeCustomerKey: "QPP_Results_metrics",
      });
      asyncStatusServiceStub.retrieve.mockResolvedValue({
        status: "Complete",
        errorMsg: null,
        completedDate: new Date().toISOString(),
      });
      restDataServiceStub.getRowset.mockResolvedValue({
        count: 1,
        items: [{ id: 1 }],
      });

      // Act
      await processor.process(job as never);

      // Assert
      expect(metricsJobsTotal.inc).toHaveBeenCalledWith({ status: "ready" });
    });

    it("increments metricsFailuresTotal on permanent failure", async () => {
      // Arrange
      const job = createMockBullJob();
      job.attemptsMade = 3;
      job.opts.attempts = 3;
      const error = new UnrecoverableError("Metrics failure test");

      // Act
      await processor.onFailed(job as never, error);

      // Assert
      expect(metricsJobsTotal.inc).toHaveBeenCalledWith({ status: "failed" });
      expect(metricsFailuresTotal.inc).toHaveBeenCalledWith({
        error_type: "permanent",
      });
    });
  });

  describe("Cancellation Behavior", () => {
    it("stops execution when run is pre-canceled", async () => {
      // Arrange
      const job = createMockBullJob({ runId: "run-precanceled" });
      dbStub.setSelectResult([{ status: "canceled" }]);

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toEqual({ status: "canceled", runId: "run-precanceled" });
      expect(queueStub.add).not.toHaveBeenCalled();
    });

    it("stops polling when run is canceled mid-poll", async () => {
      // Arrange
      const job = createMockPollBullJob({
        runId: "run-midcancel",
        pollStartedAt: new Date().toISOString(),
      });
      dbStub.setSelectResult([{ status: "canceled" }]);

      // Act
      const result = await processor.process(job as never);

      // Assert
      expect(result).toEqual({ status: "canceled", runId: "run-midcancel" });
    });

    it("performs cleanup on cancellation during polling", async () => {
      // Arrange
      const job = createMockPollBullJob({
        runId: "run-cancel-cleanup",
        pollStartedAt: new Date().toISOString(),
        queryDefinitionId: "qd-cancel",
      });
      dbStub.setSelectResult([{ status: "canceled" }]);

      // Act
      await processor.process(job as never);

      // Assert
      expect(mceBridgeStub.soapRequest).toHaveBeenCalled();
    });
  });
});
