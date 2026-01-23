/**
 * BullMQ job wrapper factories
 * Consolidated from: apps/worker/test/factories/index.ts
 */

import { vi } from "vitest";

import { getNextBullJobId } from "../setup/reset";
import type { PollShellQueryJob, ShellQueryJob } from "./shell-query.factory";
import { createMockJob, createMockPollJobData } from "./shell-query.factory";

/** Mock BullMQ Job interface matching real Job<T> structure */
export interface MockBullJob<T> {
  id: string;
  name: string;
  data: T;
  opts: { attempts: number };
  attemptsMade: number;
  isPaused: ReturnType<typeof vi.fn>;
  isActive: ReturnType<typeof vi.fn>;
  updateData: ReturnType<typeof vi.fn>;
  moveToDelayed: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock BullMQ job wrapper for shell query execution
 * @param data - Partial shell query job data to merge with defaults
 * @param name - Job name (default: 'execute-shell-query')
 */
export function createMockBullJob(
  data: Partial<ShellQueryJob> = {},
  name = "execute-shell-query",
): MockBullJob<ShellQueryJob> {
  const id = getNextBullJobId();
  return {
    id: String(id),
    name,
    data: createMockJob(data),
    opts: { attempts: 1 },
    attemptsMade: 1,
    isPaused: vi.fn().mockResolvedValue(false),
    isActive: vi.fn().mockResolvedValue(true),
    updateData: vi.fn().mockResolvedValue(undefined),
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock BullMQ job wrapper for poll-shell-query queue
 * @param data - Partial poll job data to merge with defaults
 */
export function createMockPollBullJob(
  data: Partial<PollShellQueryJob> = {},
): MockBullJob<PollShellQueryJob> {
  const id = getNextBullJobId();
  return {
    id: `poll-${id}`,
    name: "poll-shell-query",
    data: createMockPollJobData(data),
    opts: { attempts: 1 },
    attemptsMade: 1,
    isPaused: vi.fn().mockResolvedValue(false),
    isActive: vi.fn().mockResolvedValue(true),
    updateData: vi.fn().mockResolvedValue(undefined),
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}
