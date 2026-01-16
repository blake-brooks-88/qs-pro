import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { MceBridgeService, RlsContextService } from "@qs-pro/backend-shared";
import { eq, shellQueryRuns } from "@qs-pro/database";
import { Job, UnrecoverableError } from "bullmq";
import * as crypto from "crypto";

import {
  RunStatus,
  ShellQueryJob,
  SoapAsyncStatusResponse,
  SSEEvent,
  STATUS_MESSAGES,
} from "./shell-query.types";
import { RunToTempFlow } from "./strategies/run-to-temp.strategy";

@Processor("shell-query", { concurrency: 50, lockDuration: 120000 })
export class ShellQueryProcessor extends WorkerHost {
  private readonly logger = new Logger(ShellQueryProcessor.name);
  private pollingDelayMultiplier = process.env.NODE_ENV === "test" ? 0 : 1;

  constructor(
    private readonly runToTempFlow: RunToTempFlow,
    private readonly rlsContext: RlsContextService,
    private readonly mceBridge: MceBridgeService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject("DATABASE") private readonly db: any,
    @Inject("REDIS_CLIENT") private readonly redis: unknown,
    @Inject("METRICS_JOBS_TOTAL") private readonly metricsJobsTotal: unknown,
    @Inject("METRICS_DURATION") private readonly metricsDuration: unknown,
    @Inject("METRICS_FAILURES_TOTAL")
    private readonly metricsFailuresTotal: unknown,
    @Inject("METRICS_ACTIVE_JOBS") private readonly metricsActiveJobs: unknown,
  ) {
    super();
  }

  setPollingDelayMultiplier(multiplier: number) {
    this.pollingDelayMultiplier = multiplier;
  }

