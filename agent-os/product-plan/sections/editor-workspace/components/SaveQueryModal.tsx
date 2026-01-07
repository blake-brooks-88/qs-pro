import { useState } from 'react';
import type { Folder } from '@/../product/sections/editor-workspace/types';
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Diskette, Folder as FolderIcon, InfoCircle } from '@solar-icons/react';

interface SaveQueryModalProps {
  isOpen: boolean;
  folders: Folder[];
  initialName?: string;
  initialFolderId?: string;
  onClose: () => void;
  onSave: (name: string, folderId: string) => void;
}

export function SaveQueryModal({
  isOpen,
  folders,
  initialName = '',
  initialFolderId,
  onClose,
  onSave,
}: SaveQueryModalProps) {
  const [name, setName] = useState(initialName);
  const [folderId, setFolderId] = useState(initialFolderId || (folders.find(f => f.type === 'library')?.id || ''));

  const libraryFolders = folders.filter(f => f.type === 'library');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-card border-border p-0 overflow-hidden">
        <div className="bg-primary/5 px-6 py-6 border-b border-primary/10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shadow-inner">
              <Diskette size={24} weight="Bold" className="text-primary" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl font-bold tracking-tight">Save Query</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Save this query to your personal or shared library.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Query Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly Active Subscribers"
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Target Folder</label>
            <div className="relative">
              <FolderIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full bg-muted/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
              >
                {libraryFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] text-muted-foreground">
            <InfoCircle size={16} className="shrink-0 mt-0.5" />
            <p>
              Saving to your workspace makes this query available for reuse and collaboration. It does not affect any existing Automation Studio activities.
            </p>
          </div>
        </div>

        <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border">
          <Button variant="ghost" onClick={onClose} className="text-xs font-bold text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !folderId}
            onClick={() => onSave(name.trim(), folderId)}
            className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold px-6 h-10 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
          >
            Save to Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
