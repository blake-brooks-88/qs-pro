import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useFeature } from "@/hooks/use-feature";
import api from "@/services/api";

import { buildRelationshipGraph } from "../utils/relationship-graph/build-graph";
import type {
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

  const graphQuery = useQuery({
    queryKey: relationshipGraphKeys.graph,
    queryFn: fetchRelationshipGraph,
    staleTime: GRAPH_STALE_TIME_MS,
    enabled: featureEnabled,
  });

  const graph = useMemo(() => {
    if (!featureEnabled || !graphQuery.data) {
      return EMPTY_GRAPH;
    }

    const { edges, exclusions } = graphQuery.data;
    const apiEdges = edges.filter((e) => e.source === "attribute_group");
    const userEdges = edges.filter((e) => e.source === "user");

    return buildRelationshipGraph(apiEdges, userEdges, exclusions, []);
  }, [featureEnabled, graphQuery.data]);

  return {
    graph,
    isLoading: featureEnabled && graphQuery.isLoading,
  };
}
