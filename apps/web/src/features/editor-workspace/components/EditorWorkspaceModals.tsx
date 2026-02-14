import type { AutomationInfo, LinkQueryResponse } from "@qpp/shared-types";
import type { QueryClient } from "@tanstack/react-query";

import type {
  DataExtension,
  DataExtensionDraft,
  DataExtensionField,
  Folder,
  QueryActivityDraft,
  TargetUpdateType,
} from "@/features/editor-workspace/types";

import type { UnlinkTarget } from "../hooks/use-unlink-flow";
import { DataExtensionModal } from "./DataExtensionModal";
import { DriftDetectionDialog } from "./DriftDetectionDialog";
import { ImportQueryModal } from "./ImportQueryModal";
import { LinkQueryModal } from "./LinkQueryModal";
import { PublishConfirmationDialog } from "./PublishConfirmationDialog";
import { QueryActivityModal } from "./QueryActivityModal";
import { SaveQueryModal } from "./SaveQueryModal";
import { TargetDataExtensionModal } from "./TargetDataExtensionModal";
import { UnlinkModal } from "./UnlinkModal";

export function EditorWorkspaceModals(props: {
  tenantId?: string | null;
  eid?: string;
  folders: Folder[];
  qaFolders: Folder[];
  dataExtensions: DataExtension[];
  queryClient: QueryClient;

  dataExtensionModal: {
    isOpen: boolean;
    onClose: () => void;
    initialFields: DataExtensionField[];
    onSave: (draft: DataExtensionDraft) => Promise<void>;
  };

  queryActivityModal: {
    isOpen: boolean;
    initialName?: string;
    isPending: boolean;
    onClose: () => void;
    onSubmit: (draft: QueryActivityDraft) => Promise<void>;
    queryText: string;
  };

  linkQueryModal: {
    isOpen: boolean;
    linkTargetInfo: { id: string; name: string; sql: string } | null;
    onClose: () => void;
    onLinkComplete: (linkResponse: LinkQueryResponse) => void;
    onCreateNew: () => void;
  };

  importQueryModal: {
    isOpen: boolean;
    onClose: () => void;
    onImportSaved: (queryId: string, name: string, sqlText: string) => void;
    onOpenInEditor: (sqlText: string, qaName: string) => void;
  };

  publishDialog: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isPending: boolean;
    qaName: string;
    currentAsSql: string | null;
    versionSql: string;
    automations: AutomationInfo[];
    isLoadingBlastRadius: boolean;
    blastRadiusError: boolean;
  };

  unlinkModal: {
    target: UnlinkTarget | null;
    onClose: () => void;
    onUnlinkComplete: (options: {
      deleteLocal: boolean;
      deleteRemote: boolean;
    }) => void;
  };

  driftDialog: {
    isOpen: boolean;
    onClose: () => void;
    localSql: string;
    remoteSql: string;
    qaName: string;
    onKeepMine: () => void;
    onAcceptTheirs: () => void;
    isPending: boolean;
  };

  targetDataExtensionModal: {
    isOpen: boolean;
    onClose: () => void;
    sqlText: string;
    onSelect: (customerKey: string, targetUpdateType: TargetUpdateType) => void;
  };

  saveQueryModal: {
    isOpen: boolean;
    content: string;
    initialName: string;
    onClose: () => void;
    onSaveSuccess: (queryId: string, name: string) => void;
  };
}) {
  const {
    tenantId,
    eid,
    folders,
    qaFolders,
    dataExtensions,
    queryClient,
    dataExtensionModal,
    queryActivityModal,
    linkQueryModal,
    importQueryModal,
    publishDialog,
    unlinkModal,
    driftDialog,
    targetDataExtensionModal,
    saveQueryModal,
  } = props;

  return (
    <>
      <DataExtensionModal
        isOpen={dataExtensionModal.isOpen}
        onClose={dataExtensionModal.onClose}
        onSave={dataExtensionModal.onSave}
        initialFields={dataExtensionModal.initialFields}
        folders={folders.filter((f) => f.type === "data-extension")}
        dataExtensions={dataExtensions}
      />

      <QueryActivityModal
        isOpen={queryActivityModal.isOpen}
        tenantId={tenantId}
        eid={eid}
        dataExtensions={dataExtensions}
        folders={qaFolders}
        deFolders={folders}
        queryClient={queryClient}
        queryText={queryActivityModal.queryText}
        initialName={queryActivityModal.initialName}
        isPending={queryActivityModal.isPending}
        onClose={queryActivityModal.onClose}
        onSubmit={queryActivityModal.onSubmit}
      />

      {linkQueryModal.linkTargetInfo ? (
        <LinkQueryModal
          isOpen={linkQueryModal.isOpen}
          onClose={linkQueryModal.onClose}
          savedQueryId={linkQueryModal.linkTargetInfo.id}
          savedQueryName={linkQueryModal.linkTargetInfo.name}
          currentSql={linkQueryModal.linkTargetInfo.sql}
          onLinkComplete={linkQueryModal.onLinkComplete}
          onCreateNew={linkQueryModal.onCreateNew}
        />
      ) : null}

      <ImportQueryModal
        isOpen={importQueryModal.isOpen}
        onClose={importQueryModal.onClose}
        onImportSaved={importQueryModal.onImportSaved}
        onOpenInEditor={importQueryModal.onOpenInEditor}
      />

      <PublishConfirmationDialog
        isOpen={publishDialog.isOpen}
        onClose={publishDialog.onClose}
        onConfirm={publishDialog.onConfirm}
        isPending={publishDialog.isPending}
        qaName={publishDialog.qaName}
        currentAsSql={publishDialog.currentAsSql}
        versionSql={publishDialog.versionSql}
        automations={publishDialog.automations}
        isLoadingBlastRadius={publishDialog.isLoadingBlastRadius}
        blastRadiusError={publishDialog.blastRadiusError}
      />

      {unlinkModal.target ? (
        <UnlinkModal
          open
          onClose={unlinkModal.onClose}
          savedQueryId={unlinkModal.target.savedQueryId}
          savedQueryName={unlinkModal.target.savedQueryName}
          linkedQaName={unlinkModal.target.linkedQaName}
          linkedQaCustomerKey={unlinkModal.target.linkedQaCustomerKey}
          onUnlinkComplete={unlinkModal.onUnlinkComplete}
        />
      ) : null}

      <DriftDetectionDialog
        isOpen={driftDialog.isOpen}
        onClose={driftDialog.onClose}
        localSql={driftDialog.localSql}
        remoteSql={driftDialog.remoteSql}
        qaName={driftDialog.qaName}
        onKeepMine={driftDialog.onKeepMine}
        onAcceptTheirs={driftDialog.onAcceptTheirs}
        isPending={driftDialog.isPending}
      />

      <TargetDataExtensionModal
        isOpen={targetDataExtensionModal.isOpen}
        tenantId={tenantId}
        eid={eid}
        dataExtensions={dataExtensions}
        folders={folders}
        queryClient={queryClient}
        sqlText={targetDataExtensionModal.sqlText}
        onClose={targetDataExtensionModal.onClose}
        onSelect={targetDataExtensionModal.onSelect}
      />

      <SaveQueryModal
        isOpen={saveQueryModal.isOpen}
        content={saveQueryModal.content}
        initialName={saveQueryModal.initialName}
        onClose={saveQueryModal.onClose}
        onSaveSuccess={saveQueryModal.onSaveSuccess}
      />
    </>
  );
}
