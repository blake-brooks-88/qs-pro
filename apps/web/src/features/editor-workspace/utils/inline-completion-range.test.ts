import { describe, expect, test } from "vitest";
import { getInlineCompletionReplacementEndOffset } from "./inline-completion-range";

describe("getInlineCompletionReplacementEndOffset", () => {
  test("replacesAutoClosedBracket_WhenInsertStartsWithClosingBracket", () => {
    const sql = "SELECT * FROM [Orders]";
    const cursorIndex = sql.length - 1; // before the auto-closed `]`
    const insertText = "] AS o";
    expect(
      getInlineCompletionReplacementEndOffset(sql, cursorIndex, insertText),
    ).toBe(cursorIndex + 1);
  });

  test("doesNotReplace_WhenNextCharIsNotClosingBracket", () => {
    const sql = "SELECT * FROM [Orders";
    const cursorIndex = sql.length;
    const insertText = "] AS o";
    expect(
      getInlineCompletionReplacementEndOffset(sql, cursorIndex, insertText),
    ).toBe(cursorIndex);
  });

  test("doesNotReplace_WhenInsertDoesNotStartWithClosingBracket", () => {
    const sql = "SELECT * FROM [Orders]";
    const cursorIndex = sql.length - 1;
    const insertText = " AS o";
    expect(
      getInlineCompletionReplacementEndOffset(sql, cursorIndex, insertText),
    ).toBe(cursorIndex);
  });
});
