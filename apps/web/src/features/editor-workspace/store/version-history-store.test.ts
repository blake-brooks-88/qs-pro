import { beforeEach, describe, expect, it } from "vitest";

import { useVersionHistoryStore } from "./version-history-store";

describe("useVersionHistoryStore", () => {
  beforeEach(() => {
    useVersionHistoryStore.setState({
      isOpen: false,
      savedQueryId: null,
      selectedVersionId: null,
      showChanges: true,
    });
  });

  it("initializes with default state", () => {
    const state = useVersionHistoryStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.savedQueryId).toBeNull();
    expect(state.selectedVersionId).toBeNull();
    expect(state.showChanges).toBe(true);
  });

  describe("openVersionHistory", () => {
    it("sets isOpen, savedQueryId, and resets selection", () => {
      useVersionHistoryStore.getState().openVersionHistory("sq-1");

      const state = useVersionHistoryStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.savedQueryId).toBe("sq-1");
      expect(state.selectedVersionId).toBeNull();
      expect(state.showChanges).toBe(true);
    });

    it("resets previously selected version when opening with a new query", () => {
      useVersionHistoryStore.getState().openVersionHistory("sq-1");
      useVersionHistoryStore.getState().selectVersion("v-old");
      useVersionHistoryStore.getState().openVersionHistory("sq-2");

      const state = useVersionHistoryStore.getState();
      expect(state.savedQueryId).toBe("sq-2");
      expect(state.selectedVersionId).toBeNull();
    });

    it("does not change state when called with a non-string argument", () => {
      useVersionHistoryStore.getState().openVersionHistory("sq-1");
      const before = useVersionHistoryStore.getState();

      useVersionHistoryStore
        .getState()
        .openVersionHistory(42 as unknown as string);

      const after = useVersionHistoryStore.getState();
      expect(after.isOpen).toBe(before.isOpen);
      expect(after.savedQueryId).toBe(before.savedQueryId);
    });
  });

  describe("closeVersionHistory", () => {
    it("resets isOpen, savedQueryId, and selectedVersionId", () => {
      useVersionHistoryStore.getState().openVersionHistory("sq-1");
      useVersionHistoryStore.getState().selectVersion("v-1");
      useVersionHistoryStore.getState().closeVersionHistory();

      const state = useVersionHistoryStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.savedQueryId).toBeNull();
      expect(state.selectedVersionId).toBeNull();
    });
  });

  describe("selectVersion", () => {
    it("sets the selectedVersionId", () => {
      useVersionHistoryStore.getState().selectVersion("v-1");

      const state = useVersionHistoryStore.getState();
      expect(state.selectedVersionId).toBe("v-1");
    });

    it("clears the selectedVersionId when called with null", () => {
      useVersionHistoryStore.getState().selectVersion("v-1");
      useVersionHistoryStore.getState().selectVersion(null);

      const state = useVersionHistoryStore.getState();
      expect(state.selectedVersionId).toBeNull();
    });
  });

  describe("toggleShowChanges", () => {
    it("flips showChanges from true to false", () => {
      useVersionHistoryStore.getState().toggleShowChanges();

      const state = useVersionHistoryStore.getState();
      expect(state.showChanges).toBe(false);
    });

    it("flips showChanges from false to true", () => {
      useVersionHistoryStore.getState().toggleShowChanges();
      useVersionHistoryStore.getState().toggleShowChanges();

      const state = useVersionHistoryStore.getState();
      expect(state.showChanges).toBe(true);
    });
  });
});
