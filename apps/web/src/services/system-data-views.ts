/**
 * MCE System Data Views - Static definitions for autocomplete and folder tree
 *
 * These are hardcoded MCE system data views with complete field definitions.
 * They are merged into metadata results when the systemDataViews feature is enabled.
 *
 * Field definitions are delegated to @qpp/schema-inferrer.
 * This file only contains UI-specific metadata (folders, categories).
 *
 * @see docs/plans/2026-01-12-system-data-views-design.md
 */
import {
  getSystemDataViewFields as coreGetSystemDataViewFields,
  isSystemDataView as coreIsSystemDataView,
  type SystemDataViewField,
} from "@qpp/schema-inferrer";

import type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
} from "@/services/metadata.types";

// =============================================================================
// FOLDER STRUCTURE (1 root + 7 categories)
// =============================================================================

const SDV_ROOT_ID = "sdv-root";

const SDV_CATEGORY_IDS = {
  email: "sdv-email",
  subscribers: "sdv-subscribers",
  journey: "sdv-journey",
  automation: "sdv-automation",
  mobileConnect: "sdv-mobile-connect",
  mobilePush: "sdv-mobile-push",
  groupConnect: "sdv-group-connect",
} as const;

const SYSTEM_DATA_VIEW_FOLDERS: DataFolderResponseDto[] = [
  { ID: SDV_ROOT_ID, Name: "Data Views", ParentFolder: null },
  {
    ID: SDV_CATEGORY_IDS.email,
    Name: "Email",
    ParentFolder: { ID: SDV_ROOT_ID },
  },
  {
    ID: SDV_CATEGORY_IDS.subscribers,
    Name: "Subscribers",
    ParentFolder: { ID: SDV_ROOT_ID },
  },
  {
    ID: SDV_CATEGORY_IDS.journey,
    Name: "Journey Builder",
    ParentFolder: { ID: SDV_ROOT_ID },
  },
  {
    ID: SDV_CATEGORY_IDS.automation,
    Name: "Automation Studio",
    ParentFolder: { ID: SDV_ROOT_ID },
  },
  {
    ID: SDV_CATEGORY_IDS.mobileConnect,
    Name: "Mobile Connect",
    ParentFolder: { ID: SDV_ROOT_ID },
  },
  {
    ID: SDV_CATEGORY_IDS.mobilePush,
    Name: "Mobile Push",
    ParentFolder: { ID: SDV_ROOT_ID },
  },
  {
    ID: SDV_CATEGORY_IDS.groupConnect,
    Name: "Group Connect",
    ParentFolder: { ID: SDV_ROOT_ID },
  },
];

// =============================================================================
// DATA VIEWS (30 visible in folder tree)
// =============================================================================

