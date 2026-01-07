import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Database, TrashBinTrash, AddCircle, InfoCircle } from '@solar-icons/react';
import { cn } from '@/lib/utils';

interface DataExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: any) => void;
}

export function DataExtensionModal({ isOpen, onClose, onSave }: DataExtensionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
              <Database size={24} weight="Bold" className="text-primary" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl font-bold">Create Data Extension</DialogTitle>
              <p className="text-xs text-muted-foreground">Define a new target table in Marketing Cloud</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Metadata Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
              <input 
                type="text" 
                placeholder="e.g. Master_Subscriber_Feed"
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer Key</label>
              <input 
                type="text" 
                placeholder="External ID"
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Fields Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fields Configuration</span>
              <button className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary-400 uppercase tracking-widest">
                <AddCircle size={14} /> Add Field
              </button>
            </div>
            
            <div className="max-h-[240px] overflow-y-auto space-y-2 pr-2">
              <FieldRow name="SubscriberKey" type="Text" length={255} isPK={true} isNullable={false} />
              <FieldRow name="EmailAddress" type="Email" length={254} isPK={false} isNullable={false} />
              <FieldRow name="CreatedDate" type="Date" isPK={false} isNullable={true} />
              <FieldRow name="Status" type="Text" length={50} isPK={false} isNullable={true} />
            </div>
          </div>

          {/* Retention Policy */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border flex items-center justify-between">
            <div className="flex gap-3">
              <InfoCircle size={20} className="text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs font-bold text-foreground">Data Retention Policy</p>
                <p className="text-[10px] text-muted-foreground">Automatically purge records or entire table after a set period.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Off</span>
              <div className="w-8 h-4 bg-muted border border-border rounded-full relative">
                <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 bg-muted-foreground rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose} className="text-xs font-bold">Cancel</Button>
          <Button
            onClick={() => {
              onSave?.({ name: 'New_Data_Extension', customerKey: 'NEW_DE', fields: [] });
              onClose();
            }}
            className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold shadow-lg shadow-primary/20"
          >
            Create Data Extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ name, type, length, isPK, isNullable }: any) {
  return (
    <div className="grid grid-cols-14 gap-2 items-center bg-card p-2 rounded border border-border/50 hover:border-primary/50 transition-colors group">
      <div className="col-span-3">
        <input type="text" defaultValue={name} className="w-full bg-transparent text-xs focus:outline-none" />
      </div>
      <div className="col-span-3">
        <select className="w-full bg-transparent text-xs focus:outline-none cursor-pointer">
          <option>{type}</option>
          <option>Number</option>
          <option>Date</option>
          <option>Boolean</option>
          <option>Decimal</option>
        </select>
      </div>
      <div className="col-span-2">
        <input type="text" defaultValue={length || ''} placeholder="Len" className="w-full bg-transparent text-xs text-center focus:outline-none" />
      </div>
      <div className="col-span-3">
        <input type="text" placeholder="Default" className="w-full bg-transparent text-xs focus:outline-none" />
      </div>
      <div className="col-span-1 flex justify-center">
        <div className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center", isPK ? "bg-primary border-primary" : "border-border")}>
          {isPK && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
        </div>
      </div>
      <div className="col-span-1 flex justify-center">
        <div className={cn("w-3.5 h-3.5 rounded-sm border flex items-center justify-center", isNullable ? "border-primary" : "border-border")}>
           {isNullable && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}
        </div>
      </div>
      <div className="col-span-1 flex justify-end">
        <button className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
          <TrashBinTrash size={14} />
        </button>
      </div>
    </div>
  );
}
