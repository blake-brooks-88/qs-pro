import type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
} from "@/services/metadata.types";

const folders: DataFolderResponseDto[] = [
  { ID: "1", Name: "Data Extensions", ParentFolder: null },
  { ID: "2", Name: "Query++ (Preview)", ParentFolder: { ID: "1" } },
];

const dataExtensions: DataExtensionResponseDto[] = [
  {
    CustomerKey: "DE_Customers",
    Name: "Customers",
    CategoryID: "2",
  },
  {
    CustomerKey: "DE_Orders",
    Name: "Orders",
    CategoryID: "2",
  },
  {
    CustomerKey: "DE_Email_Suppression",
    Name: "Email Suppression",
    CategoryID: "2",
  },
  {
    CustomerKey: "_Subscribers",
    Name: "_Subscribers (Data View)",
    CategoryID: "2",
  },
  {
    CustomerKey: "_Sent",
    Name: "_Sent (Data View)",
    CategoryID: "2",
  },
  {
    CustomerKey: "_Open",
    Name: "_Open (Data View)",
    CategoryID: "2",
  },
  {
    CustomerKey: "_Click",
    Name: "_Click (Data View)",
    CategoryID: "2",
  },
  {
    CustomerKey: "_Bounce",
    Name: "_Bounce (Data View)",
    CategoryID: "2",
  },
  {
    CustomerKey: "_Unsubscribe",
    Name: "_Unsubscribe (Data View)",
    CategoryID: "2",
  },
  {
    CustomerKey: "_Job",
    Name: "_Job (Data View)",
    CategoryID: "2",
  },
];

const fieldsByKey: Record<string, DataExtensionFieldResponseDto[]> = {
  DE_Customers: [
    {
      Name: "CustomerID",
      FieldType: "Text",
      MaxLength: 50,
      IsPrimaryKey: true,
      IsRequired: true,
    },
    { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
    { Name: "FirstName", FieldType: "Text", MaxLength: 100 },
    { Name: "LastName", FieldType: "Text", MaxLength: 100 },
    { Name: "CreatedDate", FieldType: "Date" },
    { Name: "IsActive", FieldType: "Boolean" },
  ],
  DE_Orders: [
    {
      Name: "OrderID",
      FieldType: "Text",
      MaxLength: 50,
      IsPrimaryKey: true,
      IsRequired: true,
    },
    { Name: "CustomerID", FieldType: "Text", MaxLength: 50, IsRequired: true },
    { Name: "OrderDate", FieldType: "Date" },
    { Name: "TotalAmount", FieldType: "Decimal" },
    { Name: "Status", FieldType: "Text", MaxLength: 50 },
  ],
  DE_Email_Suppression: [
    {
      Name: "EmailAddress",
      FieldType: "EmailAddress",
      MaxLength: 254,
      IsPrimaryKey: true,
      IsRequired: true,
    },
    { Name: "Reason", FieldType: "Text", MaxLength: 255 },
    { Name: "SuppressedDate", FieldType: "Date" },
  ],
  _Subscribers: [
    {
      Name: "SubscriberKey",
      FieldType: "Text",
      MaxLength: 254,
      IsPrimaryKey: true,
      IsRequired: true,
    },
    { Name: "EmailAddress", FieldType: "EmailAddress", MaxLength: 254 },
    { Name: "Status", FieldType: "Text", MaxLength: 50 },
    { Name: "DateJoined", FieldType: "Date" },
  ],
  _Sent: [
    { Name: "JobID", FieldType: "Number", IsRequired: true },
    { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
    { Name: "SubscriberID", FieldType: "Number" },
    { Name: "EventDate", FieldType: "Date" },
    { Name: "BatchID", FieldType: "Number" },
    { Name: "ListID", FieldType: "Number" },
  ],
  _Open: [
    { Name: "JobID", FieldType: "Number", IsRequired: true },
    { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
    { Name: "SubscriberID", FieldType: "Number" },
    { Name: "EventDate", FieldType: "Date" },
    { Name: "IsUnique", FieldType: "Boolean" },
  ],
  _Click: [
    { Name: "JobID", FieldType: "Number", IsRequired: true },
    { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
    { Name: "SubscriberID", FieldType: "Number" },
    { Name: "EventDate", FieldType: "Date" },
    { Name: "URL", FieldType: "Text", MaxLength: 4000 },
    { Name: "IsUnique", FieldType: "Boolean" },
  ],
  _Bounce: [
    { Name: "JobID", FieldType: "Number", IsRequired: true },
    { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
    { Name: "SubscriberID", FieldType: "Number" },
    { Name: "EventDate", FieldType: "Date" },
    { Name: "BounceCategory", FieldType: "Text", MaxLength: 50 },
    { Name: "BounceType", FieldType: "Text", MaxLength: 50 },
    { Name: "SMTPCode", FieldType: "Text", MaxLength: 50 },
  ],
  _Unsubscribe: [
    { Name: "JobID", FieldType: "Number", IsRequired: true },
    { Name: "SubscriberKey", FieldType: "Text", MaxLength: 254 },
    { Name: "SubscriberID", FieldType: "Number" },
    { Name: "EventDate", FieldType: "Date" },
  ],
  _Job: [
    { Name: "JobID", FieldType: "Number", IsPrimaryKey: true, IsRequired: true },
    { Name: "EmailID", FieldType: "Number" },
    { Name: "FromName", FieldType: "Text", MaxLength: 200 },
    { Name: "FromEmail", FieldType: "EmailAddress", MaxLength: 254 },
    { Name: "Subject", FieldType: "Text", MaxLength: 2000 },
    { Name: "SendClassification", FieldType: "Text", MaxLength: 200 },
    { Name: "DeliveredTime", FieldType: "Date" },
  ],
};

export async function getFoldersPreview(): Promise<DataFolderResponseDto[]> {
  return folders;
}

export async function getDataExtensionsPreview(
  _eid: string,
): Promise<DataExtensionResponseDto[]> {
  return dataExtensions;
}

export async function getFieldsPreview(
  customerKey: string,
): Promise<DataExtensionFieldResponseDto[]> {
  return fieldsByKey[customerKey] ?? [];
}
