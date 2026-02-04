export interface DataFolderResponseDto {
  ID?: string | number;
  Name?: string;
  ParentFolder?: { ID?: string | number } | null;
}

export interface DataExtensionResponseDto {
  CustomerKey?: string;
  Name?: string;
  CategoryID?: string | number;
  isShared?: boolean;
}

export interface DataExtensionFieldResponseDto {
  Name?: string;
  FieldType?: string;
  MaxLength?: number | string;
  IsPrimaryKey?: boolean | string;
  IsRequired?: boolean | string;
}
