import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";

import { AuditRetentionModule } from "../audit-retention.module";
import { AuditRetentionSweeper } from "../audit-retention.sweeper";

const dbStub = { execute: vi.fn() };

@Global()
@Module({
  providers: [{ provide: "DATABASE", useValue: dbStub }],
  exports: ["DATABASE"],
})
class StubDatabaseModule {}

describe("AuditRetentionModule", () => {
  it("compiles with DATABASE provider stubbed", async () => {
    const module = await Test.createTestingModule({
      imports: [StubDatabaseModule, AuditRetentionModule],
    }).compile();

    expect(module).toBeDefined();
  });

  it("provides AuditRetentionSweeper", async () => {
    const module = await Test.createTestingModule({
      imports: [StubDatabaseModule, AuditRetentionModule],
    }).compile();

    expect(module.get(AuditRetentionSweeper)).toBeInstanceOf(
      AuditRetentionSweeper,
    );
  });
});
