import { describe, expect, it } from "vitest";

import { buildCreateDataExtension } from "./data-extension";

describe("DataExtension SOAP Request Builders", () => {
  describe("buildCreateDataExtension retention policy", () => {
    const baseParams = {
      name: "Test DE",
      customerKey: "test-de-key",
      categoryId: 123,
      fields: [{ name: "Id", fieldType: "Number" }],
    };

    it("omits retention XML when retention is undefined", () => {
      const xml = buildCreateDataExtension(baseParams);

      expect(xml).not.toContain("<DataRetentionPeriodLength>");
      expect(xml).not.toContain("<DataRetentionPeriod>");
      expect(xml).not.toContain("<RetainUntil>");
      expect(xml).not.toContain("<RowBasedRetention>");
      expect(xml).not.toContain("<ResetRetentionPeriodOnImport>");
      expect(xml).not.toContain("<DeleteAtEndOfRetentionPeriod>");
    });

    it("includes period-based retention XML", () => {
      const xml = buildCreateDataExtension({
        ...baseParams,
        retention: {
          type: "period",
          periodLength: 30,
          periodUnit: "Days",
          deleteType: "individual",
          resetOnImport: false,
          deleteAtEnd: false,
        },
      });

      expect(xml).toContain(
        "<DataRetentionPeriodLength>30</DataRetentionPeriodLength>",
      );
      expect(xml).toContain("<DataRetentionPeriod>Days</DataRetentionPeriod>");
      expect(xml).toContain("<RowBasedRetention>true</RowBasedRetention>");
      expect(xml).toContain(
        "<ResetRetentionPeriodOnImport>false</ResetRetentionPeriodOnImport>",
      );
      expect(xml).toContain(
        "<DeleteAtEndOfRetentionPeriod>false</DeleteAtEndOfRetentionPeriod>",
      );
    });

    it("includes date-based retention XML", () => {
      const xml = buildCreateDataExtension({
        ...baseParams,
        retention: {
          type: "date",
          retainUntil: "2026-06-30",
          deleteType: "all",
          resetOnImport: true,
          deleteAtEnd: true,
        },
      });

      expect(xml).toContain(
        "<RetainUntil>2026-06-30T23:59:59.000Z</RetainUntil>",
      );
      expect(xml).toContain("<RowBasedRetention>false</RowBasedRetention>");
      expect(xml).toContain(
        "<ResetRetentionPeriodOnImport>true</ResetRetentionPeriodOnImport>",
      );
      expect(xml).toContain(
        "<DeleteAtEndOfRetentionPeriod>true</DeleteAtEndOfRetentionPeriod>",
      );
    });
  });
});
