import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { savedQueries } from "../schema";

describe("savedQueries table schema", () => {
  const config = getTableConfig(savedQueries);

  it("has the correct table name", () => {
    expect(config.name).toBe("saved_queries");
  });

  it("has link columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toContain("linked_qa_object_id");
    expect(columnNames).toContain("linked_qa_customer_key");
    expect(columnNames).toContain("linked_qa_name");
    expect(columnNames).toContain("linked_at");
  });

  it("has a partial unique index on linked_qa_customer_key", () => {
    const uniqueIdx = config.indexes.find(
      (idx) => idx.config.name === "saved_queries_linked_qa_unique",
    );
    expect(uniqueIdx).toBeDefined();

    const idx = uniqueIdx as NonNullable<typeof uniqueIdx>;
    expect(idx.config.unique).toBe(true);

    const indexedColumns = idx.config.columns.map(
      (c) => (c as { name?: string }).name,
    );
    expect(indexedColumns).toEqual([
      "tenant_id",
      "mid",
      "linked_qa_customer_key",
    ]);
  });
});
