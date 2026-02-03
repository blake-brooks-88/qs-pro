import type { DataRetentionPolicy } from "@qpp/shared-types";

export interface DataExtension {
  name: string;
  customerKey: string;
  objectId: string;
}

export interface DataExtensionField {
  name: string;
  fieldType: string;
  maxLength?: number;
  isPrimaryKey?: boolean;
  isRequired?: boolean;
}

export interface CreateDataExtensionField {
  name: string;
  fieldType: string;
  maxLength?: number;
  scale?: number;
  precision?: number;
  isPrimaryKey?: boolean;
  isRequired?: boolean;
  defaultValue?: string;
}

export interface CreateDataExtensionParams {
  name: string;
  customerKey: string;
  categoryId: number;
  isSendable?: boolean;
  sendableField?: string;
  sendableFieldType?: string;
  retention?: DataRetentionPolicy;
  fields: CreateDataExtensionField[];
}
