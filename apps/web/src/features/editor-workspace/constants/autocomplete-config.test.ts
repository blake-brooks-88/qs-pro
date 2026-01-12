import { describe, it, expect } from "vitest";
import {
  SFMC_IDENTITY_FIELDS,
  IDENTITY_FIELD_PATTERNS,
  IMMEDIATE_TRIGGER_CHARS,
  MIN_TRIGGER_CHARS,
  MAX_SUGGESTIONS,
  GHOST_TEXT_DEBOUNCE,
  DROPDOWN_CLOSE_CHARS,
  NO_TRIGGER_CHARS,
} from "./autocomplete-config";

describe("AutocompleteConfig", () => {
  describe("SFMC_IDENTITY_FIELDS_Array_ContainsExpectedFields", () => {
    it("should contain ContactID", () => {
      expect(SFMC_IDENTITY_FIELDS).toContain("ContactID");
    });

    it("should contain SubscriberKey", () => {
      expect(SFMC_IDENTITY_FIELDS).toContain("SubscriberKey");
    });

    it("should contain _ContactKey", () => {
      expect(SFMC_IDENTITY_FIELDS).toContain("_ContactKey");
    });

    it("should contain PersonContactId", () => {
      expect(SFMC_IDENTITY_FIELDS).toContain("PersonContactId");
    });

    it("should contain LeadId", () => {
      expect(SFMC_IDENTITY_FIELDS).toContain("LeadId");
    });

    it("should contain EmailAddress", () => {
      expect(SFMC_IDENTITY_FIELDS).toContain("EmailAddress");
    });

    it("should have exactly 8 identity fields", () => {
      expect(SFMC_IDENTITY_FIELDS).toHaveLength(8);
    });
  });

  describe("IDENTITY_FIELD_PATTERNS_RegexMatching_CaseInsensitive", () => {
    it("should match ContactID in any case", () => {
      const testCases = ["ContactID", "contactid", "CONTACTID", "CoNtAcTiD"];

      testCases.forEach((testCase) => {
        const matches = IDENTITY_FIELD_PATTERNS.some((pattern) =>
          pattern.test(testCase),
        );
        expect(matches).toBe(true);
      });
    });

    it("should match SubscriberKey in any case", () => {
      const testCases = [
        "SubscriberKey",
        "subscriberkey",
        "SUBSCRIBERKEY",
        "SuBsCrIbErKeY",
      ];

      testCases.forEach((testCase) => {
        const matches = IDENTITY_FIELD_PATTERNS.some((pattern) =>
          pattern.test(testCase),
        );
        expect(matches).toBe(true);
      });
    });

    it("should not match partial field names", () => {
      const testCases = ["Contact", "Subscriber", "ContactID123", "Key"];

      testCases.forEach((testCase) => {
        const matches = IDENTITY_FIELD_PATTERNS.some((pattern) =>
          pattern.test(testCase),
        );
        expect(matches).toBe(false);
      });
    });

    it("should have pattern for each identity field", () => {
      expect(IDENTITY_FIELD_PATTERNS).toHaveLength(SFMC_IDENTITY_FIELDS.length);
    });
  });

  describe("IMMEDIATE_TRIGGER_CHARS_Classification_CorrectCharacters", () => {
    it("should contain period character", () => {
      expect(IMMEDIATE_TRIGGER_CHARS).toContain(".");
    });

    it("should contain opening bracket character", () => {
      expect(IMMEDIATE_TRIGGER_CHARS).toContain("[");
    });

    it("should contain underscore character", () => {
      expect(IMMEDIATE_TRIGGER_CHARS).toContain("_");
    });

    it("should have exactly 3 trigger characters", () => {
      expect(IMMEDIATE_TRIGGER_CHARS).toHaveLength(3);
    });

    it("should not contain space or comma", () => {
      expect(IMMEDIATE_TRIGGER_CHARS).not.toContain(" ");
      expect(IMMEDIATE_TRIGGER_CHARS).not.toContain(",");
    });
  });

  describe("ConfigurationValues_Export_CorrectValues", () => {
    it("should export MIN_TRIGGER_CHARS as 2", () => {
      expect(MIN_TRIGGER_CHARS).toBe(2);
    });

    it("should export MAX_SUGGESTIONS as 10", () => {
      expect(MAX_SUGGESTIONS).toBe(10);
    });

    it("should export GHOST_TEXT_DEBOUNCE with structural delay of 0", () => {
      expect(GHOST_TEXT_DEBOUNCE.structural).toBe(0);
    });

    it("should export GHOST_TEXT_DEBOUNCE with dataDependant delay of 175", () => {
      expect(GHOST_TEXT_DEBOUNCE.dataDependant).toBe(175);
    });

    it("should export DROPDOWN_CLOSE_CHARS with expected characters", () => {
      expect(DROPDOWN_CLOSE_CHARS).toEqual([",", ";", ")", "\n"]);
    });

    it("should export NO_TRIGGER_CHARS with expected characters", () => {
      expect(NO_TRIGGER_CHARS).toEqual([" ", "\n", "\r", ",", ";", ")", "-"]);
    });
  });

  describe("NO_TRIGGER_CHARS_CharacterSet_DoesNotOverlapWithImmediateTriggers", () => {
    it("should not contain any immediate trigger characters", () => {
      IMMEDIATE_TRIGGER_CHARS.forEach((char) => {
        expect(NO_TRIGGER_CHARS).not.toContain(char);
      });
    });
  });

  describe("DROPDOWN_CLOSE_CHARS_CharacterSet_HasValidStatementBoundaries", () => {
    it("should contain comma for list separation", () => {
      expect(DROPDOWN_CLOSE_CHARS).toContain(",");
    });

    it("should contain semicolon for statement termination", () => {
      expect(DROPDOWN_CLOSE_CHARS).toContain(";");
    });

    it("should contain closing parenthesis", () => {
      expect(DROPDOWN_CLOSE_CHARS).toContain(")");
    });

    it("should contain newline for line breaks", () => {
      expect(DROPDOWN_CLOSE_CHARS).toContain("\n");
    });
  });
});
