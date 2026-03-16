export interface BuiltInSnippet {
  id: string;
  title: string;
  triggerPrefix: string;
  description: string;
  body: string;
  isBuiltin: true;
  category: "free" | "pro";
}

export const BUILT_IN_SNIPPETS: BuiltInSnippet[] = [
  {
    id: "builtin-sel",
    title: "SELECT from Data Extension",
    triggerPrefix: "sel",
    description: "Basic SELECT from a Data Extension",
    body: "SELECT ${1:columns}\nFROM [${2:DataExtensionName}]",
    isBuiltin: true,
    category: "free",
  },
  {
    id: "builtin-sjoin",
    title: "Subscriber Key INNER JOIN",
    triggerPrefix: "sjoin",
    description: "INNER JOIN two DEs on SubscriberKey",
    body: "SELECT\n  a.${1:Column1},\n  b.${2:Column2}\nFROM [${3:LeftDE}] a\nINNER JOIN [${4:RightDE}] b\n  ON a.SubscriberKey = b.SubscriberKey",
    isBuiltin: true,
    category: "free",
  },
  {
    id: "builtin-dist",
    title: "SELECT DISTINCT",
    triggerPrefix: "dist",
    description: "SELECT DISTINCT to deduplicate result rows",
    body: "SELECT DISTINCT ${1:columns}\nFROM [${2:DataExtensionName}]",
    isBuiltin: true,
    category: "free",
  },
  {
    id: "builtin-ljoin",
    title: "LEFT JOIN extend data",
    triggerPrefix: "ljoin",
    description: "LEFT JOIN to extend records while preserving unmatched rows",
    body: "SELECT\n  a.${1:Column1},\n  b.${2:Column2}\nFROM [${3:LeftDE}] a\nLEFT JOIN [${4:RightDE}] b\n  ON a.SubscriberKey = b.SubscriberKey",
    isBuiltin: true,
    category: "pro",
  },
  {
    id: "builtin-drel",
    title: "Date filter (relative)",
    triggerPrefix: "drel",
    description: "Filter records within the last N days using DATEADD",
    body: "WHERE ${1:DateColumn} >= DATEADD(${2:DAY}, -${3:7}, GETDATE())",
    isBuiltin: true,
    category: "pro",
  },
  {
    id: "builtin-drange",
    title: "Date range filter",
    triggerPrefix: "drange",
    description: "Filter records within an explicit date range using BETWEEN",
    body: "WHERE ${1:DateColumn} BETWEEN '${2:2024-01-01}' AND '${3:2024-12-31}'",
    isBuiltin: true,
    category: "pro",
  },
  {
    id: "builtin-dedup",
    title: "ROW_NUMBER deduplication",
    triggerPrefix: "dedup",
    description: "Deduplicate rows using ROW_NUMBER() OVER(PARTITION BY ...)",
    body: "WITH Deduped AS (\n  SELECT\n    *,\n    ROW_NUMBER() OVER (\n      PARTITION BY ${1:UniqueKeyColumn}\n      ORDER BY ${2:DateColumn} DESC\n    ) AS rn\n  FROM [${3:DataExtensionName}]\n)\nSELECT ${4:columns}\nFROM Deduped\nWHERE rn = 1",
    isBuiltin: true,
    category: "pro",
  },
  {
    id: "builtin-cntgrp",
    title: "COUNT with GROUP BY",
    triggerPrefix: "cntgrp",
    description: "Aggregate row counts grouped by a column",
    body: "SELECT ${1:GroupColumn}, COUNT(*) AS Count\nFROM [${2:DataExtension}]\nGROUP BY ${1:GroupColumn}",
    isBuiltin: true,
    category: "pro",
  },
  {
    id: "builtin-finddup",
    title: "Find duplicates",
    triggerPrefix: "finddup",
    description: "Find duplicate values using GROUP BY and HAVING COUNT > 1",
    body: "SELECT ${1:KeyColumn}, COUNT(*) AS DuplicateCount\nFROM [${2:DataExtensionName}]\nGROUP BY ${1:KeyColumn}\nHAVING COUNT(*) > 1",
    isBuiltin: true,
    category: "pro",
  },
  {
    id: "builtin-track",
    title: "Tracking data consolidation",
    triggerPrefix: "track",
    description:
      "Consolidate send, open, and click tracking data from MCE system DEs",
    body: "SELECT\n  s.SubscriberKey,\n  s.EmailAddress,\n  j.EmailName,\n  j.DeliveredTime,\n  MAX(CASE WHEN o.SubscriberKey IS NOT NULL THEN 1 ELSE 0 END) AS Opened,\n  MAX(CASE WHEN c.SubscriberKey IS NOT NULL THEN 1 ELSE 0 END) AS Clicked\nFROM _Sent s\nLEFT JOIN _Job j\n  ON s.JobID = j.JobID\nLEFT JOIN _Open o\n  ON s.JobID = o.JobID\n  AND s.SubscriberKey = o.SubscriberKey\n  AND o.IsUnique = 1\nLEFT JOIN _Click c\n  ON s.JobID = c.JobID\n  AND s.SubscriberKey = c.SubscriberKey\n  AND c.IsUnique = 1\nGROUP BY\n  s.SubscriberKey,\n  s.EmailAddress,\n  j.EmailName,\n  j.DeliveredTime",
    isBuiltin: true,
    category: "pro",
  },
];
