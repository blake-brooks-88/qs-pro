import type { CreateDataExtensionDto } from "@qpp/shared-types";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type {
  DataExtensionDraft,
  DataExtensionField,
} from "@/features/editor-workspace/types";
import { createDataExtension } from "@/services/metadata";

import { metadataQueryKeys } from "./use-metadata";

export function useCreateDataExtensionFlow(options: {
  queryClient: QueryClient;
  tenantId?: string | null;
  eid?: string;
  sqlText: string;
  onCreateDE?: () => void;
}): {
  isDEModalOpen: boolean;
  inferredFields: DataExtensionField[];
  handleCreateDE: () => Promise<void>;
  closeDEModal: () => void;
  handleSaveDataExtension: (draft: DataExtensionDraft) => Promise<void>;
} {
  const { queryClient, tenantId, eid, sqlText, onCreateDE } = options;

  const [isDEModalOpen, setIsDEModalOpen] = useState(false);
  const [inferredFields, setInferredFields] = useState<DataExtensionField[]>(
    [],
  );

  const closeDEModal = useCallback(() => {
    setIsDEModalOpen(false);
    setInferredFields([]);
  }, []);

  const handleCreateDE = useCallback(async () => {
    try {
      const [{ inferSchemaFromQuery }, { createMetadataFetcher }] =
        await Promise.all([
          import("../utils/schema-inferrer"),
          import("../utils/metadata-fetcher"),
        ]);
      const fetcher = createMetadataFetcher(queryClient, tenantId, eid);
      const fields = await inferSchemaFromQuery(sqlText, fetcher);
      setInferredFields(fields);
    } catch {
      toast.error("Could not infer schema from query");
      setInferredFields([]);
    }

    setIsDEModalOpen(true);
    onCreateDE?.();
  }, [eid, onCreateDE, queryClient, sqlText, tenantId]);

  const handleSaveDataExtension = useCallback(
    async (draft: DataExtensionDraft) => {
      const dto: CreateDataExtensionDto = {
        name: draft.name,
        ...(draft.customerKey && { customerKey: draft.customerKey }),
        folderId: draft.folderId,
        isSendable: draft.isSendable,
        subscriberKeyField: draft.subscriberKeyField,
        retention: draft.retention,
        fields: draft.fields.map(({ id: _id, ...field }) => field),
      };

      try {
        await createDataExtension(dto);
        toast.success(`Data Extension "${draft.name}" created`);
        const queryKey = metadataQueryKeys.dataExtensions(tenantId, eid);
        await queryClient.invalidateQueries({ queryKey });
        await queryClient.refetchQueries({ queryKey, type: "all" });
      } catch (error) {
        toast.error("Failed to create Data Extension", {
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
        throw error;
      }
    },
    [eid, queryClient, tenantId],
  );

  return {
    isDEModalOpen,
    inferredFields,
    handleCreateDE,
    closeDEModal,
    handleSaveDataExtension,
  };
}
