import { Database, AltArrowLeft, AltArrowRight, Magnifer, Folder2 } from '@solar-icons/react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  return (
    <aside 
      className={`border-r border-border bg-background flex flex-col transition-all duration-300 ${
        isOpen ? 'w-64' : 'w-12'
      }`}
    >
      <div className="flex items-center justify-between p-3 border-b border-border">
        {isOpen && (
          <span className="font-display font-semibold text-xs uppercase tracking-widest text-muted-foreground">
            Explorer
          </span>
        )}
        <button 
          onClick={onToggle}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          {isOpen ? <AltArrowLeft size={16} /> : <AltArrowRight size={16} />}
        </button>
      </div>

      {isOpen && (
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Data Extension Section */}
          <div>
            <div className="flex items-center gap-2 p-2 text-primary">
              <Database size={16} weight="Bold" />
              <span className="text-sm font-medium">Data Extensions</span>
            </div>
            <div className="mt-1 relative px-2">
               <Magnifer className="absolute left-4 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
               <input 
                 type="text" 
                 placeholder="Search DEs..." 
                 className="w-full bg-muted border border-border rounded px-8 py-1.5 text-xs focus:outline-none focus:border-primary text-foreground"
               />
            </div>
          </div>

          {/* Saved Queries Section */}
          <div>
            <div className="flex items-center gap-2 p-2 text-primary">
              <Folder2 size={16} weight="Bold" />
              <span className="text-sm font-medium">Saved Queries</span>
            </div>
          </div>
        </div>
      )}

      {!isOpen && (
        <div className="flex flex-col items-center py-4 gap-4">
          <Database size={20} className="text-muted-foreground cursor-pointer hover:text-primary" />
          <Folder2 size={20} className="text-muted-foreground cursor-pointer hover:text-primary" />
        </div>
      )}
    </aside>
  );
}
