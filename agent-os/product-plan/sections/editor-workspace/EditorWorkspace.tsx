import data from '@/../product/sections/editor-workspace/data.json';
import { EditorWorkspace } from './components/EditorWorkspace';
import type { QueryTab } from '@/../product/sections/editor-workspace/types';

export default function EditorWorkspacePreview() {
  // Use data from JSON with type casting
  const typedData = data as any;

  const initialTabs: QueryTab[] = [
    {
      id: 't-1',
      queryId: 'q-101',
      name: 'Active Subscribers 30d',
      content: typedData.savedQueries[0].content,
      isDirty: false
    },
    {
      id: 't-2',
      queryId: 'q-102',
      name: 'Bounce Cleanup Script',
      content: typedData.savedQueries[1].content,
      isDirty: true
    }
  ];

  return (
    <EditorWorkspace
      folders={typedData.folders}
      savedQueries={typedData.savedQueries}
      dataExtensions={typedData.dataExtensions}
      executionResult={typedData.executionResult}
      initialTabs={initialTabs}
      isSidebarCollapsed={false}
      onRun={(mode) => console.log('Running query in mode:', mode)}
      onSave={(id, content) => console.log('Saving query content:', id, content)}
      onSaveAs={(_, name, folderId) => console.log('Saving as new query:', name, 'in folder:', folderId)}
      onFormat={() => console.log('Formatting SQL')}
      onDeploy={(id) => console.log('Deploying query to automation:', id)}
      onCreateQueryActivity={(draft) => console.log('Creating query activity:', draft)}
      onSelectQuery={(id) => console.log('Selected query from library:', id)}
      onSelectDE={(id) => console.log('Selected DE:', id)}
      onToggleSidebar={() => console.log('Sidebar toggled')}
      onPageChange={(page) => console.log('Page changed to:', page)}
      onViewInContactBuilder={(key) => console.log('Opening in Contact Builder:', key)}
      onTabClose={(id) => console.log('Tab closed:', id)}
      onTabChange={(id) => console.log('Tab changed to:', id)}
      onNewTab={() => console.log('New tab created')}
    />
  );
}
