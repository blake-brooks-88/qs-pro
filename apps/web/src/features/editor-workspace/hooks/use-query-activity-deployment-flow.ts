import type { QueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { QueryActivityDraft } from "@/features/editor-workspace/types";

import { useCreateQueryActivity } from "./use-create-query-activity";
import { useLinkQuery } from "./use-link-query";
import { queryActivityFoldersQueryKeys } from "./use-query-activity-folders";

export function useQueryActivityDeploymentFlow(options: {
  queryClient: QueryClient;
  activeTabId: string | null;
  activeTab: {
    queryId?: string;
    name: string;
    content: string;
  };
  storeUpdateTabLinkState: (
    tabId: string,
    linkState: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    },
  ) => void;
}): {
  isQueryActivityModalOpen: boolean;
  openQueryActivityModal: () => void;
  closeQueryActivityModal: () => void;
  isPending: boolean;
  handleCreateQueryActivity: (draft: QueryActivityDraft) => Promise<void>;
} {
  const { queryClient, activeTabId, activeTab, storeUpdateTabLinkState } =
    options;

  const createQueryActivityMutation = useCreateQueryActivity();
  const linkMutation = useLinkQuery();

  const [isQueryActivityModalOpen, setIsQueryActivityModalOpen] =
    useState(false);

  const openQueryActivityModal = useCallback(() => {
    setIsQueryActivityModalOpen(true);
  }, []);

  const closeQueryActivityModal = useCallback(() => {
    setIsQueryActivityModalOpen(false);
  }, []);

  const applyAutoLink = useCallback(
    (linkResponse: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    }) => {
      if (!activeTabId) {
        return;
      }
      storeUpdateTabLinkState(activeTabId, {
        linkedQaCustomerKey: linkResponse.linkedQaCustomerKey,
        linkedQaName: linkResponse.linkedQaName,
      });
    },
    [activeTabId, storeUpdateTabLinkState],
  );

  const handleCreateQueryActivity = useCallback(
    async (draft: QueryActivityDraft) => {
      try {
        const result = await createQueryActivityMutation.mutateAsync({
          name: draft.name,
          customerKey: draft.externalKey,
          description: draft.description,
          categoryId: draft.categoryId,
          targetDataExtensionCustomerKey: draft.targetDataExtensionCustomerKey,
          queryText: draft.queryText,
          targetUpdateType: draft.targetUpdateType,
        });

        await queryClient.invalidateQueries({
          queryKey: queryActivityFoldersQueryKeys.all,
        });

        const savedQueryId = activeTab.queryId;
        if (savedQueryId && result.customerKey) {
          try {
            const linkResponse = await linkMutation.mutateAsync({
              savedQueryId,
              qaCustomerKey: result.customerKey,
            });
            applyAutoLink(linkResponse);
            toast.success(`Query Activity "${draft.name}" deployed and linked`);
          } catch {
            toast.success(`Query Activity "${draft.name}" deployed`, {
              description: `Object ID: ${result.objectId}`,
            });
          }
        } else {
          toast.success(`Query Activity "${draft.name}" deployed`, {
            description: `Object ID: ${result.objectId}`,
          });
        }

        setIsQueryActivityModalOpen(false);
      } catch (error) {
        let description = "An error occurred";
        if (axios.isAxiosError(error)) {
          const detail = error.response?.data?.detail;
          description = typeof detail === "string" ? detail : error.message;
        } else if (error instanceof Error) {
          description = error.message;
        }
        toast.error("Failed to deploy Query Activity", { description });
      }
    },
    [
      activeTab.queryId,
      createQueryActivityMutation,
      applyAutoLink,
      linkMutation,
      queryClient,
    ],
  );

  return {
    isQueryActivityModalOpen,
    openQueryActivityModal,
    closeQueryActivityModal,
    isPending: createQueryActivityMutation.isPending,
    handleCreateQueryActivity,
  };
}
