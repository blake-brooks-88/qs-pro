import type { CreateDataExtensionDto } from "@qpp/shared-types";
import { AltArrowLeft, CheckCircle } from "@solar-icons/react";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type {
  DataExtension,
  DataExtensionDraft,
  DataExtensionField,
  Folder,
} from "@/features/editor-workspace/types";
import { cn } from "@/lib/utils";
import { createDataExtension } from "@/services/metadata";

import { metadataQueryKeys } from "../hooks/use-metadata";
import { DataExtensionForm } from "./DataExtensionForm";

export interface TargetDECreationViewProps {
  tenantId?: string | null;
  eid?: string;
  sqlText: string;
  folders: Folder[];
  dataExtensions: DataExtension[];
  queryClient: QueryClient;
  onBack: () => void;
  onCreated: (newDE: DataExtension) => void;
}

function generateDEName(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  return `TargetDE_${timestamp}`;
}

export function TargetDECreationView({
  tenantId,
  eid,
  sqlText,
  folders,
  dataExtensions,
  queryClient,
  onBack,
  onCreated,
}: TargetDECreationViewProps) {
  const [inferredFields, setInferredFields] = useState<DataExtensionField[]>(
    [],
  );
  const [isInferring, setIsInferring] = useState(true);
  const [inferError, setInferError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdDEName, setCreatedDEName] = useState<string | null>(null);

  const initialName = useMemo(() => generateDEName(), []);

  useEffect(() => {
    let cancelled = false;

    const inferSchema = async () => {
      setIsInferring(true);
      setInferError(null);

      try {
        const [{ inferSchemaFromQuery }, { createMetadataFetcher }] =
          await Promise.all([
            import("../utils/schema-inferrer"),
            import("../utils/metadata-fetcher"),
          ]);

        const fetcher = createMetadataFetcher(queryClient, tenantId, eid);
        const fields = await inferSchemaFromQuery(sqlText, fetcher);

        if (!cancelled) {
          setInferredFields(fields);
        }
      } catch {
        if (!cancelled) {
          setInferError(
            "Could not infer schema from query. Define fields manually.",
          );
          toast.warning("Could not infer schema from query", {
            description: "You can define fields manually.",
          });
        }
      } finally {
        if (!cancelled) {
          setIsInferring(false);
        }
      }
    };

    void inferSchema();

    return () => {
      cancelled = true;
    };
  }, [sqlText, queryClient, tenantId, eid]);

  const handleSubmit = async (draft: DataExtensionDraft) => {
    setIsSubmitting(true);

    try {
      const dto: CreateDataExtensionDto = {
        name: draft.name,
        ...(draft.customerKey && { customerKey: draft.customerKey }),
        folderId: draft.folderId,
        isSendable: draft.isSendable,
        subscriberKeyField: draft.subscriberKeyField,
        retention: draft.retention,
        fields: draft.fields.map(({ id: _id, ...field }) => field),
      };

      const result = await createDataExtension(dto);

      const resolvedKey = draft.customerKey || result.objectId;
      const newDE: DataExtension = {
        id: resolvedKey,
        name: draft.name,
        customerKey: resolvedKey,
        folderId: draft.folderId,
        description: "",
        fields: draft.fields,
        isShared: false,
      };

      queryClient.setQueryData<DataExtension[]>(
        metadataQueryKeys.dataExtensions(tenantId, eid),
        (old) => (old ? [newDE, ...old] : [newDE]),
      );

      // Seed the fields cache so compatibility check works immediately
      const fieldsForCache: DataExtensionField[] = draft.fields.map(
        ({ id: _id, ...field }) => field,
      );
      queryClient.setQueryData(
        metadataQueryKeys.fields(tenantId, newDE.customerKey),
        fieldsForCache,
      );

      setCreatedDEName(draft.name);
      setShowSuccess(true);
      toast.success(`Created: ${draft.name}`);

      setTimeout(() => {
        onCreated(newDE);
      }, 1000);
    } catch (error) {
      toast.error("Failed to create Data Extension", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-4">
          <CheckCircle size={40} weight="Bold" className="text-success" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-1">
          Data Extension Created
        </h3>
        <p className="text-sm text-muted-foreground">{createdDEName}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Selecting as target...
        </p>
      </div>
    );
  }

  if (isInferring) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-10 w-full bg-muted rounded" />
          <div className="h-10 w-full bg-muted rounded" />
          <div className="h-32 w-full bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col max-h-[80vh]">
      <div className="px-6 pt-6 pb-4 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Create Target Data Extension
          </h2>
          {inferError ? (
            <p className="text-xs text-amber-500 mt-0.5">{inferError}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Schema inferred from query ({inferredFields.length} fields)
            </p>
          )}
        </div>
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors",
            isSubmitting && "opacity-50 cursor-not-allowed",
          )}
        >
          <AltArrowLeft size={14} />
          Back to selection
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        <DataExtensionForm
          initialFields={inferredFields}
          initialName={initialName}
          folders={folders}
          dataExtensions={dataExtensions}
          onSubmit={handleSubmit}
          onCancel={onBack}
          submitLabel="Create Data Extension"
          isSubmitting={isSubmitting}
          showCancel={false}
        />
      </div>
    </div>
  );
}
