import * as Accordion from "@radix-ui/react-accordion";
import { AltArrowDown } from "@solar-icons/react";

import { cn } from "@/lib/utils";

import { FAQ_ITEMS } from "./pricing-data";

export function FaqAccordion() {
  return (
    <Accordion.Root type="single" collapsible className="space-y-2">
      {FAQ_ITEMS.map((item) => (
        <Accordion.Item
          key={item.question}
          value={item.question}
          className="rounded-lg border border-border bg-card overflow-hidden"
        >
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
              {item.question}
              <AltArrowDown
                size={16}
                weight="Bold"
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform duration-200",
                  "group-data-[state=open]:rotate-180",
                )}
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
            <div className="px-4 pb-3 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
