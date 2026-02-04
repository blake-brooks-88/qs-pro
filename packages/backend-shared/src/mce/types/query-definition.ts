export interface QueryDefinition {
  objectId: string;
  customerKey: string;
  name: string;
  categoryId?: number;
}

export interface CreateQueryDefinitionParams {
  name: string;
  customerKey: string;
  categoryId?: number;
  targetId: string;
  targetCustomerKey: string;
  targetName: string;
  queryText: string;
  description?: string;
  targetUpdateType?: "Overwrite" | "Append" | "Update";
}
