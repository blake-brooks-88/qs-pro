import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { TenantUserDto } from "../hooks/use-tenant-detail";

interface UserListCardProps {
  users: TenantUserDto[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    return "Never";
  }
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UserListCard({ users }: UserListCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Users
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({users.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found.</p>
        ) : (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    Last Login
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, idx) => (
                  <tr
                    key={user.email ?? idx}
                    className="border-b border-border/30"
                  >
                    <td className="px-3 py-2 text-foreground">
                      {user.name ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground font-mono">
                      {user.email ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(user.lastActiveDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { UserListCard };
