import { generateSmartAlias } from "@/features/editor-workspace/utils/alias-generator";

import type { InlineSuggestionContext, InlineSuggestionRule } from "../types";

const CONFIDENCE_ORDER: Record<string, number> = {
  confirmed: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const JOIN_KEYWORDS = new Set(["join"]);

function resolveTableName(table: {
  name: string;
  qualifiedName: string;
  isSubquery: boolean;
}): string {
  return table.isSubquery ? table.qualifiedName : table.name;
}

function isAfterJoinKeyword(ctx: InlineSuggestionContext): boolean {
  const { sqlContext } = ctx;
  if (sqlContext.lastKeyword !== "join") {
    return false;
  }

  if (sqlContext.hasFromJoinTable) {
    return false;
  }

  const textBefore = ctx.sql.slice(0, ctx.cursorIndex);
  const joinIndex = textBefore.search(/\bjoin\s*$/i);
  if (joinIndex === -1) {
    return false;
  }

  const afterJoin = textBefore.slice(joinIndex).replace(/^join\s*/i, "");
  const hasTableAfterJoin =
    /\S/.test(afterJoin) && !JOIN_KEYWORDS.has(afterJoin.trim().toLowerCase());

  return !hasTableAfterJoin;
}

export const relationshipJoinRule: InlineSuggestionRule = {
  id: "relationship-join",

  matches(ctx) {
    if (!ctx.relationshipGraph || ctx.relationshipGraph.edges.length === 0) {
      return false;
    }

    if (ctx.tablesInScope.length === 0) {
      return false;
    }

    const { sqlContext } = ctx;

    if (sqlContext.lastKeyword === "on" && !sqlContext.currentWord) {
      return true;
    }

    if (sqlContext.lastKeyword !== "join") {
      return false;
    }

    if (isAfterJoinKeyword(ctx)) {
      return true;
    }

    if (sqlContext.currentWord && !sqlContext.hasFromJoinTable) {
      return true;
    }

    return false;
  },

  async getSuggestion(ctx) {
    const { relationshipGraph, tablesInScope, existingAliases, sqlContext } =
      ctx;

    if (!relationshipGraph) {
      return null;
    }

    if (sqlContext.lastKeyword === "on") {
      return getOnConditionSuggestion(ctx);
    }

    return getJoinTableSuggestion(
      ctx,
      tablesInScope,
      existingAliases,
      sqlContext.currentWord,
    );
  },
};

function getOnConditionSuggestion(ctx: InlineSuggestionContext) {
  const { relationshipGraph, tablesInScope } = ctx;

  if (!relationshipGraph || tablesInScope.length < 2) {
    return null;
  }

  const rightTable = tablesInScope[tablesInScope.length - 1];
  const leftTable = tablesInScope[tablesInScope.length - 2];
  if (!leftTable || !rightTable) {
    return null;
  }

  const leftName = resolveTableName(leftTable).toLowerCase();
  const rightName = resolveTableName(rightTable).toLowerCase();

  const matchingEdges = relationshipGraph.edges
    .filter((edge) => {
      const srcLower = edge.sourceDE.toLowerCase();
      const tgtLower = edge.targetDE.toLowerCase();
      return (
        (srcLower === leftName && tgtLower === rightName) ||
        (srcLower === rightName && tgtLower === leftName)
      );
    })
    .sort(
      (a, b) =>
        (CONFIDENCE_ORDER[a.confidence] ?? 99) -
        (CONFIDENCE_ORDER[b.confidence] ?? 99),
    );

  if (matchingEdges.length === 0) {
    return null;
  }

  const bestEdge = matchingEdges[0];
  if (!bestEdge) {
    return null;
  }

  const leftAlias = leftTable.alias ?? leftTable.qualifiedName;
  const rightAlias = rightTable.alias ?? rightTable.qualifiedName;

  const isLeftSource = bestEdge.sourceDE.toLowerCase() === leftName;
  const leftCol = isLeftSource ? bestEdge.sourceColumn : bestEdge.targetColumn;
  const rightCol = isLeftSource ? bestEdge.targetColumn : bestEdge.sourceColumn;

  const text = `${leftAlias}.${leftCol} = ${rightAlias}.${rightCol}`;
  const alternatives = matchingEdges.slice(1, 4).map((edge) => {
    const isSource = edge.sourceDE.toLowerCase() === leftName;
    const lCol = isSource ? edge.sourceColumn : edge.targetColumn;
    const rCol = isSource ? edge.targetColumn : edge.sourceColumn;
    return `${leftAlias}.${lCol} = ${rightAlias}.${rCol}`;
  });

  return {
    text,
    priority: 65,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}

function getJoinTableSuggestion(
  ctx: InlineSuggestionContext,
  tablesInScope: InlineSuggestionContext["tablesInScope"],
  existingAliases: Set<string>,
  currentWord: string,
) {
  const { relationshipGraph } = ctx;
  if (!relationshipGraph) {
    return null;
  }

  const tablesInScopeNames = new Set(
    tablesInScope.map((t) => resolveTableName(t).toLowerCase()),
  );

  const candidateMap = new Map<
    string,
    {
      targetDE: string;
      sourceColumn: string;
      targetColumn: string;
      confidence: string;
      leftAlias: string;
    }
  >();

  for (const edge of relationshipGraph.edges) {
    const srcLower = edge.sourceDE.toLowerCase();
    const tgtLower = edge.targetDE.toLowerCase();

    if (tablesInScopeNames.has(srcLower) && !tablesInScopeNames.has(tgtLower)) {
      const sourceTable = tablesInScope.find(
        (t) => resolveTableName(t).toLowerCase() === srcLower,
      );
      if (
        !candidateMap.has(tgtLower) ||
        isBetterConfidence(
          edge.confidence,
          candidateMap.get(tgtLower)?.confidence,
        )
      ) {
        candidateMap.set(tgtLower, {
          targetDE: edge.targetDE,
          sourceColumn: edge.sourceColumn,
          targetColumn: edge.targetColumn,
          confidence: edge.confidence,
          leftAlias:
            sourceTable?.alias ?? sourceTable?.qualifiedName ?? edge.sourceDE,
        });
      }
    }

    if (tablesInScopeNames.has(tgtLower) && !tablesInScopeNames.has(srcLower)) {
      const sourceTable = tablesInScope.find(
        (t) => resolveTableName(t).toLowerCase() === tgtLower,
      );
      if (
        !candidateMap.has(srcLower) ||
        isBetterConfidence(
          edge.confidence,
          candidateMap.get(srcLower)?.confidence,
        )
      ) {
        candidateMap.set(srcLower, {
          targetDE: edge.sourceDE,
          sourceColumn: edge.targetColumn,
          targetColumn: edge.sourceColumn,
          confidence: edge.confidence,
          leftAlias:
            sourceTable?.alias ?? sourceTable?.qualifiedName ?? edge.targetDE,
        });
      }
    }
  }

  let candidates = Array.from(candidateMap.values());

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(
    (a, b) =>
      (CONFIDENCE_ORDER[a.confidence] ?? 99) -
      (CONFIDENCE_ORDER[b.confidence] ?? 99),
  );

  const prefix = currentWord.toLowerCase();
  if (prefix) {
    candidates = candidates.filter((c) =>
      c.targetDE.toLowerCase().startsWith(prefix),
    );
    if (candidates.length === 0) {
      return null;
    }
  }

  const buildSuggestionText = (
    candidate: (typeof candidates)[0],
    isPartial: boolean,
  ) => {
    const alias = generateSmartAlias(
      candidate.targetDE.replace(/^ENT\./i, ""),
      existingAliases,
    );
    const aliasPart = alias ? ` ${alias}` : "";
    const rightRef = alias ?? candidate.targetDE;
    const onClause = ` ON ${candidate.leftAlias}.${candidate.sourceColumn} = ${rightRef}.${candidate.targetColumn}`;

    if (isPartial) {
      const remainder = candidate.targetDE.slice(currentWord.length);
      return `${remainder}${aliasPart}${onClause}`;
    }

    return `${candidate.targetDE}${aliasPart}${onClause}`;
  };

  const isPartial = prefix.length > 0;
  const bestCandidate = candidates[0];
  if (!bestCandidate) {
    return null;
  }

  const text = buildSuggestionText(bestCandidate, isPartial);
  const alternatives = candidates
    .slice(1, 4)
    .map((c) => buildSuggestionText(c, isPartial));

  return {
    text,
    priority: 90,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}

function isBetterConfidence(
  newConf: string,
  existingConf: string | undefined,
): boolean {
  if (!existingConf) {
    return true;
  }
  return (
    (CONFIDENCE_ORDER[newConf] ?? 99) < (CONFIDENCE_ORDER[existingConf] ?? 99)
  );
}
