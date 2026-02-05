import { describe, expect, it } from "vitest";
import {
  isSystemDataView,
  getSystemDataViewFields,
  getSystemDataViewNames,
} from "../system-data-views";

describe("System Data Views", () => {
  describe("getSystemDataViewNames", () => {
    it("should return all 30 system data view names", () => {
      const names = getSystemDataViewNames();
      expect(names).toHaveLength(30);
    });

    it("should include core email data views", () => {
      const names = getSystemDataViewNames();
      expect(names).toContain("_Sent");
      expect(names).toContain("_Open");
      expect(names).toContain("_Click");
      expect(names).toContain("_Bounce");
      expect(names).toContain("_Unsubscribe");
      expect(names).toContain("_Complaint");
    });

    it("should include subscriber data views", () => {
      const names = getSystemDataViewNames();
      expect(names).toContain("_Subscribers");
      expect(names).toContain("_ListSubscribers");
    });

    it("should include journey data views", () => {
      const names = getSystemDataViewNames();
      expect(names).toContain("_Journey");
      expect(names).toContain("_JourneyActivity");
    });

    it("should include automation data views", () => {
      const names = getSystemDataViewNames();
      expect(names).toContain("_AutomationInstance");
      expect(names).toContain("_AutomationActivityInstance");
    });

    it("should include mobile data views", () => {
      const names = getSystemDataViewNames();
      expect(names).toContain("_SMSMessageTracking");
      expect(names).toContain("_SMSSubscriptionLog");
      expect(names).toContain("_UndeliverableSms");
      expect(names).toContain("_MobileAddress");
      expect(names).toContain("_MobileSubscription");
      expect(names).toContain("_PushAddress");
      expect(names).toContain("_PushTag");
    });
  });

  describe("isSystemDataView", () => {
    describe("exact name matching", () => {
      it("should return true for _Sent", () => {
        expect(isSystemDataView("_Sent")).toBe(true);
      });

      it("should return true for _Open", () => {
        expect(isSystemDataView("_Open")).toBe(true);
      });

      it("should return true for _Click", () => {
        expect(isSystemDataView("_Click")).toBe(true);
      });

      it("should return true for _Bounce", () => {
        expect(isSystemDataView("_Bounce")).toBe(true);
      });

      it("should return true for _Subscribers", () => {
        expect(isSystemDataView("_Subscribers")).toBe(true);
      });

      it("should return true for _Job", () => {
        expect(isSystemDataView("_Job")).toBe(true);
      });

      it("should return true for _Journey", () => {
        expect(isSystemDataView("_Journey")).toBe(true);
      });
    });

    describe("case insensitivity", () => {
      it("should return true for lowercase _sent", () => {
        expect(isSystemDataView("_sent")).toBe(true);
      });

      it("should return true for uppercase _SENT", () => {
        expect(isSystemDataView("_SENT")).toBe(true);
      });

      it("should return true for mixed case _SeNt", () => {
        expect(isSystemDataView("_SeNt")).toBe(true);
      });

      it("should return true for lowercase _open", () => {
        expect(isSystemDataView("_open")).toBe(true);
      });

      it("should return true for uppercase _BOUNCE", () => {
        expect(isSystemDataView("_BOUNCE")).toBe(true);
      });

      it("should return true for lowercase _subscribers", () => {
        expect(isSystemDataView("_subscribers")).toBe(true);
      });
    });

    describe("ENT. prefix handling", () => {
      it("should return true for ENT._Sent", () => {
        expect(isSystemDataView("ENT._Sent")).toBe(true);
      });

      it("should return true for ent._sent (lowercase)", () => {
        expect(isSystemDataView("ent._sent")).toBe(true);
      });

      it("should return true for ENT._Open", () => {
        expect(isSystemDataView("ENT._Open")).toBe(true);
      });

      it("should return true for ENT._Bounce", () => {
        expect(isSystemDataView("ENT._Bounce")).toBe(true);
      });

      it("should return true for ENT._Subscribers", () => {
        expect(isSystemDataView("ENT._Subscribers")).toBe(true);
      });

      it("should return true for Ent._Job (mixed case prefix)", () => {
        expect(isSystemDataView("Ent._Job")).toBe(true);
      });
    });

    describe("underscore prefix handling", () => {
      it("should return false for Sent (without underscore)", () => {
        expect(isSystemDataView("Sent")).toBe(false);
      });

      it("should return false for Open (without underscore)", () => {
        expect(isSystemDataView("Open")).toBe(false);
      });

      it("should return false for Click (without underscore)", () => {
        expect(isSystemDataView("Click")).toBe(false);
      });

      it("should return false for Subscribers (without underscore)", () => {
        expect(isSystemDataView("Subscribers")).toBe(false);
      });

      it("should return true for _Sent (with underscore)", () => {
        expect(isSystemDataView("_Sent")).toBe(true);
      });
    });

    describe("non-data-view names", () => {
      it("should return false for regular table names", () => {
        expect(isSystemDataView("Contacts")).toBe(false);
      });

      it("should return false for user data extensions", () => {
        expect(isSystemDataView("MyDataExtension")).toBe(false);
      });

      it("should return false for similar but incorrect names", () => {
        expect(isSystemDataView("_Sending")).toBe(false);
        expect(isSystemDataView("_Opens")).toBe(false);
        expect(isSystemDataView("_Clicks")).toBe(false);
      });

      it("should return false for empty string", () => {
        expect(isSystemDataView("")).toBe(false);
      });

      it("should return false for just underscore", () => {
        expect(isSystemDataView("_")).toBe(false);
      });
    });
  });

  describe("getSystemDataViewFields", () => {
    describe("_Sent fields", () => {
      it("should return fields for _Sent", () => {
        const fields = getSystemDataViewFields("_Sent");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include standard tracking fields for _Sent", () => {
        const fields = getSystemDataViewFields("_Sent");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("AccountID");
        expect(fieldNames).toContain("JobID");
        expect(fieldNames).toContain("SubscriberKey");
        expect(fieldNames).toContain("EventDate");
      });

      it("should have correct types for _Sent fields", () => {
        const fields = getSystemDataViewFields("_Sent");

        const jobIdField = fields.find((f) => f.Name === "JobID");
        expect(jobIdField?.FieldType).toBe("Number");

        const subscriberKeyField = fields.find(
          (f) => f.Name === "SubscriberKey"
        );
        expect(subscriberKeyField?.FieldType).toBe("Text");
        expect(subscriberKeyField?.MaxLength).toBe(254);

        const eventDateField = fields.find((f) => f.Name === "EventDate");
        expect(eventDateField?.FieldType).toBe("Date");
      });
    });

    describe("_Open fields", () => {
      it("should return fields for _Open", () => {
        const fields = getSystemDataViewFields("_Open");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include IsUnique boolean field for _Open", () => {
        const fields = getSystemDataViewFields("_Open");
        const isUniqueField = fields.find((f) => f.Name === "IsUnique");

        expect(isUniqueField).toBeDefined();
        expect(isUniqueField?.FieldType).toBe("Boolean");
      });
    });

    describe("_Click fields", () => {
      it("should return fields for _Click", () => {
        const fields = getSystemDataViewFields("_Click");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include URL and LinkName fields for _Click", () => {
        const fields = getSystemDataViewFields("_Click");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("URL");
        expect(fieldNames).toContain("LinkName");
      });
    });

    describe("_Bounce fields", () => {
      it("should return fields for _Bounce", () => {
        const fields = getSystemDataViewFields("_Bounce");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include bounce category fields", () => {
        const fields = getSystemDataViewFields("_Bounce");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("BounceCategoryID");
        expect(fieldNames).toContain("BounceCategory");
        expect(fieldNames).toContain("BounceType");
        expect(fieldNames).toContain("SMTPBounceReason");
      });
    });

    describe("_Subscribers fields", () => {
      it("should return fields for _Subscribers", () => {
        const fields = getSystemDataViewFields("_Subscribers");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include EmailAddress field with correct type", () => {
        const fields = getSystemDataViewFields("_Subscribers");
        const emailField = fields.find((f) => f.Name === "EmailAddress");

        expect(emailField).toBeDefined();
        expect(emailField?.FieldType).toBe("EmailAddress");
      });

      it("should include Status field", () => {
        const fields = getSystemDataViewFields("_Subscribers");
        const statusField = fields.find((f) => f.Name === "Status");

        expect(statusField).toBeDefined();
        expect(statusField?.FieldType).toBe("Text");
      });
    });

    describe("_Job fields", () => {
      it("should return fields for _Job", () => {
        const fields = getSystemDataViewFields("_Job");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include email job metadata fields", () => {
        const fields = getSystemDataViewFields("_Job");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("EmailID");
        expect(fieldNames).toContain("FromName");
        expect(fieldNames).toContain("FromEmail");
        expect(fieldNames).toContain("EmailSubject");
      });

      it("should have FromEmail as EmailAddress type", () => {
        const fields = getSystemDataViewFields("_Job");
        const fromEmailField = fields.find((f) => f.Name === "FromEmail");

        expect(fromEmailField?.FieldType).toBe("EmailAddress");
      });
    });

    describe("case insensitivity", () => {
      it("should return fields for lowercase _sent", () => {
        const fields = getSystemDataViewFields("_sent");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should return fields for uppercase _SENT", () => {
        const fields = getSystemDataViewFields("_SENT");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should return same fields regardless of case", () => {
        const lowerFields = getSystemDataViewFields("_sent");
        const upperFields = getSystemDataViewFields("_SENT");
        const mixedFields = getSystemDataViewFields("_SeNt");

        expect(lowerFields).toEqual(upperFields);
        expect(lowerFields).toEqual(mixedFields);
      });
    });

    describe("ENT. prefix handling", () => {
      it("should return fields for ENT._Sent", () => {
        const fields = getSystemDataViewFields("ENT._Sent");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should return fields for ent._sent (lowercase)", () => {
        const fields = getSystemDataViewFields("ent._sent");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should return same fields with or without ENT. prefix", () => {
        const withPrefix = getSystemDataViewFields("ENT._Sent");
        const withoutPrefix = getSystemDataViewFields("_Sent");

        expect(withPrefix).toEqual(withoutPrefix);
      });
    });

    describe("non-existent data views", () => {
      it("should return empty array for unknown data view", () => {
        const fields = getSystemDataViewFields("_NonExistent");
        expect(fields).toEqual([]);
      });

      it("should return empty array for regular table name", () => {
        const fields = getSystemDataViewFields("Contacts");
        expect(fields).toEqual([]);
      });

      it("should return empty array for empty string", () => {
        const fields = getSystemDataViewFields("");
        expect(fields).toEqual([]);
      });
    });

    describe("mobile data view fields", () => {
      it("should return fields for _SMSMessageTracking", () => {
        const fields = getSystemDataViewFields("_SMSMessageTracking");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include Mobile field with Phone type", () => {
        const fields = getSystemDataViewFields("_SMSMessageTracking");
        const mobileField = fields.find((f) => f.Name === "Mobile");

        expect(mobileField).toBeDefined();
        expect(mobileField?.FieldType).toBe("Phone");
      });

      it("should return fields for _MobileAddress", () => {
        const fields = getSystemDataViewFields("_MobileAddress");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include underscore-prefixed fields for _MobileAddress", () => {
        const fields = getSystemDataViewFields("_MobileAddress");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("_MobileNumber");
        expect(fieldNames).toContain("_ContactID");
        expect(fieldNames).toContain("_Status");
      });
    });

    describe("journey data view fields", () => {
      it("should return fields for _Journey", () => {
        const fields = getSystemDataViewFields("_Journey");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include journey-specific fields", () => {
        const fields = getSystemDataViewFields("_Journey");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("JourneyID");
        expect(fieldNames).toContain("JourneyName");
        expect(fieldNames).toContain("JourneyStatus");
        expect(fieldNames).toContain("VersionID");
      });

      it("should return fields for _JourneyActivity", () => {
        const fields = getSystemDataViewFields("_JourneyActivity");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include activity-specific fields", () => {
        const fields = getSystemDataViewFields("_JourneyActivity");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("ActivityID");
        expect(fieldNames).toContain("ActivityName");
        expect(fieldNames).toContain("ActivityType");
      });
    });

    describe("automation data view fields", () => {
      it("should return fields for _AutomationInstance", () => {
        const fields = getSystemDataViewFields("_AutomationInstance");
        expect(fields.length).toBeGreaterThan(0);
      });

      it("should include automation-specific fields", () => {
        const fields = getSystemDataViewFields("_AutomationInstance");
        const fieldNames = fields.map((f) => f.Name);

        expect(fieldNames).toContain("AutomationName");
        expect(fieldNames).toContain("AutomationInstanceID");
        expect(fieldNames).toContain("AutomationInstanceStatus");
      });
    });
  });
});
