import type { OrgRole } from "@qpp/shared-types";

import { Select } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RoleDropdownProps {
  currentRole: OrgRole;
  userId: string;
  isCurrentUser: boolean;
  actorRole: OrgRole;
  onRoleChange: (userId: string, newRole: "admin" | "member") => void;
  isLastAdmin?: boolean;
}

export function RoleDropdown({
  currentRole,
  userId,
  isCurrentUser,
  actorRole: _actorRole,
  onRoleChange,
  isLastAdmin = false,
}: RoleDropdownProps) {
  void _actorRole;
  if (currentRole === "owner") {
    return <span className="text-sm font-medium text-foreground">Owner</span>;
  }

  const isDisabled = isCurrentUser && isLastAdmin && currentRole === "admin";

  const disabledReason =
    isCurrentUser && isLastAdmin && currentRole === "admin"
      ? "Promote another user to Admin first"
      : undefined;

  if (isDisabled && disabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Select value={currentRole} disabled className="h-8 w-28 text-xs">
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </Select>
            </div>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Select
      value={currentRole}
      onChange={(e) =>
        onRoleChange(userId, e.target.value as "admin" | "member")
      }
      disabled={isDisabled}
      className="h-8 w-28 text-xs"
    >
      <option value="admin">Admin</option>
      <option value="member">Member</option>
    </Select>
  );
}
