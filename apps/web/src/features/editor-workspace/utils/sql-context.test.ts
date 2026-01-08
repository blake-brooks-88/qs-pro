import { describe, expect, test } from "vitest";
import { getSqlCursorContext } from "./sql-context";

describe("getSqlCursorContext - characterization tests", () => {
  // 1. Test that lastKeyword is "on" after ON keyword
  test("lastKeyword_AfterOnKeyword_ReturnsOn", () => {
    const sql = "SELECT * FROM [A] a JOIN [B] b ON ";
    const context = getSqlCursorContext(sql, sql.length);
    expect(context.lastKeyword).toBe("on");
  });

  // 2. Test that currentWord is empty when cursor after space
  test("currentWord_AfterSpace_ReturnsEmpty", () => {
    const sql = "SELECT * FROM [A] a JOIN [B] b ON ";
    const context = getSqlCursorContext(sql, sql.length);
    expect(context.currentWord).toBe("");
  });

  // 3. Test that tablesInScope has 2 tables after JOIN
  test("tablesInScope_AfterJoin_HasTwoTables", () => {
    const sql = "SELECT * FROM [A] a JOIN [B] b ON ";
    const context = getSqlCursorContext(sql, sql.length);
    expect(context.tablesInScope).toHaveLength(2);
  });

  // 4. Test that ENT. prefix is NOT treated as an alias
  test("aliasBeforeDot_WithEntPrefix_ReturnsNull", () => {
    const sql = "SELECT * FROM ENT.";
    const context = getSqlCursorContext(sql, sql.length);
    // ENT. is the shared folder prefix, not an alias
    expect(context.aliasBeforeDot).toBeNull();
  });

  // 5. Test isAfterFromJoin detection
  test("isAfterFromJoin_AfterJoinKeyword_ReturnsTrue", () => {
    const sql = "SELECT * FROM [A] JOIN ";
    const context = getSqlCursorContext(sql, sql.length);
    expect(context.isAfterFromJoin).toBe(true);
  });
});

describe("getSqlCursorContext - ENT. prefix edge cases", () => {
  test("aliasBeforeDot_WithEntLowercase_ReturnsNull", () => {
    // Also handle lowercase ent.
    const sql = "SELECT * FROM ent.";
    const context = getSqlCursorContext(sql, sql.length);
    expect(context.aliasBeforeDot).toBeNull();
  });

  test("aliasBeforeDot_WithEntTableAlias_ReturnsAlias", () => {
    // Verify that real aliases still work when using ENT tables
    const sql = "SELECT e. FROM ENT.[Table] e";
    const cursorIndex = sql.indexOf("e.") + 2;
    const context = getSqlCursorContext(sql, cursorIndex);
    expect(context.aliasBeforeDot).toBe("e");
  });
});
