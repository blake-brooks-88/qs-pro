import type { SqlTableReference } from "./sql-context";
import { extractTableReferences } from "./sql-context";

export interface JoinCondition {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
}

const JOIN_ON_RE =
  /\bJOIN\b[\s\S]*?\bON\b\s+([\s\S]*?)(?=\bJOIN\b|\bWHERE\b|\bGROUP\b|\bORDER\b|\bHAVING\b|\bLIMIT\b|\bUNION\b|$)/gi;

const CONDITION_RE = /(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/g;

function buildAliasMap(refs: SqlTableReference[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ref of refs) {
    if (ref.isSubquery) {
      if (ref.alias) {
        map.set(ref.alias.toLowerCase(), "__subquery__");
      }
      continue;
    }
    if (ref.scopeDepth > 0) {
      continue;
    }
    if (ref.alias) {
      map.set(ref.alias.toLowerCase(), ref.qualifiedName);
    }
    map.set(ref.qualifiedName.toLowerCase(), ref.qualifiedName);
    map.set(ref.name.toLowerCase(), ref.qualifiedName);
  }
  return map;
}

export function extractJoinConditions(sql: string): JoinCondition[] {
  const refs = extractTableReferences(sql);
  const aliasMap = buildAliasMap(refs);
  const conditions: JoinCondition[] = [];

  let joinMatch: RegExpExecArray | null = null;
  JOIN_ON_RE.lastIndex = 0;

  while ((joinMatch = JOIN_ON_RE.exec(sql)) !== null) {
    const onClause = joinMatch[1];
    if (!onClause) {
      continue;
    }

    let condMatch: RegExpExecArray | null = null;
    CONDITION_RE.lastIndex = 0;

    while ((condMatch = CONDITION_RE.exec(onClause)) !== null) {
      const [, leftAlias, leftCol, rightAlias, rightCol] = condMatch;
      if (!leftAlias || !leftCol || !rightAlias || !rightCol) {
        continue;
      }

      const leftTable = aliasMap.get(leftAlias.toLowerCase());
      const rightTable = aliasMap.get(rightAlias.toLowerCase());

      if (!leftTable || !rightTable) {
        continue;
      }

      if (leftTable === "__subquery__" || rightTable === "__subquery__") {
        continue;
      }

      conditions.push({
        leftTable,
        leftColumn: leftCol,
        rightTable,
        rightColumn: rightCol,
      });
    }
  }

  return conditions;
}