  async process(job: Job<ShellQueryJob>): Promise<unknown> {
    const { runId, tenantId, mid, sqlText } = job.data;
    const startTime = Date.now();
    const sqlTextHash = crypto
      .createHash("sha256")
      .update(sqlText || "")
      .digest("hex");

    this.logger.log(
      {
        message: `Processing shell query job ${job.id}`,
        tenantId,
        runId,
        status: "running",
        sqlTextHash,
        timestamp: new Date().toISOString(),
      },
      "ShellQueryProcessor",
    );

    (this.metricsActiveJobs as { inc: () => void }).inc();

    try {
      await this.updateStatus(tenantId, mid, runId, "queued", {
        startedAt: new Date(),
      });
      await this.publishStatusEvent(runId, "queued");

      const publishStatus = async (status: RunStatus): Promise<void> => {
        await this.publishStatusEvent(runId, status);
      };

      const result = await this.rlsContext.runWithTenantContext(
        tenantId,
        mid,
        async () => {
          return await this.runToTempFlow.execute(job.data, publishStatus);
        },
      );

      if (result.taskId) {
        await this.pollStatus(job, result.taskId);
      } else {
        throw new Error("No TaskID returned from flow execution");
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(
        {
          message: `Run ${runId} completed successfully`,
          tenantId,
          runId,
          status: "ready",
          durationMs,
          timestamp: new Date().toISOString(),
        },
        "ShellQueryProcessor",
      );

      (
        this.metricsJobsTotal as { inc: (labels: { status: string }) => void }
      ).inc({ status: "ready" });
      return { status: "completed", runId };
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const err = error as {
        message?: string;
        stack?: string;
        status?: number;
      };
      this.logger.error(
        {
          message: `Job ${job.id} failed: ${err.message || "Unknown error"}`,
          tenantId,
          runId,
          status: "failed",
          durationMs,
          error: err.message || "Unknown error",
          stack: err.stack,
          timestamp: new Date().toISOString(),
        },
        err.stack,
        "ShellQueryProcessor",
      );

      (
        this.metricsJobsTotal as { inc: (labels: { status: string }) => void }
      ).inc({ status: "failed" });
      (
        this.metricsFailuresTotal as {
          inc: (labels: { error_type: string }) => void;
        }
      ).inc({ error_type: err.status?.toString() || "unknown" });

      const isTerminal = this.isTerminalError(error);

      await this.updateStatus(tenantId, mid, runId, "failed", {
        errorMessage: err.message || "Unknown error",
        completedAt: new Date(),
      });
      await this.publishStatusEvent(
        runId,
        "failed",
        err.message || "Unknown error",
      );

      if (isTerminal) {
        throw new UnrecoverableError(err.message || "Unknown error");
      }
      throw error;
    } finally {
      const duration = (Date.now() - startTime) / 1000;
      (this.metricsDuration as { observe: (duration: number) => void }).observe(
        duration,
      );
      (this.metricsActiveJobs as { dec: () => void }).dec();
      await this.cleanupAssets(job.data);
    }
  }

  private isTerminalError(error: unknown): boolean {
    const err = error as { terminal?: boolean; status?: number };
    if (err.terminal) {
      return true;
    }

    if (err.status) {
      return [400, 401, 403].includes(err.status);
    }

    return false;
  }

  private async pollStatus(job: Job<ShellQueryJob>, taskId: string) {
    const { runId, tenantId, userId, mid } = job.data;
    const maxDurationMs = 29 * 60 * 1000;
    const startTime = Date.now();

    let delay = 2000;
    const maxDelay = 30000;

    while (Date.now() - startTime < maxDurationMs) {
      const currentRun = await this.db
        .select()
        .from(shellQueryRuns)
        .where(eq(shellQueryRuns.id, runId));
      if (currentRun[0]?.status === "canceled") {
        this.logger.log(`Run ${runId} was canceled, stopping polling.`);
        await this.publishStatusEvent(runId, "canceled");
        return;
      }

      const soap = `
        <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
           <RetrieveRequest>
              <ObjectType>AsyncActivityStatus</ObjectType>
              <Properties>Status</Properties>
              <Properties>ErrorMsg</Properties>
              <Properties>CompletedDate</Properties>
              <Filter xsi:type="SimpleFilterPart">
                 <Property>TaskID</Property>
                 <SimpleOperator>equals</SimpleOperator>
                 <Value>${taskId}</Value>
              </Filter>
           </RetrieveRequest>
        </RetrieveRequestMsg>`;

      try {
        const response =
          await this.mceBridge.soapRequest<SoapAsyncStatusResponse>(
            tenantId,
            userId,
            mid,
            soap,
            "Retrieve",
          );
        const result = response.Body?.RetrieveResponseMsg?.Results;
        const status = result?.Status;

        if (status === "Complete") {
          this.logger.log(`Run ${runId} completed successfully.`);
          await this.publishStatusEvent(runId, "fetching_results");
          await this.updateStatus(tenantId, mid, runId, "ready", {
            completedAt: new Date(),
          });
          await this.publishStatusEvent(runId, "ready");
          return;
        } else if (status === "Error") {
          const errorMsg = result?.ErrorMsg || "MCE Query Execution Error";
          const error = new Error(errorMsg) as Error & { terminal: boolean };
          error.terminal = true;
          throw error;
        }

        this.logger.debug(
          `Run ${runId} status: ${status || "Processing"}. Next poll in ${delay}ms`,
        );
      } catch (e: unknown) {
        const err = e as { terminal?: boolean; message?: string };
        if (err.terminal) {
          throw e;
        }
        this.logger.warn(
          `Polling error for ${runId}: ${err.message || "Unknown error"}`,
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, delay * this.pollingDelayMultiplier),
      );
      delay = Math.min(delay * 2, maxDelay);
    }

    throw new Error("Query timed out after 29 minutes");
  }

  private async publishStatusEvent(
    runId: string,
    status: RunStatus,
    errorMessage?: string,
  ) {
    const event: SSEEvent = {
      status,
      message:
        status === "failed" && errorMessage
          ? `${STATUS_MESSAGES[status]}: ${errorMessage}`
          : STATUS_MESSAGES[status],
      timestamp: new Date().toISOString(),
      runId,
    };

    if (errorMessage) {
      event.errorMessage = errorMessage;
    }

    const channel = `run-status:${runId}`;
    await (
      this.redis as {
        publish: (channel: string, message: string) => Promise<void>;
      }
    ).publish(channel, JSON.stringify(event));
  }

  private async updateStatus(
    tenantId: string,
    mid: string,
    runId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ) {
    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      await this.db
        .update(shellQueryRuns)
        .set({ status, ...extra })
        .where(eq(shellQueryRuns.id, runId));
    });
  }

  private async cleanupAssets(jobData: ShellQueryJob) {
    const { tenantId, userId, mid, runId } = jobData;
    const queryKey = `QPP_Query_${runId}`;

    this.logger.log(`Attempting cleanup for run ${runId}`);

    const deleteSoap = (type: string, key: string) => `
      <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="${type}">
            <CustomerKey>${key}</CustomerKey>
         </Objects>
      </DeleteRequest>`;

    try {
      await this.mceBridge.soapRequest(
        tenantId,
        userId,
        mid,
        deleteSoap("QueryDefinition", queryKey),
        "Delete",
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.logger.warn(
        `Cleanup failed for ${runId}: ${err.message || "Unknown error"}`,
      );
    }
  }
}
