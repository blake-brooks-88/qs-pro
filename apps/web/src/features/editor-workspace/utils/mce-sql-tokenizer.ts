import type { languages } from "monaco-editor";
import {
  MCE_SQL_KEYWORDS,
  MCE_SQL_SUPPORTED_FUNCTIONS,
  MCE_SQL_DATA_TYPES,
} from "@/constants/mce-sql";

const keywordsArray = Array.from(MCE_SQL_KEYWORDS);
const functionsArray = Array.from(MCE_SQL_SUPPORTED_FUNCTIONS);
const dataTypesArray = Array.from(MCE_SQL_DATA_TYPES);

export const mceSqlTokenizerDef: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".sql",
  ignoreCase: true,

  keywords: keywordsArray,
  functions: functionsArray,
  dataTypes: dataTypesArray,

  operators: [
    "=",
    "!=",
    "<>",
    "<",
    ">",
    "<=",
    ">=",
    "+",
    "-",
    "*",
    "/",
    "%",
    "||",
  ],

  brackets: [
    { open: "(", close: ")", token: "delimiter.parenthesis" },
  ],

  tokenizer: {
    root: [
      // Whitespace
      { include: "@whitespace" },

      // Line comments
      [/--.*$/, "comment"],

      // Block comments
      [/\/\*/, "comment", "@comment"],

      // Strings (single quotes with '' escape)
      [/'/, "string", "@string"],

      // Double-quoted identifiers (not strings)
      [/"/, "identifier.quote", "@quotedIdentifier"],

      // Bracketed identifiers
      [/\[/, "identifier.bracket", "@bracketIdentifier"],

      // Numbers
      [/\d+(\.\d+)?/, "number"],
      [/\.\d+/, "number"],

      // Operators
      [/[<>=!]+/, "operator"],
      [/[+\-*/%]/, "operator"],

      // Punctuation
      [/[;,.]/, "delimiter"],
      [/[()]/, "@brackets"],

      // Identifiers, keywords, and functions
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            "@keywords": "keyword",
            "@functions": "predefined",
            "@dataTypes": "type",
            "@default": "identifier",
          },
        },
      ],
    ],

    whitespace: [[/\s+/, "white"]],

    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],

    string: [
      [/[^']+/, "string"],
      [/''/, "string.escape"],
      [/'/, "string", "@pop"],
    ],

    quotedIdentifier: [
      [/[^"]+/, "identifier.quote"],
      [/""/, "identifier.quote.escape"],
      [/"/, "identifier.quote", "@pop"],
    ],

    bracketIdentifier: [
      [/[^\]]+/, "identifier.bracket"],
      [/\]\]/, "identifier.bracket.escape"],
      [/\]/, "identifier.bracket", "@pop"],
    ],
  },
};

export function registerMceSqlTokenizer(
  monaco: typeof import("monaco-editor"),
): void {
  monaco.languages.setMonarchTokensProvider("sql", mceSqlTokenizerDef);
}
