export interface TableMetadata {
  [tableName: string]: FieldDefinition[];
}

export interface FieldDefinition {
  Name: string;
  FieldType: string;
  MaxLength?: number;
}

export interface CreateRunRequest {
  sqlText: string;
  snippetName?: string;
  targetDeCustomerKey?: string;
  tableMetadata?: TableMetadata;
}
