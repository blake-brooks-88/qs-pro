import { useMemo, useState, useRef, useEffect } from 'react';
import type { DataExtension, QueryActivityDraft } from '@/../product/sections/editor-workspace/types';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Database, Rocket, Magnifer, InfoCircle, AltArrowDown, CloseCircle } from '@solar-icons/react';
import { cn } from '@/lib/utils';

interface QueryActivityModalProps {
  isOpen: boolean;
  dataExtensions: DataExtension[];
  initialName?: string;
  onClose: () => void;
  onCreate?: (draft: QueryActivityDraft) => void;
}

export function QueryActivityModal({
  isOpen,
  dataExtensions,
  initialName,
  onClose,
  onCreate,
}: QueryActivityModalProps) {
  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [dataAction, setDataAction] = useState<QueryActivityDraft['dataAction']>('Overwrite');
  const [activityName, setActivityName] = useState(initialName ?? '');
  const [description, setDescription] = useState('');
  const [externalKey, setExternalKey] = useState('');

  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTargets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term && !isSearchFocused) return [];
    return dataExtensions.filter((de) => {
      return (
        de.name.toLowerCase().includes(term) ||
        de.customerKey.toLowerCase().includes(term)
      );
    }).slice(0, 10);
  }, [dataExtensions, search, isSearchFocused]);

  const selectedTarget = useMemo(() => {
    return dataExtensions.find((de) => de.id === selectedTargetId) || null;
  }, [dataExtensions, selectedTargetId]);

  const canCreate = Boolean(activityName.trim()) && Boolean(selectedTargetId);

  const handleSelectTarget = (de: DataExtension) => {
    setSelectedTargetId(de.id);
    setSearch('');
    setIsSearchFocused(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border p-0 overflow-hidden">
        <div className="bg-primary/5 px-6 py-8 border-b border-primary/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-inner">
              <Rocket size={28} weight="Bold" className="text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">Deploy to Automation</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Configure your query activity for Salesforce Marketing Cloud
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Identity Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Activity Name</label>
              <input
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                placeholder="e.g. Daily Active Subscribers"
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1 flex justify-between items-center">
                External Key
                <span className="text-[8px] font-normal lowercase opacity-60 italic">Optional</span>
              </label>
              <input
                value={externalKey}
                onChange={(e) => setExternalKey(e.target.value)}
                placeholder="Auto-generated if blank"
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what this query does for your future self..."
              className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[80px] resize-none transition-all"
            />
          </div>

          <div className="h-px bg-border/50 mx-2" />

          {/* Configuration Section */}
          <div className="space-y-5 bg-muted/30 p-5 rounded-xl border border-border/50">
            <div className="space-y-1.5 relative" ref={searchRef}>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Target Data Extension</label>
              
              <div className="relative">
                {selectedTarget ? (
                  <div className="flex items-center gap-3 w-full bg-background border border-primary/50 rounded-lg pl-3 pr-2 py-2 group shadow-sm">
                    <Database size={20} weight="Bold" className="text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{selectedTarget.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{selectedTarget.customerKey}</p>
                    </div>
                    <button 
                      onClick={() => setSelectedTargetId(null)}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
                    >
                      <CloseCircle size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="relative group">
                    <Magnifer size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setIsSearchFocused(true);
                      }}
                      onFocus={() => setIsSearchFocused(true)}
                      placeholder="Search by name or customer key..."
                      className="w-full bg-background border border-border rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <AltArrowDown size={18} className="text-muted-foreground" />
                    </div>
                  </div>
                )}

                {/* Dropdown Results */}
                {isSearchFocused && (
                  <div className="absolute z-10 top-full mt-1 w-full bg-background border border-border rounded-lg shadow-xl max-h-[200px] overflow-y-auto overflow-x-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    {filteredTargets.length > 0 ? (
                      filteredTargets.map((de) => (
                        <button
                          key={de.id}
                          onClick={() => handleSelectTarget(de)}
                          className="w-full text-left px-4 py-2.5 hover:bg-primary/5 flex items-center gap-3 transition-colors border-l-2 border-transparent hover:border-primary"
                        >
                          <Database size={16} className="text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{de.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{de.customerKey}</p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <InfoCircle size={24} className="mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-xs text-muted-foreground">No matching Data Extensions found</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">Data Action</label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-background/50 rounded-lg border border-border">
                {(['Overwrite', 'Append', 'Update'] as const).map((action) => (
                  <button
                    key={action}
                    onClick={() => setDataAction(action)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2 px-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all',
                      dataAction === action 
                        ? 'bg-primary text-primary-foreground shadow-md' 
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {action}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground px-1 italic">
                {dataAction === 'Overwrite' && 'Destroys all existing records and replaces them with new results.'}
                {dataAction === 'Append' && 'Adds new records to the end of the existing data extension.'}
                {dataAction === 'Update' && 'Updates existing records based on Primary Key or inserts if missing.'}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border flex items-center justify-between">
          <Button variant="ghost" onClick={onClose} className="text-xs font-bold text-muted-foreground hover:text-foreground">
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            <Button
              disabled={!canCreate}
              onClick={() => {
                if (!selectedTargetId) return;
                onCreate?.({
                  name: activityName.trim(),
                  externalKey: externalKey.trim() || undefined,
                  description: description.trim() || undefined,
                  dataAction,
                  targetDataExtensionId: selectedTargetId,
                });
                onClose();
              }}
              className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold px-6 h-10 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
            >
              <Rocket size={16} weight="Bold" className="mr-2" />
              Deploy Activity
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

