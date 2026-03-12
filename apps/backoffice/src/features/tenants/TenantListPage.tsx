import { type PaginationState, type SortingState } from "@tanstack/react-table";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { DataTableToolbar } from "@/components/ui/data-table";
import { Select } from "@/components/ui/select";

import { EidLookupDialog } from "./components/EidLookupDialog";
import { TenantTable } from "./components/TenantTable";
import { useTenants } from "./hooks/use-tenants";

const TIER_OPTIONS = [
  { label: "All Tiers", value: "" },
  { label: "Free", value: "free" },
  { label: "Pro", value: "pro" },
  { label: "Enterprise", value: "enterprise" },
] as const;

const STATUS_OPTIONS = [
  { label: "All Status", value: "" },
  { label: "Active", value: "active" },
  { label: "Trialing", value: "trialing" },
  { label: "Past Due", value: "past_due" },
  { label: "Canceled", value: "canceled" },
] as const;

const SORT_FIELD_MAP: Record<string, string> = {
  eid: "eid",
  companyName: "companyName",
  tier: "tier",
  subscriptionStatus: "subscriptionStatus",
  signupDate: "signupDate",
};

function TenantListPage() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";

  const [search, setSearch] = useState(initialSearch);
  const [tierFilter, setTierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [eidDialogOpen, setEidDialogOpen] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  const sortBy = sorting[0] ? SORT_FIELD_MAP[sorting[0].id] : undefined;
  const sortOrder = sorting[0]?.desc ? ("desc" as const) : ("asc" as const);

  const { data, isLoading } = useTenants({
    search: search || undefined,
    tier: tierFilter || undefined,
    status: statusFilter || undefined,
    sortBy,
    sortOrder: sortBy ? sortOrder : undefined,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const tenants = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalItems / pagination.pageSize));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Tenants
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEidDialogOpen(true);
          }}
        >
          EID Lookup
        </Button>
      </div>

      <DataTableToolbar
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by EID or company name..."
      >
        <Select
          value={tierFilter}
          onChange={(e) => {
            setTierFilter(e.target.value);
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
          }}
          className="h-8 w-[140px] text-xs"
        >
          {TIER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPagination((prev) => ({ ...prev, pageIndex: 0 }));
          }}
          className="h-8 w-[140px] text-xs"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </DataTableToolbar>

      <TenantTable
        data={tenants}
        isLoading={isLoading}
        pageCount={pageCount}
        totalItems={totalItems}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
      />

      <EidLookupDialog open={eidDialogOpen} onOpenChange={setEidDialogOpen} />
    </div>
  );
}

export { TenantListPage };
