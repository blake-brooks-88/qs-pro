export interface AliasGroup {
  semanticRole: string;
  columns: string[];
}

export const ALIAS_GROUPS: AliasGroup[] = [
  {
    semanticRole: "subscriber_identity",
    columns: [
      "subscriberkey",
      "subkey",
      "contactkey",
      "_contactkey",
      "personcontactid",
      "contactid",
      "_subscriberkey",
    ],
  },
  {
    semanticRole: "email_identity",
    columns: ["emailaddress", "email", "email_address"],
  },
  {
    semanticRole: "lead_identity",
    columns: ["leadid", "lead_id"],
  },
];

export function areAliasEquivalent(col1: string, col2: string): boolean {
  const c1 = col1.toLowerCase();
  const c2 = col2.toLowerCase();
  return ALIAS_GROUPS.some(
    (g) => g.columns.includes(c1) && g.columns.includes(c2),
  );
}
