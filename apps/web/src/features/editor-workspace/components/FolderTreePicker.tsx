import { AltArrowDown, AltArrowUp } from "@solar-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import type { Folder } from "@/features/editor-workspace/types";
import { cn } from "@/lib/utils";

import { getFolderAncestors, getFolderPath } from "../utils/folder-utils";
import { FolderTree } from "./FolderTree";

interface FolderTreePickerProps {
  id?: string;
  folders: Folder[];
  value: string;
  onChange: (folderId: string) => void;
  placeholder?: string;
  triggerClassName?: string;
}

export function FolderTreePicker({
  id,
  folders,
  value,
  onChange,
  placeholder = "Select a folder...",
  triggerClassName,
}: FolderTreePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;

  const displayValue = useMemo(() => {
    if (!value) {
      return null;
    }
    return getFolderPath(folders, value);
  }, [folders, value]);

  const initialExpandedIds = useMemo(() => {
    if (!value) {
      return [];
    }
    const ancestors = getFolderAncestors(folders, value);
    return ancestors.map((f) => f.id);
  }, [folders, value]);

  const handleSelect = (folderId: string) => {
    onChange(folderId);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full flex items-center justify-between gap-2 bg-muted border border-border rounded-md px-3 py-2 text-sm text-left transition-colors",
          "focus:outline-none focus:border-primary",
          "hover:border-primary/50",
          !displayValue && "text-muted-foreground",
          triggerClassName,
        )}
      >
        <span className="truncate">{displayValue ?? placeholder}</span>
        {isOpen ? (
          <AltArrowUp size={16} className="text-muted-foreground shrink-0" />
        ) : (
          <AltArrowDown size={16} className="text-muted-foreground shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            id={listboxId}
            role="listbox"
            aria-label="Folder selection"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto p-2">
              {folders.length > 0 ? (
                <FolderTree
                  folders={folders}
                  selectedId={value}
                  onSelect={handleSelect}
                  initialExpandedIds={initialExpandedIds}
                />
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No folders available
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
