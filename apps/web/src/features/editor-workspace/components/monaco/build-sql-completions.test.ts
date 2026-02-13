import { describe, expect, it, vi } from "vitest";

import type {
  DataExtension,
  DataExtensionField,
} from "@/features/editor-workspace/types";

import { buildSqlCompletions } from "./build-sql-completions";

const parseCursor = (sqlWithCursor: string) => {
  const cursorIndex = sqlWithCursor.indexOf("|");
  if (cursorIndex === -1) {
    throw new Error("Cursor marker not found");
  }
  return {
    text:
      sqlWithCursor.slice(0, cursorIndex) +
      sqlWithCursor.slice(cursorIndex + 1),
    cursorIndex,
  };
};

const getWordRange = (text: string, cursorIndex: number) => {
  let startOffset = cursorIndex;
  while (startOffset > 0 && /[A-Za-z0-9_]/.test(text.charAt(startOffset - 1))) {
    startOffset -= 1;
  }
  return { startOffset, endOffset: cursorIndex };
};

describe("buildSqlCompletions", () => {
  const sharedFolderId = "shared-folder";

  const dataExtensions: DataExtension[] = [
    {
      id: "de-1",
      name: "Customers",
      customerKey: "Customers",
      folderId: "private-folder",
      description: "",
      fields: [],
      isShared: false,
    },
    {
      id: "de-2",
      name: "SharedDE",
      customerKey: "SharedDE",
      folderId: sharedFolderId,
      description: "",
      fields: [],
      isShared: true,
    },
  ];

  const resolveDataExtension = (name: string) =>
    dataExtensions.find((de) => de.name.toLowerCase() === name.toLowerCase());

  it("returns no suggestions when cursor is inside a string literal", async () => {
    const { text, cursorIndex } = parseCursor(
      "SELECT 'te|st' FROM [Customers]",
    );

    const result = await buildSqlCompletions({
      text,
      cursorIndex,
      triggerCharacter: undefined,
      isExplicitTrigger: true,
      bracketRange: {
        startOffset: cursorIndex,
        endOffset: cursorIndex,
        inBracket: false,
        hasClosingBracket: false,
      },
      wordRange: getWordRange(text, cursorIndex),
      resolveDataExtension,
      fetchFields: async () => [],
      getFieldsCount: async () => null,
      hasTenant: () => true,
      dataExtensions,
      sharedFolderIds: new Set([sharedFolderId]),
    });

    expect(result).toEqual([]);
  });

  it("suggests fields for alias-before-dot and replaces only after the dot", async () => {
    const { text, cursorIndex } = parseCursor("SELECT a.| FROM [Customers] a");

    const fetchFields = vi.fn(async () => [
      {
        name: "Email",
        type: "EmailAddress",
        isPrimaryKey: false,
        isNullable: true,
      } satisfies DataExtensionField,
    ]);

    const result = await buildSqlCompletions({
      text,
      cursorIndex,
      triggerCharacter: ".",
      isExplicitTrigger: false,
      bracketRange: {
        startOffset: cursorIndex,
        endOffset: cursorIndex,
        inBracket: false,
        hasClosingBracket: false,
      },
      wordRange: getWordRange(text, cursorIndex),
      resolveDataExtension,
      fetchFields,
      getFieldsCount: async () => null,
      hasTenant: () => true,
      dataExtensions,
      sharedFolderIds: new Set([sharedFolderId]),
    });

    expect(fetchFields).toHaveBeenCalledTimes(1);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.kind === "field")).toBe(true);

    const dotOffset = text.indexOf(".", text.indexOf("a."));
    expect(dotOffset).toBeGreaterThan(0);
    expect(result.at(0)?.replaceOffsets.startOffset).toBe(dotOffset + 1);
    expect(result.at(0)?.replaceOffsets.endOffset).toBe(cursorIndex);
    expect(result.at(0)?.insertText).toBe("Email");
  });

  it("suggests data extensions after FROM when inside brackets", async () => {
    const { text, cursorIndex } = parseCursor("SELECT * FROM [|");

    const result = await buildSqlCompletions({
      text,
      cursorIndex,
      triggerCharacter: "[",
      isExplicitTrigger: false,
      bracketRange: {
        startOffset: cursorIndex,
        endOffset: cursorIndex,
        inBracket: true,
        hasClosingBracket: false,
      },
      wordRange: getWordRange(text, cursorIndex),
      resolveDataExtension,
      fetchFields: async () => [],
      getFieldsCount: async () => 3,
      hasTenant: () => true,
      dataExtensions,
      sharedFolderIds: new Set([sharedFolderId]),
    });

    const shared = result.find((item) => item.insertText === "ENT.[SharedDE]");
    expect(shared).toBeDefined();
    expect(shared?.kind).toBe("table");
    expect(shared?.replaceOffsets.startOffset).toBe(cursorIndex - 1);

    const normal = result.find((item) => item.insertText === "Customers");
    expect(normal).toBeDefined();
    expect(normal?.kind).toBe("table");
    expect(normal?.replaceOffsets.startOffset).toBe(cursorIndex);

    const keywords = result.filter((item) => item.kind === "keyword");
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.every((k) => k.sortText?.startsWith("9-") ?? false)).toBe(
      true,
    );
  });

  it("expands asterisk when explicitly triggered on SELECT *", async () => {
    const { text, cursorIndex } = parseCursor("SELECT *| FROM [Customers] c");

    const fetchFields = vi.fn(async () => [
      {
        name: "Email",
        type: "EmailAddress",
        isPrimaryKey: true,
        isNullable: false,
      } satisfies DataExtensionField,
      {
        name: "First Name",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
      } satisfies DataExtensionField,
    ]);

    const result = await buildSqlCompletions({
      text,
      cursorIndex,
      triggerCharacter: undefined,
      isExplicitTrigger: true,
      bracketRange: {
        startOffset: cursorIndex,
        endOffset: cursorIndex,
        inBracket: false,
        hasClosingBracket: false,
      },
      wordRange: getWordRange(text, cursorIndex),
      resolveDataExtension,
      fetchFields,
      getFieldsCount: async () => null,
      hasTenant: () => true,
      dataExtensions,
      sharedFolderIds: new Set([sharedFolderId]),
    });

    expect(fetchFields).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result.at(0)?.kind).toBe("snippet");
    expect(result.at(0)?.insertText).toContain("c.Email");
  });
});
