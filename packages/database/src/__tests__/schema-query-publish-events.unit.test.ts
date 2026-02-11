import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { queryPublishEvents } from "../schema";

describe("queryPublishEvents table schema", () => {
  const config = getTableConfig(queryPublishEvents);

  it("has the correct table name", () => {
    expect(config.name).toBe("query_publish_events");
  });

  it("has all required columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("saved_query_id");
    expect(columnNames).toContain("version_id");
    expect(columnNames).toContain("tenant_id");
    expect(columnNames).toContain("mid");
    expect(columnNames).toContain("user_id");
    expect(columnNames).toContain("linked_qa_customer_key");
    expect(columnNames).toContain("published_sql_hash");
    expect(columnNames).toContain("created_at");
  });

  it("has an index on saved_query_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "query_publish_events_saved_query_id_idx",
    );
    expect(idx).toBeDefined();

    const resolved = idx as NonNullable<typeof idx>;
    const columns = resolved.config.columns.map(
      (c) => (c as { name?: string }).name,
    );
    expect(columns).toEqual(["saved_query_id"]);
  });

  it("has an index on version_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "query_publish_events_version_id_idx",
    );
    expect(idx).toBeDefined();

    const resolved = idx as NonNullable<typeof idx>;
    const columns = resolved.config.columns.map(
      (c) => (c as { name?: string }).name,
    );
    expect(columns).toEqual(["version_id"]);
  });

  it("has an index on tenant_id", () => {
    const idx = config.indexes.find(
      (i) => i.config.name === "query_publish_events_tenant_id_idx",
    );
    expect(idx).toBeDefined();

    const resolved = idx as NonNullable<typeof idx>;
    const columns = resolved.config.columns.map(
      (c) => (c as { name?: string }).name,
    );
    expect(columns).toEqual(["tenant_id"]);
  });
});
