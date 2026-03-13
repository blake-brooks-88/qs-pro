import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRole } from "@/hooks/use-role";
import type { MemberListItem } from "@/services/admin-api";

import {
  useChangeRole,
  useMembers,
  useTransferOwnership,
} from "../hooks/use-members";
import { RoleDropdown } from "./RoleDropdown";

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) {
    return "Never";
  }

  const date = new Date(isoDate);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${String(diffMinutes)} min ago`;
  }
  if (diffHours < 24) {
    return `${String(diffHours)} hr ago`;
  }
  if (diffDays < 30) {
    return `${String(diffDays)} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) {
    return "\u2014";
  }
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MembersTab() {
  const { role: actorRole, isOwner } = useRole();
  const { data: members, isLoading } = useMembers();
  const changeRoleMutation = useChangeRole();
  const transferMutation = useTransferOwnership();
  const [search, setSearch] = useState("");
  const [transferTarget, setTransferTarget] = useState<MemberListItem | null>(
    null,
  );

  const adminCount = useMemo(
    () => (members ?? []).filter((m) => m.role === "admin").length,
    [members],
  );

  const filteredMembers = useMemo(() => {
    if (!members) {
      return [];
    }
    if (!search.trim()) {
      return members;
    }
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q),
    );
  }, [members, search]);

  const handleRoleChange = useCallback(
    (userId: string, newRole: "admin" | "member") => {
      changeRoleMutation.mutate({ userId, role: newRole });
    },
    [changeRoleMutation],
  );

  const columns: ColumnDef<MemberListItem, unknown>[] = useMemo(() => {
    const cols: ColumnDef<MemberListItem, unknown>[] = [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.name ?? "\u2014"}
          </span>
        ),
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.email ?? "\u2014"}
          </span>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        size: 140,
        cell: ({ row }) => (
          <RoleDropdown
            currentRole={row.original.role}
            userId={row.original.id}
            isCurrentUser={false}
            actorRole={actorRole}
            onRoleChange={handleRoleChange}
            isLastAdmin={adminCount <= 1}
          />
        ),
      },
      {
        accessorKey: "lastActiveAt",
        header: "Last Active",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(row.original.lastActiveAt)}
          </span>
        ),
      },
      {
        accessorKey: "joinedAt",
        header: "Joined",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.joinedAt)}
          </span>
        ),
      },
    ];

    if (isOwner) {
      cols.push({
        id: "actions",
        header: "",
        size: 160,
        cell: ({ row }) => {
          if (row.original.role === "owner") {
            return null;
          }
          return (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setTransferTarget(row.original)}
            >
              Transfer Ownership
            </Button>
          );
        },
      });
    }

    return cols;
  }, [actorRole, adminCount, isOwner, handleRoleChange]);

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search members..."
              className="max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <DataTable
            columns={columns}
            data={filteredMembers}
            isLoading={isLoading}
            emptyMessage="No members found"
          />
        </CardContent>
      </Card>

      <Dialog
        open={transferTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTransferTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Ownership</DialogTitle>
            <DialogDescription>
              Transfer ownership to{" "}
              <span className="font-medium text-foreground">
                {transferTarget?.name ?? transferTarget?.email ?? "this user"}
              </span>
              ? You will become Admin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTransferTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={transferMutation.isPending}
              onClick={() => {
                if (transferTarget) {
                  transferMutation.mutate(transferTarget.id, {
                    onSuccess: () => setTransferTarget(null),
                  });
                }
              }}
            >
              {transferMutation.isPending
                ? "Transferring..."
                : "Transfer Ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
