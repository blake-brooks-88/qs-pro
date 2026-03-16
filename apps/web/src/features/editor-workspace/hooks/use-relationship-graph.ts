import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useFeature } from "@/hooks/use-feature";
import api from "@/services/api";

import type { DataExtensionField } from "../types";
import { buildRelationshipGraph } from "../utils/relationship-graph/build-graph";
import type {
  DEFieldMetadata,
  RelationshipGraph,
  RelationshipGraphResponse,
} from "../utils/relationship-graph/types";

const EMPTY_GRAPH: RelationshipGraph = { edges: [], exclusions: [] };
const GRAPH_STALE_TIME_MS = 10 * 60 * 1000;

export const relationshipGraphKeys = {
  all: ["relationships"] as const,
  graph: ["relationships", "graph"] as const,
};

async function fetchRelationshipGraph(): Promise<RelationshipGraphResponse> {
  const { data } = await api.get<RelationshipGraphResponse>(
    "/relationships/graph",
  );
  return data;
}

export function useRelationshipGraph(): {
  graph: RelationshipGraph;
  isLoading: boolean;
} {
  const { enabled: featureEnabled } = useFeature("smartRelationships");
  const queryClient = useQueryClient();
  const fieldsFetchingCount = useIsFetching({
    queryKey: ["metadata", "fields"],
  });

  const graphQuery = useQuery({
    queryKey: relationshipGraphKeys.graph,
    queryFn: fetchRelationshipGraph,
    staleTime: GRAPH_STALE_TIME_MS,
    enabled: featureEnabled,
  });

  const allDEMetadata = useMemo(() => {
    const cachedFieldQueries = queryClient.getQueriesData<DataExtensionField[]>(
      {
        queryKey: ["metadata", "fields"],
      },
    );

    const result: DEFieldMetadata[] = [];
    for (const [queryKey, fields] of cachedFieldQueries) {
      if (!fields || fields.length === 0) {
        continue;
      }
      const customerKey = queryKey[3] as string;
      if (!customerKey || customerKey === "unknown") {
        continue;
      }
      result.push({
        deName: customerKey,
        fields: fields.map((f) => ({
          name: f.name,
          fieldType: f.type,
          isPrimaryKey: f.isPrimaryKey,
        })),
      });
    }
    return result;
    // fieldsFetchingCount triggers recomputation when field cache entries change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, fieldsFetchingCount]);

  const graph = useMemo(() => {
    if (!featureEnabled || !graphQuery.data) {
      return EMPTY_GRAPH;
    }

    const { edges, exclusions } = graphQuery.data;
    const apiEdges = edges.filter((e) => e.source === "attribute_group");
    const userEdges = edges.filter((e) => e.source === "user");

    return buildRelationshipGraph(
      apiEdges,
      userEdges,
      exclusions,
      allDEMetadata,
    );
  }, [featureEnabled, graphQuery.data, allDEMetadata]);

  return {
    graph,
    isLoading: featureEnabled && graphQuery.isLoading,
  };
}
