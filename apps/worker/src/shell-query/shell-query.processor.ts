import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import {
  AppError,
  AsyncStatusService,
  buildDeleteQueryDefinition,
  ErrorCode,
  type IsRunningResponse,
  isTerminal,
  isUnrecoverable,
  MceBridgeService,
  RestDataService,
  RlsContextService,
  type RowsetResponse,
} from "@qpp/backend-shared";
import {
  eq,
  type PostgresJsDatabase,
  shellQueryRuns,
  type ShellQueryRunStatus,
} from "@qpp/database";
import { DelayedError, Job, Queue, UnrecoverableError } from "bullmq";
import * as crypto from "crypto";

import { buildQueryCustomerKey } from "./query-definition.utils";
import {
  calculateNextDelay,
  calculateRowsetReadyDelay,
  POLL_CONFIG,
  PollShellQueryJob,
  RunStatus,
  ShellQueryJob,
  SSEEvent,
  STATUS_MESSAGES,
} from "./shell-query.types";
import { RunToTempFlow } from "./strategies/run-to-temp.strategy";

type AnyShellQueryJob = ShellQueryJob | PollShellQueryJob;

interface IsRunningCheckResult {
  isRunning: boolean;
  needsIdFallback: boolean;
}

interface RowProbeResult {
  hasRows: boolean;
  count?: number;
  itemsLength?: number;
}

const LAST_EVENT_TTL_SECONDS = 86400;

@Processor("shell-query", { concurrency: 50, lockDuration: 120000 })
export class ShellQueryProcessor extends WorkerHost {
  private readonly logger = new Logger(ShellQueryProcessor.name);
  private testMode = process.env.NODE_ENV === "test";

  constructor(
    private readonly runToTempFlow: RunToTempFlow,
    private readonly rlsContext: RlsContextService,
    private readonly mceBridge: MceBridgeService,
    private readonly asyncStatusService: AsyncStatusService,
    private readonly restDataService: RestDataService,
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase<Record<string, never>>,
    @Inject("REDIS_CLIENT") private readonly redis: unknown,
    @Inject("METRICS_JOBS_TOTAL") private readonly metricsJobsTotal: unknown,
    // @ts-expect-error Kept for future observability
    @Inject("METRICS_DURATION") private readonly metricsDuration: unknown,
    @Inject("METRICS_FAILURES_TOTAL")
    private readonly metricsFailuresTotal: unknown,
    @Inject("METRICS_ACTIVE_JOBS") private readonly metricsActiveJobs: unknown,
    @InjectQueue("shell-query") private readonly shellQueryQueue: Queue,
  ) {
    super();
  }

  setTestMode(enabled: boolean) {
    this.testMode = enabled;
  }

  async process(job: Job<AnyShellQueryJob>, token?: string): Promise<unknown> {
    if (job.name === "poll-shell-query") {
      return this.handlePoll(job as Job<PollShellQueryJob>, token);
    }
    return this.handleExecute(job as Job<ShellQueryJob>);
  }

