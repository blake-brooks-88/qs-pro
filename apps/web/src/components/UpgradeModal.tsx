import { CheckCircle, CrownStar, Rocket } from "@solar-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRO_BENEFITS = [
  "Unlimited query runs",
  "Unlimited saved queries",
  "Query execution history",
  "Target DE runs",
  "Automation Studio integration",
  "Advanced autocomplete",
  "Code minimap and quick fixes",
] as const;

export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CrownStar size={28} weight="Bold" className="text-primary" />
          </div>
          <DialogTitle className="text-xl">Unlock Query++ Pro</DialogTitle>
          <DialogDescription>
            Take your MCE query workflow to the next level with Pro features.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 py-2">
          {PRO_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2.5 text-sm">
              <CheckCircle
                size={18}
                weight="Bold"
                className="text-success shrink-0"
              />
              <span className="text-foreground">{benefit}</span>
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full gap-2"
            onClick={() => {
              toast.info("Coming soon -- Pro subscription launching soon!");
            }}
          >
            <Rocket size={16} />
            Upgrade to Pro
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={onClose}
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
