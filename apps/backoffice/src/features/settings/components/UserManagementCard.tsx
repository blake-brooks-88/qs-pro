import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { generatePassword } from "@/lib/password";
import { useSession } from "@/hooks/use-session";
import { PasswordSchema } from "@qpp/shared-types";

import {
  type BackofficeUser,
  useBanUser,
  useChangeUserRole,
  useDeleteUser,
  useResetPassword,
  useUnbanUser,
} from "../hooks/use-backoffice-users";

const ROLE_VARIANT_MAP: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  editor: "secondary",
  viewer: "outline",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ConfirmAction {
  type: "role" | "ban" | "unban" | "reset-password" | "delete";
  userId: string;
  userName: string;
  newRole?: string;
}

interface UserManagementCardProps {
  users: BackofficeUser[];
  isLoading?: boolean;
}

function UserManagementCard({ users, isLoading }: UserManagementCardProps) {
  const { user: currentUser } = useSession();
  const changeRole = useChangeUserRole();
  const banUser = useBanUser();
  const unbanUser = useUnbanUser();
  const resetPassword = useResetPassword();
  const deleteUser = useDeleteUser();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  const handleConfirm = () => {
    if (!confirmAction) return;

    if (confirmAction.type === "role" && confirmAction.newRole) {
      changeRole.mutate(
        { userId: confirmAction.userId, role: confirmAction.newRole },
        {
          onSuccess: () => {
            toast.success(`Role updated to ${confirmAction.newRole}`);
            setConfirmAction(null);
          },
          onError: (err) => {
            toast.error(err.message || "Failed to change role");
          },
        },
      );
    } else if (confirmAction.type === "ban") {
      banUser.mutate(
        { userId: confirmAction.userId },
        {
          onSuccess: () => {
            toast.success("User banned");
            setConfirmAction(null);
          },
          onError: (err) => {
            toast.error(err.message || "Failed to ban user");
          },
        },
      );
    } else if (confirmAction.type === "unban") {
      unbanUser.mutate(
        { userId: confirmAction.userId },
        {
          onSuccess: () => {
            toast.success("User unbanned");
            setConfirmAction(null);
          },
          onError: (err) => {
            toast.error(err.message || "Failed to unban user");
          },
        },
      );
    } else if (confirmAction.type === "reset-password") {
      const parsed = PasswordSchema.safeParse(resetPasswordValue);
      if (!parsed.success) {
        toast.error("Password must be between 16 and 128 characters");
        return;
      }
      resetPassword.mutate(
        { userId: confirmAction.userId, newPassword: resetPasswordValue },
        {
          onSuccess: () => {
            toast.success("Password reset successfully");
            setConfirmAction(null);
            setResetPasswordValue("");
          },
          onError: (err) => {
            toast.error(err.message || "Failed to reset password");
          },
        },
      );
    } else if (confirmAction.type === "delete") {
      deleteUser.mutate(
        { userId: confirmAction.userId },
        {
          onSuccess: () => {
            toast.success("User deleted");
            setConfirmAction(null);
          },
          onError: (err) => {
            toast.error(err.message || "Failed to delete user");
          },
        },
      );
    }
  };

  const isPending = changeRole.isPending || banUser.isPending || unbanUser.isPending || resetPassword.isPending || deleteUser.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Manage backoffice team members and their roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                    Role
                  </th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                    Created
                  </th>
                  <th className="h-10 px-4 text-left font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isSelf = currentUser?.id === user.id;
                  return (
                    <tr key={user.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="h-12 px-4 font-medium">{user.name}</td>
                      <td className="h-12 px-4 text-muted-foreground">{user.email}</td>
                      <td className="h-12 px-4">
                        <Badge variant={ROLE_VARIANT_MAP[user.role] ?? "outline"}>
                          {capitalize(user.role)}
                        </Badge>
                      </td>
                      <td className="h-12 px-4">
                        <Badge variant={user.banned ? "destructive" : "success"}>
                          {user.banned ? "Banned" : "Active"}
                        </Badge>
                      </td>
                      <td className="h-12 px-4 text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="h-12 px-4">
                        <div className="flex items-center gap-2">
                          <Select
                            value={user.role}
                            onChange={(e) => {
                              if (e.target.value !== user.role) {
                                setConfirmAction({
                                  type: "role",
                                  userId: user.id,
                                  userName: user.name,
                                  newRole: e.target.value,
                                });
                              }
                            }}
                            disabled={isSelf}
                            className="h-8 w-[110px] text-xs"
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                          </Select>
                          {user.banned ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => {
                                setConfirmAction({
                                  type: "unban",
                                  userId: user.id,
                                  userName: user.name,
                                });
                              }}
                            >
                              Unban
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={isSelf}
                              onClick={() => {
                                setConfirmAction({
                                  type: "ban",
                                  userId: user.id,
                                  userName: user.name,
                                });
                              }}
                            >
                              Ban
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResetPasswordValue("");
                              setConfirmAction({
                                type: "reset-password",
                                userId: user.id,
                                userName: user.name,
                              });
                            }}
                          >
                            Reset Password
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isSelf}
                            onClick={() => {
                              setConfirmAction({
                                type: "delete",
                                userId: user.id,
                                userName: user.name,
                              });
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="h-12 px-4 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "role"
                ? `Change ${confirmAction.userName}'s role to ${confirmAction.newRole}?`
                : confirmAction?.type === "ban"
                  ? `Ban ${confirmAction?.userName}? They will be unable to log in.`
                  : confirmAction?.type === "unban"
                    ? `Unban ${confirmAction?.userName}? They will be able to log in again.`
                    : confirmAction?.type === "delete"
                      ? `Delete ${confirmAction?.userName}? This removes their account, sessions, and cannot be undone.`
                      : `Reset password for ${confirmAction?.userName}?`}
            </DialogDescription>
          </DialogHeader>
          {confirmAction?.type === "reset-password" && (
            <div className="space-y-2 py-4">
              <label htmlFor="reset-password-input" className="text-sm font-medium text-foreground">
                New Password
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="reset-password-input"
                  value={resetPasswordValue}
                  onChange={(e) => { setResetPasswordValue(e.target.value); }}
                  placeholder="Enter or generate..."
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setResetPasswordValue(generatePassword()); }}
                >
                  Generate
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setConfirmAction(null); }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "ban" || confirmAction?.type === "delete" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { UserManagementCard };