  @OnWorkerEvent("failed")
  async onFailed(
    job: Job<ShellQueryJob | PollShellQueryJob>,
    error: Error,
  ): Promise<void> {
    const { tenantId, userId, mid, runId } = job.data;
    const message = error.message;

    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;
    const isUnrecoverableError = error instanceof UnrecoverableError;
    const isPermanentFailure = isUnrecoverableError || isFinalAttempt;

    if (!isPermanentFailure) {
      this.logger.warn(
        {
          message: `Job ${job.id} attempt ${job.attemptsMade}/${maxAttempts} failed, will retry`,
          jobName: job.name,
          tenantId,
          runId,
          error: message,
          timestamp: new Date().toISOString(),
        },
        "ShellQueryProcessor",
      );
      return;
    }

    this.logger.error(
      {
        message: `Job ${job.id} permanently failed: ${message}`,
        jobName: job.name,
        tenantId,
        runId,
        attemptsMade: job.attemptsMade,
        maxAttempts,
        isUnrecoverableError,
        error: message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
      error.stack,
      "ShellQueryProcessor",
    );

    (
      this.metricsJobsTotal as { inc: (labels: { status: string }) => void }
    ).inc({ status: "failed" });
    (
      this.metricsFailuresTotal as {
        inc: (labels: { error_type: string }) => void;
      }
    ).inc({
      error_type: "permanent",
    });

    try {
      await this.updateStatus(tenantId, userId, mid, runId, "failed", {
        errorMessage: message,
        completedAt: new Date(),
      });
    } catch (statusError) {
      this.logger.error(
        `Failed to update status for run ${runId}: ${statusError instanceof Error ? statusError.message : "Unknown error"}`,
      );
    }

    try {
      await this.publishStatusEvent(runId, "failed", message);
    } catch (sseError) {
      this.logger.error(
        `Failed to publish SSE event for run ${runId}: ${sseError instanceof Error ? sseError.message : "Unknown error"}`,
      );
    }

    const queryDefinitionId =
      "queryDefinitionId" in job.data ? job.data.queryDefinitionId : undefined;

    try {
      await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          await this.cleanupAssetsForPoll(
            tenantId,
            userId,
            mid,
            runId,
            queryDefinitionId,
          );
        },
      );
    } catch (cleanupError) {
      const cleanupMessage =
        cleanupError instanceof Error ? cleanupError.message : "Unknown error";
      this.logger.warn(`Cleanup failed for run ${runId}: ${cleanupMessage}`);
    }
  }

  private async handleExecute(job: Job<ShellQueryJob>): Promise<unknown> {
    const { runId, tenantId, userId, mid, sqlText } = job.data;
    const sqlTextHash = crypto
      .createHash("sha256")
      .update(sqlText || "")
      .digest("hex");

    this.logger.log(
      {
        message: `Processing execute-shell-query job ${job.id}`,
        tenantId,
        runId,
        status: "running",
        sqlTextHash,
        timestamp: new Date().toISOString(),
      },
      "ShellQueryProcessor",
    );

    const alreadyCanceled = await this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const currentRun = await this.db
          .select()
          .from(shellQueryRuns)
          .where(eq(shellQueryRuns.id, runId));
        return currentRun[0]?.status === "canceled";
      },
    );

    if (alreadyCanceled) {
      this.logger.log(`Run ${runId} was canceled before execution started`);
      await this.publishStatusEvent(runId, "canceled");
      return { status: "canceled", runId };
    }

    (this.metricsActiveJobs as { inc: () => void }).inc();

    try {
      await this.updateStatus(tenantId, userId, mid, runId, "running", {
        startedAt: new Date(),
      });
      await this.publishStatusEvent(runId, "queued");

      const publishStatus = async (status: RunStatus): Promise<void> => {
        await this.publishStatusEvent(runId, status);
      };

      const result = await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          return await this.runToTempFlow.execute(job.data, publishStatus);
        },
      );

      if (!result.taskId) {
        throw new Error("No TaskID returned from flow execution");
      }

      const pollStartedAt = new Date();

      await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          await this.db
            .update(shellQueryRuns)
            .set({
              taskId: result.taskId,
              queryDefinitionId: result.queryDefinitionId,
              pollStartedAt,
            })
            .where(eq(shellQueryRuns.id, runId));
        },
      );

      const pollJobData: PollShellQueryJob = {
        runId,
        tenantId,
        userId: job.data.userId,
        mid,
        taskId: result.taskId,
        queryDefinitionId: result.queryDefinitionId ?? "",
        queryCustomerKey: result.queryCustomerKey ?? "",
        targetDeName: result.targetDeName ?? "",
        pollCount: 0,
        pollStartedAt: pollStartedAt.toISOString(),
        notRunningConfirmations: 0,
      };

      await this.shellQueryQueue.add("poll-shell-query", pollJobData, {
        delay: this.testMode ? 0 : POLL_CONFIG.INITIAL_DELAY_MS,
        jobId: `poll-${runId}`,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      });

      this.logger.log(
        {
          message: `Execute job ${runId} completed, poll job enqueued`,
          tenantId,
          runId,
          taskId: result.taskId,
          timestamp: new Date().toISOString(),
        },
        "ShellQueryProcessor",
      );

      return { status: "poll-enqueued", runId, taskId: result.taskId };
    } catch (error: unknown) {
      const message =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";

      this.logger.warn(`Execute job ${job.id} attempt failed: ${message}`);

      if (isTerminal(error)) {
        throw new UnrecoverableError(message);
      }
      throw error;
    } finally {
      (this.metricsActiveJobs as { dec: () => void }).dec();
    }
  }

  private async handlePoll(
    job: Job<PollShellQueryJob>,
    token?: string,
  ): Promise<unknown> {
    const { runId, tenantId, userId, mid, taskId, queryCustomerKey } = job.data;
    let { queryDefinitionId } = job.data;

    if (!token && !this.testMode) {
      throw new Error("Missing BullMQ token for poll job");
    }

    (this.metricsActiveJobs as { inc: () => void }).inc();

    try {
      const isCanceled = await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          const currentRun = await this.db
            .select()
            .from(shellQueryRuns)
            .where(eq(shellQueryRuns.id, runId));
          return currentRun[0]?.status === "canceled";
        },
      );

      if (isCanceled) {
        this.logger.log(`Run ${runId} was canceled, stopping polling.`);
        await this.publishStatusEvent(runId, "canceled");
        await this.rlsContext.runWithUserContext(
          tenantId,
          mid,
          userId,
          async () => {
            await this.cleanupAssetsForPoll(
              tenantId,
              userId,
              mid,
              runId,
              queryDefinitionId,
            );
          },
        );
        return { status: "canceled", runId };
      }

      const pollStartedAt = new Date(job.data.pollStartedAt).getTime();
      const elapsed = Date.now() - pollStartedAt;

      if (elapsed >= POLL_CONFIG.MAX_DURATION_MS) {
        await this.markFailed(
          tenantId,
          userId,
          mid,
          runId,
          "Query timed out after 29 minutes",
        );
        await this.rlsContext.runWithUserContext(
          tenantId,
          mid,
          userId,
          async () => {
            await this.cleanupAssetsForPoll(
              tenantId,
              userId,
              mid,
              runId,
              queryDefinitionId,
            );
          },
        );
        return { status: "timeout", runId };
      }

      if (job.data.pollCount >= POLL_CONFIG.MAX_POLL_COUNT) {
        await this.markFailed(
          tenantId,
          userId,
          mid,
          runId,
          "Poll budget exceeded",
        );
        await this.rlsContext.runWithUserContext(
          tenantId,
          mid,
          userId,
          async () => {
            await this.cleanupAssetsForPoll(
              tenantId,
              userId,
              mid,
              runId,
              queryDefinitionId,
            );
          },
        );
        return { status: "budget-exceeded", runId };
      }

      const pollResult = await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          return await this.asyncStatusService.retrieve(
            tenantId,
            userId,
            mid,
            taskId,
          );
        },
      );

      this.logger.debug(
        `Run ${runId} AsyncStatusService response: ${JSON.stringify(pollResult)}`,
      );

      const normalizedStatus = pollResult.status?.trim().toLowerCase();
      const hasError =
        normalizedStatus === "error" ||
        (pollResult.errorMsg && pollResult.errorMsg.trim() !== "");

      if (hasError) {
        const errorMessage = pollResult.errorMsg || "MCE Query Execution Error";
        await this.markFailed(tenantId, userId, mid, runId, errorMessage);
        await this.rlsContext.runWithUserContext(
          tenantId,
          mid,
          userId,
          async () => {
            await this.cleanupAssetsForPoll(
              tenantId,
              userId,
              mid,
              runId,
              queryDefinitionId,
            );
          },
        );
        return { status: "failed", runId, error: errorMessage };
      }

      const updatedData = { ...job.data };
      const { targetDeName } = job.data;

      const shouldRowProbe =
        Boolean(targetDeName) &&
        elapsed >= POLL_CONFIG.ROW_PROBE_MIN_RUNTIME_MS &&
        (!job.data.rowProbeLastCheckedAt ||
          Date.now() - Date.parse(job.data.rowProbeLastCheckedAt) >=
            POLL_CONFIG.ROW_PROBE_MIN_INTERVAL_MS);

      if (shouldRowProbe) {
        const probeResult = await this.rlsContext.runWithUserContext(
          tenantId,
          mid,
          userId,
          async () => {
            return this.probeRowsetHasAnyRows(
              tenantId,
              userId,
              mid,
              targetDeName,
            );
          },
        );

        updatedData.rowProbeAttempts = (updatedData.rowProbeAttempts ?? 0) + 1;
        updatedData.rowProbeLastCheckedAt = new Date().toISOString();

        this.logger.debug(
          `Run ${runId}: Row probe #${updatedData.rowProbeAttempts} (elapsedMs=${elapsed}, count=${probeResult.count}, itemsLength=${probeResult.itemsLength}, hasRows=${probeResult.hasRows})`,
        );

        if (probeResult.hasRows) {
          this.logger.log(
            `Run ${runId}: Row probe found rows (count=${probeResult.count}, items=${probeResult.itemsLength}), marking ready (fast-path)`,
          );
          await this.markReady(tenantId, userId, mid, runId);
          await this.rlsContext.runWithUserContext(
            tenantId,
            mid,
            userId,
            async () => {
              await this.cleanupAssetsForPoll(
                tenantId,
                userId,
                mid,
                runId,
                queryDefinitionId,
              );
            },
          );
          return { status: "completed", runId };
        }
      }

      if (normalizedStatus === "complete") {
        return await this.handleCompletionWithRowsetCheck(job, token);
      }

      const hasCompletedDate =
        Boolean(pollResult.completedDate) &&
        pollResult.completedDate?.trim() !== "";

      const isRunningTriggerReason =
        elapsed >= POLL_CONFIG.STUCK_THRESHOLD_MS
          ? "stuck-threshold"
          : hasCompletedDate &&
              elapsed >= POLL_CONFIG.COMPLETED_DATE_TRIGGER_MIN_RUNTIME_MS
            ? "completed-date"
            : null;

      const shouldStartIsRunningChecks =
        Boolean(queryCustomerKey) &&
        (elapsed >= POLL_CONFIG.STUCK_THRESHOLD_MS ||
          (hasCompletedDate &&
            elapsed >= POLL_CONFIG.COMPLETED_DATE_TRIGGER_MIN_RUNTIME_MS));

      if (shouldStartIsRunningChecks) {
        this.logger.debug(
          `Run ${runId}: Starting REST isRunning checks (reason="${isRunningTriggerReason}", elapsedMs=${elapsed}, hasCompletedDate=${hasCompletedDate}, queryDefinitionIdPresent=${Boolean(queryDefinitionId)})`,
        );
        const checkResult = await this.rlsContext.runWithUserContext(
          tenantId,
          mid,
          userId,
          async () => {
            return this.checkIsRunningWithFallback(
              tenantId,
              userId,
              mid,
              queryDefinitionId,
              queryCustomerKey,
            );
          },
        );

        this.logger.debug(
          `Run ${runId}: REST isRunning result (isRunning=${checkResult.isRunning}, needsIdFallback=${checkResult.needsIdFallback}, queryDefinitionIdPresent=${Boolean(queryDefinitionId)})`,
        );

        if (checkResult.needsIdFallback && !queryDefinitionId) {
          this.logger.debug(
            `Run ${runId}: queryDefinitionId missing/invalid, retrieving via SOAP fallback (customerKey="${queryCustomerKey}")`,
          );
          const retrievedId = await this.rlsContext.runWithUserContext(
            tenantId,
            mid,
            userId,
            async () => {
              return this.runToTempFlow.retrieveQueryDefinitionObjectId(
                tenantId,
                userId,
                mid,
                queryCustomerKey,
              );
            },
          );

          if (retrievedId) {
            queryDefinitionId = retrievedId;
            updatedData.queryDefinitionId = retrievedId;

            await this.rlsContext.runWithUserContext(
              tenantId,
              mid,
              userId,
              async () => {
                await this.db
                  .update(shellQueryRuns)
                  .set({ queryDefinitionId: retrievedId })
                  .where(eq(shellQueryRuns.id, runId));
              },
            );

            this.logger.log(
              `Run ${runId}: Retrieved and persisted queryDefinitionId ${retrievedId} via SOAP fallback`,
            );
          } else {
            this.logger.debug(
              `Run ${runId}: SOAP fallback retrieveQueryDefinitionObjectId returned null`,
            );
          }
        }

        if (!checkResult.isRunning) {
          const now = new Date().toISOString();
          const currentConfirmations = updatedData.notRunningConfirmations ?? 0;
          const firstDetection = updatedData.notRunningDetectedAt;

          if (!firstDetection) {
            this.logger.log(
              `Run ${runId}: REST says not running (first detection)`,
            );
            updatedData.notRunningDetectedAt = now;
            updatedData.notRunningConfirmations = 1;
          } else {
            const firstDetectionTime = new Date(firstDetection).getTime();
            const gapMs = Date.now() - firstDetectionTime;

            if (gapMs >= POLL_CONFIG.NOT_RUNNING_CONFIRMATION_MIN_GAP_MS) {
              updatedData.notRunningConfirmations = currentConfirmations + 1;
              this.logger.log(
                `Run ${runId}: REST says not running (confirmation #${updatedData.notRunningConfirmations}, gap: ${gapMs}ms)`,
              );

              if (
                updatedData.notRunningConfirmations >=
                POLL_CONFIG.NOT_RUNNING_CONFIRMATIONS
              ) {
                this.logger.log(
                  `Run ${runId}: Not-running confirmed, proceeding to rowset readiness check`,
                );
                return await this.handleCompletionWithRowsetCheck(
                  { ...job, data: updatedData },
                  token,
                );
              }
            } else {
              this.logger.debug(
                `Run ${runId}: REST says not running but gap (${gapMs}ms) < minimum (${POLL_CONFIG.NOT_RUNNING_CONFIRMATION_MIN_GAP_MS}ms)`,
              );
            }
          }
        } else {
          if (
            updatedData.notRunningConfirmations &&
            updatedData.notRunningConfirmations > 0
          ) {
            this.logger.debug(
              `Run ${runId}: REST says running again, resetting not-running confirmations`,
            );
          }
          updatedData.notRunningDetectedAt = undefined;
          updatedData.notRunningConfirmations = 0;
        }
      } else if (hasCompletedDate && Boolean(queryCustomerKey)) {
        this.logger.debug(
          `Run ${runId}: CompletedDate present but skipping REST isRunning checks (elapsedMs=${elapsed}, minRuntimeMs=${POLL_CONFIG.COMPLETED_DATE_TRIGGER_MIN_RUNTIME_MS}, stuckThresholdMs=${POLL_CONFIG.STUCK_THRESHOLD_MS})`,
        );
      }

      updatedData.pollCount += 1;

      const delayMs = calculateNextDelay(updatedData.pollCount);

      this.logger.debug(
        `Run ${runId} poll #${updatedData.pollCount}: status="${pollResult.status}", completedDate="${pollResult.completedDate || ""}", next poll in ${delayMs}ms`,
      );

      await job.updateData(updatedData);

      if (this.testMode) {
        return { status: "polling", runId, pollCount: updatedData.pollCount };
      }

      if (!token) {
        throw new Error("Token required for moveToDelayed");
      }
      await job.moveToDelayed(Date.now() + delayMs, token);
      throw new DelayedError();
    } catch (error) {
      if (error instanceof DelayedError) {
        throw error;
      }

      const message =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";

      this.logger.warn(`Poll job ${job.id} attempt failed: ${message}`);

      if (isTerminal(error)) {
        throw new UnrecoverableError(message);
      }
      throw error;
    } finally {
      (this.metricsActiveJobs as { dec: () => void }).dec();
    }
  }

  private async handleCompletionWithRowsetCheck(
    job: Job<PollShellQueryJob> | { data: PollShellQueryJob },
    token?: string,
  ): Promise<unknown> {
    const { runId, tenantId, userId, mid, targetDeName, queryDefinitionId } =
      job.data;
    const currentAttempts = job.data.rowsetReadyAttempts ?? 0;

    if (!targetDeName) {
      this.logger.warn(
        `Run ${runId}: No targetDeName available, skipping rowset readiness check`,
      );
      await this.markReady(tenantId, userId, mid, runId);
      await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          await this.cleanupAssetsForPoll(
            tenantId,
            userId,
            mid,
            runId,
            queryDefinitionId,
          );
        },
      );
      return { status: "completed", runId };
    }

    const isReady = await this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        return this.checkRowsetReady(tenantId, userId, mid, targetDeName);
      },
    );

    if (isReady) {
      this.logger.log(`Run ${runId}: Rowset is ready, marking complete`);
      await this.markReady(tenantId, userId, mid, runId);
      await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          await this.cleanupAssetsForPoll(
            tenantId,
            userId,
            mid,
            runId,
            queryDefinitionId,
          );
        },
      );
      return { status: "completed", runId };
    }

    const nextAttempt = currentAttempts + 1;

    if (nextAttempt >= POLL_CONFIG.ROWSET_READY_MAX_ATTEMPTS) {
      const errorMessage = `Data Extension "${targetDeName}" not queryable after ${POLL_CONFIG.ROWSET_READY_MAX_ATTEMPTS} attempts`;
      this.logger.error(`Run ${runId}: ${errorMessage}`);
      await this.markFailed(tenantId, userId, mid, runId, errorMessage);
      await this.rlsContext.runWithUserContext(
        tenantId,
        mid,
        userId,
        async () => {
          await this.cleanupAssetsForPoll(
            tenantId,
            userId,
            mid,
            runId,
            queryDefinitionId,
          );
        },
      );
      return { status: "rowset-not-queryable", runId };
    }

    const delayMs = calculateRowsetReadyDelay(nextAttempt);
    this.logger.log(
      `Run ${runId}: Rowset not ready (attempt ${nextAttempt}/${POLL_CONFIG.ROWSET_READY_MAX_ATTEMPTS}), retrying in ${delayMs}ms`,
    );

    const updatedData: PollShellQueryJob = {
      ...job.data,
      rowsetReadyAttempts: nextAttempt,
      rowsetReadyDetectedAt:
        job.data.rowsetReadyDetectedAt ?? new Date().toISOString(),
    };

    if ("updateData" in job && typeof job.updateData === "function") {
      await job.updateData(updatedData);

      if (this.testMode) {
        return { status: "rowset-checking", runId, attempt: nextAttempt };
      }

      if (!token) {
        throw new Error("Token required for moveToDelayed");
      }
      await (job as Job<PollShellQueryJob>).moveToDelayed(
        Date.now() + delayMs,
        token,
      );
      throw new DelayedError();
    }

    return { status: "rowset-checking", runId, attempt: nextAttempt };
  }

  private async checkRowsetReady(
    tenantId: string,
    userId: string,
    mid: string,
    deName: string,
  ): Promise<boolean> {
    try {
      await this.restDataService.getRowset(tenantId, userId, mid, deName, 1, 1);

      return true;
    } catch (error) {
      if (isUnrecoverable(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.debug(
        `Rowset readiness check failed for "${deName}": ${message}`,
      );
      return false;
    }
  }

  private async probeRowsetHasAnyRows(
    tenantId: string,
    userId: string,
    mid: string,
    deName: string,
  ): Promise<RowProbeResult> {
    try {
      const response: RowsetResponse = await this.restDataService.getRowset(
        tenantId,
        userId,
        mid,
        deName,
        1,
        POLL_CONFIG.ROW_PROBE_PAGE_SIZE,
      );

      const count = response.count ?? 0;
      const itemsLength = response.items?.length ?? 0;
      const hasRows = count > 0 || itemsLength > 0;

      return { hasRows, count, itemsLength };
    } catch (error) {
      if (isUnrecoverable(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.debug(`Row probe failed for "${deName}": ${message}`);
      return { hasRows: false };
    }
  }

  private async checkIsRunningWithFallback(
    tenantId: string,
    userId: string,
    mid: string,
    queryDefinitionId: string,
    queryCustomerKey: string,
  ): Promise<IsRunningCheckResult> {
    const candidates: Array<{
      kind: "definitionId" | "customerKey";
      value: string;
    }> = [];
    const trimmedDefinitionId = queryDefinitionId?.trim();
    if (trimmedDefinitionId) {
      candidates.push({ kind: "definitionId", value: trimmedDefinitionId });
    }
    const trimmedCustomerKey = queryCustomerKey?.trim();
    if (trimmedCustomerKey) {
      candidates.push({ kind: "customerKey", value: trimmedCustomerKey });
    }

    if (candidates.length === 0) {
      return { isRunning: true, needsIdFallback: true };
    }

    for (const candidate of candidates) {
      try {
        const response: IsRunningResponse =
          await this.restDataService.checkIsRunning(
            tenantId,
            userId,
            mid,
            candidate.value,
          );

        return {
          isRunning: response.isRunning === true,
          needsIdFallback: false,
        };
      } catch (error) {
        if (isUnrecoverable(error)) {
          throw error;
        }

        if (
          error instanceof AppError &&
          error.code === ErrorCode.MCE_BAD_REQUEST
        ) {
          this.logger.debug(
            `REST isRunning check failed with 400 using ${candidate.kind}="${candidate.value}"`,
          );
          continue;
        }

        const message =
          error instanceof Error ? error.message : "Unknown error";
        this.logger.warn(
          `REST isRunning check failed using ${candidate.kind}="${candidate.value}": ${message}`,
        );
        return { isRunning: true, needsIdFallback: false };
      }
    }

    return { isRunning: true, needsIdFallback: true };
  }

  private async markReady(
    tenantId: string,
    userId: string,
    mid: string,
    runId: string,
  ) {
    this.logger.log(`Run ${runId} completed successfully`);
    await this.publishStatusEvent(runId, "fetching_results");
    await this.updateStatus(tenantId, userId, mid, runId, "ready", {
      completedAt: new Date(),
    });
    await this.publishStatusEvent(runId, "ready");
    (
      this.metricsJobsTotal as { inc: (labels: { status: string }) => void }
    ).inc({ status: "ready" });
  }

  private async markFailed(
    tenantId: string,
    userId: string,
    mid: string,
    runId: string,
    errorMessage: string,
  ) {
    this.logger.error(`Run ${runId} failed: ${errorMessage}`);
    await this.updateStatus(tenantId, userId, mid, runId, "failed", {
      errorMessage,
      completedAt: new Date(),
    });
    await this.publishStatusEvent(runId, "failed", errorMessage);
    (
      this.metricsJobsTotal as { inc: (labels: { status: string }) => void }
    ).inc({ status: "failed" });
  }

  private async publishStatusEvent(
    runId: string,
    status: RunStatus,
    errorMessage?: string,
  ) {
    // eslint-disable-next-line security/detect-object-injection
    const statusMessage = STATUS_MESSAGES[status];
    const event: SSEEvent = {
      status,
      message:
        status === "failed" && errorMessage
          ? `${statusMessage}: ${errorMessage}`
          : statusMessage,
      timestamp: new Date().toISOString(),
      runId,
    };

    if (errorMessage) {
      event.errorMessage = errorMessage;
    }

    const channel = `run-status:${runId}`;
    const lastEventKey = `run-status:last:${runId}`;
    const eventJson = JSON.stringify(event);

    const redisClient = this.redis as {
      publish: (channel: string, message: string) => Promise<void>;
      set: (
        key: string,
        value: string,
        mode: string,
        duration: number,
      ) => Promise<void>;
    };

    await Promise.all([
      redisClient.publish(channel, eventJson),
      redisClient.set(lastEventKey, eventJson, "EX", LAST_EVENT_TTL_SECONDS),
    ]);
  }

  private async updateStatus(
    tenantId: string,
    userId: string,
    mid: string,
    runId: string,
    status: ShellQueryRunStatus,
    extra: Record<string, unknown> = {},
  ) {
    await this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        await this.db
          .update(shellQueryRuns)
          .set({ status, ...extra })
          .where(eq(shellQueryRuns.id, runId));
      },
    );
  }

  private async cleanupAssetsForPoll(
    tenantId: string,
    userId: string,
    mid: string,
    runId: string,
    queryDefinitionId?: string,
  ) {
    const queryKey = buildQueryCustomerKey(runId);

    this.logger.log(`Attempting cleanup for run ${runId}`);

    try {
      let objectId = queryDefinitionId;

      if (!objectId) {
        const retrieveResult =
          await this.runToTempFlow.retrieveQueryDefinitionObjectId(
            tenantId,
            userId,
            mid,
            queryKey,
          );
        objectId = retrieveResult ?? undefined;
      }

      if (!objectId) {
        this.logger.log(
          `No QueryDefinition found for run ${runId}, skipping cleanup`,
        );
        return;
      }

      await this.mceBridge.soapRequest(
        tenantId,
        userId,
        mid,
        buildDeleteQueryDefinition(objectId),
        "Delete",
      );
      this.logger.log(`Successfully deleted QueryDefinition for run ${runId}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      this.logger.warn(`Cleanup failed for ${runId}: ${message}`);
    }
  }
}