const SYSTEM_DATA_VIEWS: DataExtensionResponseDto[] = [
  // Email (13)
  { CustomerKey: "_Sent", Name: "_Sent", CategoryID: SDV_CATEGORY_IDS.email },
  { CustomerKey: "_Open", Name: "_Open", CategoryID: SDV_CATEGORY_IDS.email },
  { CustomerKey: "_Click", Name: "_Click", CategoryID: SDV_CATEGORY_IDS.email },
  {
    CustomerKey: "_Bounce",
    Name: "_Bounce",
    CategoryID: SDV_CATEGORY_IDS.email,
  },
  {
    CustomerKey: "_Unsubscribe",
    Name: "_Unsubscribe",
    CategoryID: SDV_CATEGORY_IDS.email,
  },
  {
    CustomerKey: "_Complaint",
    Name: "_Complaint",
    CategoryID: SDV_CATEGORY_IDS.email,
  },
  { CustomerKey: "_FTAF", Name: "_FTAF", CategoryID: SDV_CATEGORY_IDS.email },
  {
    CustomerKey: "_BusinessUnitUnsubscribes",
    Name: "_BusinessUnitUnsubscribes",
    CategoryID: SDV_CATEGORY_IDS.email,
  },
  { CustomerKey: "_Job", Name: "_Job", CategoryID: SDV_CATEGORY_IDS.email },
  {
    CustomerKey: "_SurveyResponse",
    Name: "_SurveyResponse",
    CategoryID: SDV_CATEGORY_IDS.email,
  },
  {
    CustomerKey: "_SocialNetworkImpressions",
    Name: "_SocialNetworkImpressions",
    CategoryID: SDV_CATEGORY_IDS.email,
  },
  {
    CustomerKey: "_SocialNetworkTracking",
    Name: "_SocialNetworkTracking",
    CategoryID: SDV_CATEGORY_IDS.email,
  },
  {
    CustomerKey: "_Coupon",
    Name: "_Coupon",
    CategoryID: SDV_CATEGORY_IDS.email,
  },

  // Subscribers (3)
  {
    CustomerKey: "_EnterpriseAttribute",
    Name: "_EnterpriseAttribute",
    CategoryID: SDV_CATEGORY_IDS.subscribers,
  },
  {
    CustomerKey: "_Subscribers",
    Name: "_Subscribers",
    CategoryID: SDV_CATEGORY_IDS.subscribers,
  },
  {
    CustomerKey: "_ListSubscribers",
    Name: "_ListSubscribers",
    CategoryID: SDV_CATEGORY_IDS.subscribers,
  },

  // Journey Builder (2)
  {
    CustomerKey: "_Journey",
    Name: "_Journey",
    CategoryID: SDV_CATEGORY_IDS.journey,
  },
  {
    CustomerKey: "_JourneyActivity",
    Name: "_JourneyActivity",
    CategoryID: SDV_CATEGORY_IDS.journey,
  },

  // Automation Studio (2)
  {
    CustomerKey: "_AutomationInstance",
    Name: "_AutomationInstance",
    CategoryID: SDV_CATEGORY_IDS.automation,
  },
  {
    CustomerKey: "_AutomationActivityInstance",
    Name: "_AutomationActivityInstance",
    CategoryID: SDV_CATEGORY_IDS.automation,
  },

  // Mobile Connect (6)
  {
    CustomerKey: "_SMSMessageTracking",
    Name: "_SMSMessageTracking",
    CategoryID: SDV_CATEGORY_IDS.mobileConnect,
  },
  {
    CustomerKey: "_SMSSubscriptionLog",
    Name: "_SMSSubscriptionLog",
    CategoryID: SDV_CATEGORY_IDS.mobileConnect,
  },
  {
    CustomerKey: "_UndeliverableSms",
    Name: "_UndeliverableSms",
    CategoryID: SDV_CATEGORY_IDS.mobileConnect,
  },
  {
    CustomerKey: "_MobileAddress",
    Name: "_MobileAddress",
    CategoryID: SDV_CATEGORY_IDS.mobileConnect,
  },
  {
    CustomerKey: "_MobileSubscription",
    Name: "_MobileSubscription",
    CategoryID: SDV_CATEGORY_IDS.mobileConnect,
  },
  {
    CustomerKey: "_ChatMessagingSubscription",
    Name: "_ChatMessagingSubscription",
    CategoryID: SDV_CATEGORY_IDS.mobileConnect,
  },

  // Mobile Push (2)
  {
    CustomerKey: "_PushAddress",
    Name: "_PushAddress",
    CategoryID: SDV_CATEGORY_IDS.mobilePush,
  },
  {
    CustomerKey: "_PushTag",
    Name: "_PushTag",
    CategoryID: SDV_CATEGORY_IDS.mobilePush,
  },

  // Group Connect (2)
  {
    CustomerKey: "_MobileLineAddressContactSubscriptionView",
    Name: "_MobileLineAddressContactSubscriptionView",
    CategoryID: SDV_CATEGORY_IDS.groupConnect,
  },
  {
    CustomerKey: "_MobileLineOrphanContactView",
    Name: "_MobileLineOrphanContactView",
    CategoryID: SDV_CATEGORY_IDS.groupConnect,
  },
];

// ENT. aliases (autocomplete only, not in folder tree)
const SYSTEM_DATA_VIEW_ALIASES: DataExtensionResponseDto[] = [
  { CustomerKey: "ENT._Subscribers", Name: "ENT._Subscribers" },
  {
    CustomerKey: "ENT._EnterpriseAttribute",
    Name: "ENT._EnterpriseAttribute",
  },
];

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get all system data view folders (root + categories)
 */
export function getSystemDataViewFolders(): DataFolderResponseDto[] {
  return SYSTEM_DATA_VIEW_FOLDERS;
}

/**
 * Get system data views for folder tree display (excludes ENT. aliases)
 */
export function getSystemDataViewExtensions(): DataExtensionResponseDto[] {
  return SYSTEM_DATA_VIEWS;
}

/**
 * Get ENT. aliased data views (for autocomplete only, not folder tree)
 */
export function getSystemDataViewAliases(): DataExtensionResponseDto[] {
  return SYSTEM_DATA_VIEW_ALIASES;
}

/**
 * Get all system data views including ENT. aliases (for autocomplete)
 */
export function getAllSystemDataViews(): DataExtensionResponseDto[] {
  return [...SYSTEM_DATA_VIEWS, ...SYSTEM_DATA_VIEW_ALIASES];
}

/**
 * Check if a customerKey is a system data view
 */
export function isSystemDataView(customerKey: string): boolean {
  return coreIsSystemDataView(customerKey);
}

/**
 * Get field definitions for a system data view by customerKey
 * Returns empty array if not a system data view
 */
export function getSystemDataViewFields(
  customerKey: string,
): DataExtensionFieldResponseDto[] {
  const fields = coreGetSystemDataViewFields(customerKey);
  return fields.map((field: SystemDataViewField) => ({
    Name: field.Name,
    FieldType: field.FieldType,
    MaxLength: field.MaxLength,
  }));
}
