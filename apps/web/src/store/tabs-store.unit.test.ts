import { beforeEach, describe, expect, it } from "vitest";

import { useTabsStore } from "./tabs-store";

describe("useTabsStore", () => {
  beforeEach(() => {
    useTabsStore.getState().reset();
  });

  describe("createNewTab", () => {
    it("creates an untitled tab with incrementing counter", () => {
      const id1 = useTabsStore.getState().createNewTab();
      expect(id1).toBe("untitled-1");

      const id2 = useTabsStore.getState().createNewTab();
      expect(id2).toBe("untitled-2");

      const state = useTabsStore.getState();
      expect(state.tabs).toHaveLength(2);
      expect(state.tabs.at(0)?.name).toBe("Untitled-1");
      expect(state.tabs.at(1)?.name).toBe("Untitled-2");
    });

    it("sets new tab as active", () => {
      const id = useTabsStore.getState().createNewTab();
      expect(useTabsStore.getState().activeTabId).toBe(id);
    });

    it("marks new tab as isNew", () => {
      useTabsStore.getState().createNewTab();
      expect(useTabsStore.getState().tabs.at(0)?.isNew).toBe(true);
    });

    it("initializes new tab with empty content and not dirty", () => {
      useTabsStore.getState().createNewTab();
      const tab = useTabsStore.getState().tabs.at(0);
      expect(tab?.content).toBe("");
      expect(tab?.isDirty).toBe(false);
    });
  });

  describe("openQuery", () => {
    it("creates tab for query", () => {
      const id = useTabsStore
        .getState()
        .openQuery("q1", "My Query", "SELECT 1");
      expect(id).toBe("query-q1");

      const state = useTabsStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs.at(0)?.queryId).toBe("q1");
      expect(state.tabs.at(0)?.name).toBe("My Query");
      expect(state.tabs.at(0)?.content).toBe("SELECT 1");
      expect(state.tabs.at(0)?.isNew).toBe(false);
    });

    it("switches to existing tab if query already open", () => {
      useTabsStore.getState().openQuery("q1", "My Query", "SELECT 1");
      useTabsStore.getState().createNewTab();

      const id = useTabsStore
        .getState()
        .openQuery("q1", "My Query", "SELECT 1");
      expect(id).toBe("query-q1");

      const state = useTabsStore.getState();
      expect(state.tabs).toHaveLength(2); // Not 3
      expect(state.activeTabId).toBe("query-q1");
    });

    it("sets opened query as active tab", () => {
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");
      expect(useTabsStore.getState().activeTabId).toBe("query-q1");
    });

    it("does not mark opened query as dirty", () => {
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");
      expect(useTabsStore.getState().tabs.at(0)?.isDirty).toBe(false);
    });
  });

  describe("closeTab", () => {
    it("removes tab from list", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();

      useTabsStore.getState().closeTab("untitled-1");

      const state = useTabsStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs.at(0)?.id).toBe("untitled-2");
    });

    it("selects next tab when closing active tab", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().setActiveTab("untitled-1");

      useTabsStore.getState().closeTab("untitled-1");

      expect(useTabsStore.getState().activeTabId).toBe("untitled-2");
    });

    it("selects previous tab when closing last tab", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();

      useTabsStore.getState().closeTab("untitled-2");

      expect(useTabsStore.getState().activeTabId).toBe("untitled-1");
    });

    it("sets activeTabId to null when closing only tab", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().closeTab("untitled-1");

      expect(useTabsStore.getState().activeTabId).toBeNull();
    });

    it("preserves activeTabId when closing non-active tab", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().setActiveTab("untitled-2");

      useTabsStore.getState().closeTab("untitled-3");

      expect(useTabsStore.getState().activeTabId).toBe("untitled-2");
    });

    it("does nothing when closing non-existent tab", () => {
      useTabsStore.getState().createNewTab();
      const stateBefore = useTabsStore.getState().tabs.length;

      useTabsStore.getState().closeTab("non-existent");

      expect(useTabsStore.getState().tabs).toHaveLength(stateBefore);
    });
  });

  describe("setActiveTab", () => {
    it("sets active tab when tab exists", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();

      useTabsStore.getState().setActiveTab("untitled-1");

      expect(useTabsStore.getState().activeTabId).toBe("untitled-1");
    });

    it("does nothing when tab does not exist", () => {
      useTabsStore.getState().createNewTab();

      useTabsStore.getState().setActiveTab("non-existent");

      expect(useTabsStore.getState().activeTabId).toBe("untitled-1");
    });
  });

  describe("updateTabContent", () => {
    it("updates content and marks dirty for saved queries", () => {
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");

      useTabsStore.getState().updateTabContent("query-q1", "SELECT 2");

      const tab = useTabsStore.getState().tabs.at(0);
      expect(tab?.content).toBe("SELECT 2");
      expect(tab?.isDirty).toBe(true);
    });

    it("marks new tabs as dirty when content changes", () => {
      useTabsStore.getState().createNewTab();

      useTabsStore.getState().updateTabContent("untitled-1", "SELECT 1");

      expect(useTabsStore.getState().tabs.at(0)?.isDirty).toBe(true);
    });

    it("clears dirty flag when content matches original for saved queries", () => {
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");
      useTabsStore.getState().updateTabContent("query-q1", "SELECT 2");
      expect(useTabsStore.getState().tabs.at(0)?.isDirty).toBe(true);

      useTabsStore.getState().updateTabContent("query-q1", "SELECT 1");

      expect(useTabsStore.getState().tabs.at(0)?.isDirty).toBe(false);
    });
  });

  describe("markTabSaved", () => {
    it("updates tab with query ID and clears dirty", () => {
      const tabId = useTabsStore.getState().createNewTab();
      useTabsStore.getState().updateTabContent(tabId, "SELECT 1");

      useTabsStore.getState().markTabSaved(tabId, "q123", "My Saved Query");

      const state = useTabsStore.getState();
      expect(state.tabs.at(0)?.queryId).toBe("q123");
      expect(state.tabs.at(0)?.name).toBe("My Saved Query");
      expect(state.tabs.at(0)?.isDirty).toBe(false);
      expect(state.tabs.at(0)?.isNew).toBe(false);
      expect(state.activeTabId).toBe("query-q123");
    });

    it("changes tab id from untitled to query format", () => {
      const tabId = useTabsStore.getState().createNewTab();

      useTabsStore.getState().markTabSaved(tabId, "q456", "Saved");

      expect(useTabsStore.getState().tabs.at(0)?.id).toBe("query-q456");
    });
  });

  describe("renameTab", () => {
    it("updates tab name and marks dirty", () => {
      useTabsStore.getState().openQuery("q1", "Original", "SELECT 1");

      useTabsStore.getState().renameTab("query-q1", "Renamed");

      const tab = useTabsStore.getState().tabs.at(0);
      expect(tab?.name).toBe("Renamed");
      expect(tab?.isDirty).toBe(true);
    });
  });

  describe("findTabByQueryId", () => {
    it("finds tab by query ID", () => {
      useTabsStore.getState().openQuery("q1", "Query 1", "SELECT 1");
      useTabsStore.getState().openQuery("q2", "Query 2", "SELECT 2");

      const tab = useTabsStore.getState().findTabByQueryId("q2");

      expect(tab?.name).toBe("Query 2");
    });

    it("returns undefined when query not found", () => {
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");

      const tab = useTabsStore.getState().findTabByQueryId("non-existent");

      expect(tab).toBeUndefined();
    });

    it("does not find untitled tabs by query ID", () => {
      useTabsStore.getState().createNewTab();

      const tab = useTabsStore.getState().findTabByQueryId("untitled-1");

      expect(tab).toBeUndefined();
    });
  });

  describe("getActiveTab", () => {
    it("returns the active tab", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");

      const activeTab = useTabsStore.getState().getActiveTab();

      expect(activeTab?.name).toBe("Query");
    });

    it("returns undefined when no tabs exist", () => {
      const activeTab = useTabsStore.getState().getActiveTab();

      expect(activeTab).toBeUndefined();
    });
  });

  describe("hasDirtyTabs", () => {
    it("returns false when no dirty tabs", () => {
      useTabsStore.getState().createNewTab();
      expect(useTabsStore.getState().hasDirtyTabs()).toBe(false);
    });

    it("returns true when dirty tabs exist", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().updateTabContent("untitled-1", "changed");
      expect(useTabsStore.getState().hasDirtyTabs()).toBe(true);
    });
  });

  describe("getDirtyTabs", () => {
    it("returns empty array when no dirty tabs", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");

      const dirtyTabs = useTabsStore.getState().getDirtyTabs();

      expect(dirtyTabs).toHaveLength(0);
    });

    it("returns only dirty tabs", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().updateTabContent("untitled-1", "changed");

      const dirtyTabs = useTabsStore.getState().getDirtyTabs();

      expect(dirtyTabs).toHaveLength(1);
      expect(dirtyTabs.at(0)?.id).toBe("untitled-1");
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().createNewTab();
      useTabsStore.getState().openQuery("q1", "Query", "SELECT 1");

      useTabsStore.getState().reset();

      const state = useTabsStore.getState();
      expect(state.tabs).toHaveLength(0);
      expect(state.activeTabId).toBeNull();
      expect(state.untitledCounter).toBe(0);
    });
  });
});
