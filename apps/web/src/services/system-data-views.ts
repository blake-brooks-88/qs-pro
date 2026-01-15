/**
 * MCE System Data Views - Static definitions for autocomplete and folder tree
 *
 * These are hardcoded MCE system data views with complete field definitions.
 * They are merged into metadata results when the systemDataViews feature is enabled.
 *
 * @see docs/plans/2026-01-12-system-data-views-design.md
 */
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
// DATA VIEWS (29 visible in folder tree)
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
// FIELD DEFINITIONS
// =============================================================================

const SYSTEM_DATA_VIEW_FIELDS = new Map<
  string,
  DataExtensionFieldResponseDto[]
>([
  // =========================================================================
  // EMAIL DATA VIEWS
  // =========================================================================

  [
    "_Sent",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "EventDate", FieldType: "Date" },
      { Name: "Domain", FieldType: "Text", MaxLength: 128 },
      {
        Name: "TriggererSendDefinitionObjectID",
        FieldType: "Text",
        MaxLength: 36,
      },
      {
        Name: "TriggeredSendCustomerKey",
        FieldType: "Text",
        MaxLength: 36,
      },
    ],
  ],

  [
    "_Open",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "EventDate", FieldType: "Date" },
      { Name: "Domain", FieldType: "Text", MaxLength: 128 },
      { Name: "IsUnique", FieldType: "Boolean" },
      {
        Name: "TriggererSendDefinitionObjectID",
        FieldType: "Text",
        MaxLength: 36,
      },
      {
        Name: "TriggeredSendCustomerKey",
        FieldType: "Text",
        MaxLength: 36,
      },
    ],
  ],

  [
    "_Click",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "EventDate", FieldType: "Date" },
      { Name: "Domain", FieldType: "Text", MaxLength: 128 },
      { Name: "URL", FieldType: "Text", MaxLength: 900 },
      { Name: "LinkName", FieldType: "Text", MaxLength: 1024 },
      { Name: "LinkContent", FieldType: "Text" },
      { Name: "IsUnique", FieldType: "Boolean" },
      {
        Name: "TriggererSendDefinitionObjectID",
        FieldType: "Text",
        MaxLength: 36,
      },
      {
        Name: "TriggeredSendCustomerKey",
        FieldType: "Text",
        MaxLength: 36,
      },
    ],
  ],

  [
    "_Bounce",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "EventDate", FieldType: "Date" },
      { Name: "Domain", FieldType: "Text", MaxLength: 128 },
      { Name: "BounceCategoryID", FieldType: "Number" },
      { Name: "BounceCategory", FieldType: "Text", MaxLength: 50 },
      { Name: "BounceSubcategoryID", FieldType: "Number" },
      { Name: "BounceSubcategory", FieldType: "Text", MaxLength: 50 },
      { Name: "BounceTypeID", FieldType: "Number" },
      { Name: "BounceType", FieldType: "Text", MaxLength: 50 },
      { Name: "SMTPBounceReason", FieldType: "Text", MaxLength: 4000 },
      { Name: "SMTPMessage", FieldType: "Text", MaxLength: 4000 },
      { Name: "SMTPCode", FieldType: "Number" },
      { Name: "IsUnique", FieldType: "Boolean" },
      {
        Name: "TriggererSendDefinitionObjectID",
        FieldType: "Text",
        MaxLength: 36,
      },
      {
        Name: "TriggeredSendCustomerKey",
        FieldType: "Text",
        MaxLength: 36,
      },
    ],
  ],

  [
    "_Unsubscribe",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "EventDate", FieldType: "Date" },
      { Name: "IsUnique", FieldType: "Boolean" },
      { Name: "Domain", FieldType: "Text", MaxLength: 128 },
    ],
  ],

  [
    "_Complaint",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "EventDate", FieldType: "Date" },
      { Name: "IsUnique", FieldType: "Boolean" },
      { Name: "Domain", FieldType: "Text", MaxLength: 128 },
    ],
  ],

  [
    "_FTAF",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text" },
      { Name: "TransactionTime", FieldType: "Date" },
      { Name: "Domain", FieldType: "Text" },
      { Name: "IsUnique", FieldType: "Boolean" },
      { Name: "TriggererSendDefinitionObjectID", FieldType: "Text" },
      { Name: "TriggeredSendCustomerKey", FieldType: "Text", MaxLength: 36 },
    ],
  ],

  [
    "_BusinessUnitUnsubscribes",
    [
      { Name: "BusinessUnitID", FieldType: "Number" },
      { Name: "UnsubDateUTC", FieldType: "Date" },
      { Name: "UnsubReason", FieldType: "Text", MaxLength: 100 },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
    ],
  ],

  [
    "_Job",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "AccountUserID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "EmailID", FieldType: "Number" },
      { Name: "FromName", FieldType: "Text", MaxLength: 130 },
      { Name: "FromEmail", FieldType: "Email" },
      { Name: "SchedTime", FieldType: "Date" },
      { Name: "PickupTime", FieldType: "Date" },
      { Name: "DeliveredTime", FieldType: "Date" },
      {
        Name: "TriggererSendDefinitionObjectID",
        FieldType: "Text",
        MaxLength: 36,
      },
      {
        Name: "TriggeredSendCustomerKey",
        FieldType: "Text",
        MaxLength: 36,
      },
      { Name: "EventID", FieldType: "Text", MaxLength: 50 },
      { Name: "IsMultipart", FieldType: "Boolean" },
      { Name: "JobType", FieldType: "Text", MaxLength: 50 },
      { Name: "JobStatus", FieldType: "Text", MaxLength: 50 },
      { Name: "ModifiedBy", FieldType: "Number" },
      { Name: "ModifiedDate", FieldType: "Date" },
      { Name: "EmailName", FieldType: "Text", MaxLength: 100 },
      { Name: "EmailSubject", FieldType: "Text", MaxLength: 200 },
      { Name: "IsWrapped", FieldType: "Boolean" },
      { Name: "TestEmailAddr", FieldType: "Email" },
      { Name: "Category", FieldType: "Text", MaxLength: 100 },
      { Name: "BccEmail", FieldType: "Email" },
      { Name: "OriginalSchedTime", FieldType: "Date" },
      { Name: "CreatedDate", FieldType: "Date" },
      { Name: "CharacterSet", FieldType: "Text", MaxLength: 30 },
      { Name: "IPAddress", FieldType: "Text", MaxLength: 50 },
      { Name: "SalesForceTotalSubscriberCount", FieldType: "Number" },
      { Name: "SalesForceErrorSubscriberCount", FieldType: "Number" },
      { Name: "SendType", FieldType: "Text", MaxLength: 128 },
      { Name: "DynamicEmailSubject", FieldType: "Text" },
      { Name: "SuppressTracking", FieldType: "Boolean" },
      { Name: "SendClassificationType", FieldType: "Text", MaxLength: 32 },
      { Name: "SendClassification", FieldType: "Text", MaxLength: 36 },
      { Name: "ResolveLinksWithCurrentData", FieldType: "Boolean" },
      { Name: "EmailSendDefinition", FieldType: "Text", MaxLength: 36 },
      { Name: "DeduplicateByEmail", FieldType: "Boolean" },
    ],
  ],

  [
    "_SurveyResponse",
    [
      { Name: "AccountID", FieldType: "Number" },
      { Name: "OYBAccountID", FieldType: "Number" },
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text" },
      { Name: "EventDate", FieldType: "Date" },
      { Name: "Domain", FieldType: "Text" },
      { Name: "SurveyID", FieldType: "Number" },
      { Name: "SurveyName", FieldType: "Text" },
      { Name: "IsUnique", FieldType: "Number" },
      { Name: "QuestionID", FieldType: "Number" },
      { Name: "QuestionName", FieldType: "Text" },
      { Name: "Question", FieldType: "Text" },
      { Name: "AnswerID", FieldType: "Number" },
      { Name: "AnswerName", FieldType: "Text" },
      { Name: "Answer", FieldType: "Text" },
      { Name: "AnswerData", FieldType: "Text" },
    ],
  ],

  [
    "_SocialNetworkImpressions",
    [
      { Name: "JobID", FieldType: "Number" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "RegionTitle", FieldType: "Text" },
      { Name: "RegionDescription", FieldType: "Text" },
      { Name: "RegionHTML", FieldType: "Text" },
      { Name: "ContentRegionID", FieldType: "Number" },
      { Name: "SocialSharingSiteID", FieldType: "Number" },
      { Name: "SiteName", FieldType: "Text" },
      { Name: "CountryCode", FieldType: "Text" },
      { Name: "ReferringURL", FieldType: "Text" },
      { Name: "IPAddress", FieldType: "Text", MaxLength: 50 },
      { Name: "TransactionTime", FieldType: "Date" },
      { Name: "PublishedSocialContentStatusID", FieldType: "Text" },
      { Name: "ShortCode", FieldType: "Text" },
      { Name: "PublishTime", FieldType: "Date" },
    ],
  ],

  [
    "_SocialNetworkTracking",
    [
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Email" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "BatchID", FieldType: "Number" },
      { Name: "SocialSharingSiteID", FieldType: "Number" },
      { Name: "SiteName", FieldType: "Text" },
      { Name: "CountryCode", FieldType: "Text" },
      { Name: "PublishedSocialContentID", FieldType: "Text" },
      { Name: "RegionTitle", FieldType: "Text" },
      { Name: "RegionDescription", FieldType: "Text" },
      { Name: "RegionHTML", FieldType: "Text" },
      { Name: "ContentRegionID", FieldType: "Text" },
      { Name: "OYBMemberID", FieldType: "Number" },
      { Name: "TransactionTime", FieldType: "Date" },
      { Name: "IsUnique", FieldType: "Boolean" },
      { Name: "Domain", FieldType: "Text" },
      { Name: "PublishedSocialContentStatusID", FieldType: "Text" },
      { Name: "ShortCode", FieldType: "Text" },
      { Name: "PublishTime", FieldType: "Date" },
    ],
  ],

  [
    "_Coupon",
    [
      { Name: "Name", FieldType: "Text" },
      { Name: "ExternalKey", FieldType: "Text" },
      { Name: "Description", FieldType: "Text" },
      { Name: "BeginDate", FieldType: "Date" },
      { Name: "ExpirationDate", FieldType: "Date" },
    ],
  ],

  // =========================================================================
  // SUBSCRIBERS DATA VIEWS
  // =========================================================================

  ["_EnterpriseAttribute", [{ Name: "_SubscriberID", FieldType: "Number" }]],

  [
    "_Subscribers",
    [
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "DateUndeliverable", FieldType: "Date" },
      { Name: "DateJoined", FieldType: "Date" },
      { Name: "DateUnsubscribed", FieldType: "Date" },
      { Name: "Domain", FieldType: "Text", MaxLength: 254 },
      { Name: "EmailAddress", FieldType: "Email" },
      { Name: "BounceCount", FieldType: "Number" },
      { Name: "SubscriberType", FieldType: "Text", MaxLength: 100 },
      { Name: "Status", FieldType: "Text", MaxLength: 12 },
      { Name: "Locale", FieldType: "Text" },
    ],
  ],

  [
    "_ListSubscribers",
    [
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
      { Name: "AddedBy", FieldType: "Number" },
      { Name: "AddMethod", FieldType: "Text", MaxLength: 17 },
      { Name: "CreatedDate", FieldType: "Date" },
      { Name: "DateUnsubscribed", FieldType: "Date" },
      { Name: "EmailAddress", FieldType: "Text" },
      { Name: "ListID", FieldType: "Number" },
      { Name: "ListName", FieldType: "Text", MaxLength: 50 },
      { Name: "ListType", FieldType: "Text", MaxLength: 16 },
      { Name: "Status", FieldType: "Text", MaxLength: 12 },
      { Name: "SubscriberType", FieldType: "Text", MaxLength: 100 },
    ],
  ],

  // =========================================================================
  // JOURNEY BUILDER DATA VIEWS
  // =========================================================================

  [
    "_Journey",
    [
      { Name: "VersionID", FieldType: "Text", MaxLength: 36 },
      { Name: "JourneyID", FieldType: "Text", MaxLength: 36 },
      { Name: "JourneyName", FieldType: "Text", MaxLength: 200 },
      { Name: "VersionNumber", FieldType: "Number" },
      { Name: "CreatedDate", FieldType: "Date" },
      { Name: "LastPublishedDate", FieldType: "Date" },
      { Name: "ModifiedDate", FieldType: "Date" },
      { Name: "JourneyStatus", FieldType: "Text", MaxLength: 100 },
    ],
  ],

  [
    "_JourneyActivity",
    [
      { Name: "VersionID", FieldType: "Text", MaxLength: 36 },
      { Name: "ActivityID", FieldType: "Text", MaxLength: 36 },
      { Name: "ActivityName", FieldType: "Text", MaxLength: 200 },
      { Name: "ActivityExternalKey", FieldType: "Text", MaxLength: 200 },
      { Name: "JourneyActivityObjectID", FieldType: "Text", MaxLength: 36 },
      { Name: "ActivityType", FieldType: "Text", MaxLength: 512 },
    ],
  ],

  // =========================================================================
  // AUTOMATION STUDIO DATA VIEWS
  // =========================================================================

  [
    "_AutomationInstance",
    [
      { Name: "MemberID", FieldType: "Number" },
      { Name: "AutomationName", FieldType: "Text", MaxLength: 400 },
      { Name: "AutomationCustomerKey", FieldType: "Text" },
      { Name: "AutomationDescription", FieldType: "Text", MaxLength: 400 },
      { Name: "AutomationType", FieldType: "Text", MaxLength: 50 },
      {
        Name: "AutomationNotificationRecipient_Complete",
        FieldType: "Text",
        MaxLength: 500,
      },
      {
        Name: "AutomationNotificationRecipient_Error",
        FieldType: "Text",
        MaxLength: 500,
      },
      {
        Name: "AutomationNotificationRecipient_Skip",
        FieldType: "Text",
        MaxLength: 500,
      },
      { Name: "AutomationStepCount", FieldType: "Number" },
      { Name: "AutomationInstanceID", FieldType: "Text", MaxLength: 50 },
      { Name: "AutomationInstanceIsRunOnce", FieldType: "Boolean" },
      { Name: "FilenameFromTrigger", FieldType: "Text", MaxLength: 4000 },
      { Name: "AutomationInstanceScheduledTime_UTC", FieldType: "Date" },
      { Name: "AutomationInstanceStartTime_UTC", FieldType: "Date" },
      { Name: "AutomationInstanceEndTime_UTC", FieldType: "Date" },
      { Name: "AutomationInstanceStatus", FieldType: "Text", MaxLength: 400 },
      {
        Name: "AutomationInstanceActivityErrorDetails",
        FieldType: "Text",
        MaxLength: 4000,
      },
    ],
  ],

  [
    "_AutomationActivityInstance",
    [
      { Name: "MemberID", FieldType: "Number" },
      { Name: "AutomationName", FieldType: "Text", MaxLength: 400 },
      { Name: "AutomationCustomerKey", FieldType: "Text", MaxLength: 400 },
      { Name: "AutomationInstanceID", FieldType: "Text", MaxLength: 50 },
      { Name: "ActivityType", FieldType: "Number" },
      { Name: "ActivityName", FieldType: "Text", MaxLength: 400 },
      { Name: "ActivityDescription", FieldType: "Text", MaxLength: 400 },
      { Name: "ActivityCustomerKey", FieldType: "Text", MaxLength: 400 },
      { Name: "ActivityInstanceStep", FieldType: "Text", MaxLength: 50 },
      { Name: "ActivityInstanceID", FieldType: "Text", MaxLength: 50 },
      { Name: "ActivityInstanceStartTime_UTC", FieldType: "Date" },
      { Name: "ActivityInstanceEndTime_UTC", FieldType: "Date" },
      { Name: "ActivityInstanceStatus", FieldType: "Text", MaxLength: 256 },
      {
        Name: "ActivityInstanceStatusDetails",
        FieldType: "Text",
        MaxLength: 4000,
      },
    ],
  ],

  // =========================================================================
  // MOBILE CONNECT DATA VIEWS
  // =========================================================================

  [
    "_SMSMessageTracking",
    [
      { Name: "Mobile", FieldType: "Phone" },
      { Name: "SubscriberKey", FieldType: "Text" },
      { Name: "SubscriberID", FieldType: "Number" },
      { Name: "MobileMessageTrackingID", FieldType: "Number" },
      { Name: "EID", FieldType: "Number" },
      { Name: "MID", FieldType: "Number" },
      { Name: "MessageID", FieldType: "Number" },
      { Name: "KeywordID", FieldType: "Text" },
      { Name: "CodeID", FieldType: "Text" },
      { Name: "ConversationID", FieldType: "Text" },
      { Name: "CampaignID", FieldType: "Number" },
      { Name: "Sent", FieldType: "Boolean" },
      { Name: "Delivered", FieldType: "Boolean" },
      { Name: "Undelivered", FieldType: "Boolean" },
      { Name: "Outbound", FieldType: "Boolean" },
      { Name: "Inbound", FieldType: "Boolean" },
      { Name: "CreateDateTime", FieldType: "Date" },
      { Name: "ModifiedDateTime", FieldType: "Date" },
      { Name: "ActionDateTime", FieldType: "Date" },
      { Name: "MessageText", FieldType: "Text" },
      { Name: "IsTest", FieldType: "Boolean" },
      { Name: "MobileMessageRecurrenceID", FieldType: "Number" },
      { Name: "ResponseToMobileMessageTrackingID", FieldType: "Number" },
      { Name: "IsValid", FieldType: "Boolean" },
      { Name: "InvalidationCode", FieldType: "Number" },
      { Name: "SendID", FieldType: "Number" },
      { Name: "SendSplitID", FieldType: "Number" },
      { Name: "SendSegmentID", FieldType: "Number" },
      { Name: "SendJobID", FieldType: "Number" },
      { Name: "SendGroupID", FieldType: "Number" },
      { Name: "SendPersonID", FieldType: "Number" },
      { Name: "SMSStandardStatusCodeId", FieldType: "Number" },
      { Name: "Description", FieldType: "Text" },
      { Name: "Name", FieldType: "Text" },
      { Name: "ShortCode", FieldType: "Text" },
      { Name: "SharedKeyword", FieldType: "Text" },
      { Name: "Ordinal", FieldType: "Number" },
      { Name: "FromName", FieldType: "Text" },
      { Name: "JBActivityID", FieldType: "Text" },
      { Name: "JBDefinitionID", FieldType: "Text" },
      { Name: "SMSJobID", FieldType: "Text" },
      { Name: "SMSBatchID", FieldType: "Number" },
    ],
  ],

  [
    "_SMSSubscriptionLog",
    [
      { Name: "MobileNumber", FieldType: "Phone" },
      { Name: "SubscriberKey", FieldType: "Text" },
      { Name: "LogDate", FieldType: "Date" },
      { Name: "MobileSubscriptionID", FieldType: "Number" },
      { Name: "SubscriptionDefinitionID", FieldType: "Text" },
      { Name: "OptOutStatusID", FieldType: "Number" },
      { Name: "OptOutMethodID", FieldType: "Number" },
      { Name: "OptOutDate", FieldType: "Date" },
      { Name: "OptInStatusID", FieldType: "Number" },
      { Name: "OptInMethodID", FieldType: "Number" },
      { Name: "OptInDate", FieldType: "Date" },
      { Name: "Source", FieldType: "Number" },
      { Name: "CreatedDate", FieldType: "Date" },
      { Name: "ModifiedDate", FieldType: "Date" },
    ],
  ],

  [
    "_UndeliverableSms",
    [
      { Name: "MobileNumber", FieldType: "Phone" },
      { Name: "Undeliverable", FieldType: "Boolean" },
      { Name: "BounceCount", FieldType: "Number" },
      { Name: "FirstBounceDate", FieldType: "Date" },
      { Name: "HoldDate", FieldType: "Date" },
    ],
  ],

  [
    "_MobileAddress",
    [
      { Name: "_MobileNumber", FieldType: "Text", MaxLength: 15 },
      { Name: "_ContactID", FieldType: "Text" },
      { Name: "_Status", FieldType: "Text" },
      { Name: "_Source", FieldType: "Text" },
      { Name: "_SourceObjectId", FieldType: "Text", MaxLength: 200 },
      { Name: "_Priority", FieldType: "Text" },
      { Name: "_Channel", FieldType: "Text", MaxLength: 20 },
      { Name: "_CarrierID", FieldType: "Text" },
      { Name: "_CountryCode", FieldType: "Text", MaxLength: 2 },
      { Name: "_CreatedDate", FieldType: "Date" },
      { Name: "_CreatedBy", FieldType: "Text" },
      { Name: "_ModifiedDate", FieldType: "Date" },
      { Name: "_ModifiedBy", FieldType: "Text" },
      { Name: "_City", FieldType: "Text", MaxLength: 200 },
      { Name: "_State", FieldType: "Text", MaxLength: 200 },
      { Name: "_ZipCode", FieldType: "Text", MaxLength: 20 },
      { Name: "_FirstName", FieldType: "Text", MaxLength: 100 },
      { Name: "_LastName", FieldType: "Text", MaxLength: 100 },
      { Name: "_UTCOffset", FieldType: "Number" },
      { Name: "_IsHonorDST", FieldType: "Boolean" },
    ],
  ],

  [
    "_MobileSubscription",
    [
      { Name: "_MobileNumber", FieldType: "Text", MaxLength: 15 },
      { Name: "_SubscriptionDefinitionID", FieldType: "Text", MaxLength: 200 },
      { Name: "_OptOutStatusID", FieldType: "Text" },
      { Name: "_OptOutMethodID", FieldType: "Text" },
      { Name: "_OptOutDate", FieldType: "Date" },
      { Name: "_OptInStatusID", FieldType: "Text" },
      { Name: "_OptInMethodID", FieldType: "Text" },
      { Name: "_OptInDate", FieldType: "Date" },
      { Name: "_Source", FieldType: "Text" },
      { Name: "_CreatedDate", FieldType: "Date" },
      { Name: "_SourceObjectId", FieldType: "Text", MaxLength: 200 },
      { Name: "_CreatedBy", FieldType: "Text" },
      { Name: "_ModifiedDate", FieldType: "Date" },
      { Name: "_ModifiedBy", FieldType: "Text" },
    ],
  ],

  [
    "_ChatMessagingSubscription",
    [
      { Name: "_MobileNumber", FieldType: "Text", MaxLength: 254 },
      { Name: "_ChannelId", FieldType: "Text", MaxLength: 50 },
      { Name: "_ChannelType", FieldType: "Text", MaxLength: 20 },
      { Name: "_OptOutStatusID", FieldType: "Text" },
      { Name: "_OptOutMethodID", FieldType: "Text" },
      { Name: "_OptOutDate", FieldType: "Date" },
      { Name: "_OptinStatusID", FieldType: "Text" },
      { Name: "_OptinMethodID", FieldType: "Text" },
      { Name: "_OptinDate", FieldType: "Date" },
      { Name: "_Source", FieldType: "Text" },
      { Name: "_SourceObjectId", FieldType: "Text", MaxLength: 200 },
      { Name: "_CreatedDate", FieldType: "Date" },
      { Name: "_CreatedBy", FieldType: "Text" },
      { Name: "_ModifiedDate", FieldType: "Date" },
      { Name: "_ModifiedBy", FieldType: "Text" },
    ],
  ],

  // =========================================================================
  // MOBILE PUSH DATA VIEWS
  // =========================================================================

  [
    "_PushAddress",
    [
      { Name: "_DeviceID", FieldType: "Text", MaxLength: 200 },
      { Name: "_ContactID", FieldType: "Text" },
      { Name: "_APID", FieldType: "Text", MaxLength: 38 },
      { Name: "_Status", FieldType: "Text" },
      { Name: "_Source", FieldType: "Text" },
      { Name: "_SourceObjectId", FieldType: "Text", MaxLength: 200 },
      { Name: "_Platform", FieldType: "Text", MaxLength: 100 },
      { Name: "_PlatformVersion", FieldType: "Text", MaxLength: 100 },
      { Name: "_Alias", FieldType: "Text", MaxLength: 100 },
      { Name: "_OptOutStatusID", FieldType: "Text" },
      { Name: "_OptOutMethodID", FieldType: "Text" },
      { Name: "_OptOutDate", FieldType: "Date" },
      { Name: "_OptInStatusID", FieldType: "Text" },
      { Name: "_OptInMethodID", FieldType: "Text" },
      { Name: "_OptInDate", FieldType: "Date" },
      { Name: "_Channel", FieldType: "Text", MaxLength: 20 },
      { Name: "_CreatedDate", FieldType: "Date" },
      { Name: "_CreatedBy", FieldType: "Text" },
      { Name: "_ModifiedDate", FieldType: "Date" },
      { Name: "_ModifiedBy", FieldType: "Text" },
      { Name: "_City", FieldType: "Text", MaxLength: 200 },
      { Name: "_State", FieldType: "Text", MaxLength: 200 },
      { Name: "_ZipCode", FieldType: "Text", MaxLength: 20 },
      { Name: "_FirstName", FieldType: "Text", MaxLength: 100 },
      { Name: "_LastName", FieldType: "Text", MaxLength: 100 },
      { Name: "_UTCOffset", FieldType: "Decimal" },
      { Name: "_IsHonorDST", FieldType: "Boolean" },
      { Name: "_SystemToken", FieldType: "Text", MaxLength: 4000 },
      { Name: "_ProviderToken", FieldType: "Text", MaxLength: 200 },
      { Name: "_Badge", FieldType: "Number" },
      { Name: "_LocationEnabled", FieldType: "Boolean" },
      { Name: "_TimeZone", FieldType: "Text", MaxLength: 50 },
      { Name: "_Device", FieldType: "Text", MaxLength: 100 },
      { Name: "_HardwareId", FieldType: "Text", MaxLength: 100 },
      { Name: "_DeviceType", FieldType: "Text", MaxLength: 20 },
    ],
  ],

  [
    "_PushTag",
    [
      { Name: "_DeviceID", FieldType: "Text", MaxLength: 200 },
      { Name: "_APID", FieldType: "Text", MaxLength: 38 },
      { Name: "_Value", FieldType: "Text", MaxLength: 128 },
      { Name: "_CreatedDate", FieldType: "Date" },
      { Name: "_CreatedBy", FieldType: "Text" },
      { Name: "_ModifiedDate", FieldType: "Date" },
      { Name: "_ModifiedBy", FieldType: "Text" },
    ],
  ],

  // =========================================================================
  // GROUP CONNECT DATA VIEWS
  // =========================================================================

  [
    "_MobileLineAddressContactSubscriptionView",
    [
      { Name: "ContactID", FieldType: "Number" },
      { Name: "ContactKey", FieldType: "Text" },
      { Name: "ChannelID", FieldType: "Text" },
      { Name: "AddressID", FieldType: "Text" },
      { Name: "IsActive", FieldType: "Number" },
      { Name: "CreatedDate", FieldType: "Date" },
      { Name: "ModifiedDate", FieldType: "Date" },
    ],
  ],

  [
    "_MobileLineOrphanContactView",
    [
      { Name: "ContactID", FieldType: "Number" },
      { Name: "ContactKey", FieldType: "Text" },
      { Name: "AddressID", FieldType: "Text" },
      { Name: "CreatedDate", FieldType: "Date" },
    ],
  ],
]);

// ENT. aliases share field definitions with their base versions
const subscribersFields = SYSTEM_DATA_VIEW_FIELDS.get("_Subscribers");
if (subscribersFields) {
  SYSTEM_DATA_VIEW_FIELDS.set("ENT._Subscribers", subscribersFields);
}

const enterpriseAttributeFields = SYSTEM_DATA_VIEW_FIELDS.get(
  "_EnterpriseAttribute",
);
if (enterpriseAttributeFields) {
  SYSTEM_DATA_VIEW_FIELDS.set(
    "ENT._EnterpriseAttribute",
    enterpriseAttributeFields,
  );
}

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
  return SYSTEM_DATA_VIEW_FIELDS.has(customerKey);
}

/**
 * Get field definitions for a system data view by customerKey
 * Returns empty array if not a system data view
 */
export function getSystemDataViewFields(
  customerKey: string,
): DataExtensionFieldResponseDto[] {
  return SYSTEM_DATA_VIEW_FIELDS.get(customerKey) ?? [];
}
