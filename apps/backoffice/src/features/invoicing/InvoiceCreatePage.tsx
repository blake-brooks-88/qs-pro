import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { InvoiceForm } from "./components/InvoiceForm";

function InvoiceCreatePage() {
  const navigate = useNavigate();

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { void navigate("/invoicing"); }}
        >
          &larr; Back to Invoices
        </Button>
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Create Invoiced Subscription
        </h1>
      </div>
      <InvoiceForm />
    </div>
  );
}

export { InvoiceCreatePage };
