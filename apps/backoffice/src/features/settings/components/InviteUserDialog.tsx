import { PasswordSchema } from "@qpp/shared-types";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { generatePassword } from "@/lib/password";

import { useInviteUser } from "../hooks/use-backoffice-users";

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"viewer" | "editor" | "admin">("viewer");
  const [password, setPassword] = useState("");
  const inviteUser = useInviteUser();

  const handleGenerate = () => {
    setPassword(generatePassword());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim() || !password.trim()) {
      return;
    }

    const parsed = PasswordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error("Password must be between 16 and 128 characters");
      return;
    }

    inviteUser.mutate(
      {
        email: email.trim(),
        name: name.trim(),
        role,
        temporaryPassword: password,
      },
      {
        onSuccess: () => {
          toast.success("User invited. Share temporary password securely.");
          onOpenChange(false);
          setEmail("");
          setName("");
          setRole("viewer");
          setPassword("");
        },
        onError: (err) => {
          toast.error(err.message || "Failed to invite user");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Add a new backoffice team member. Share the temporary password
              securely.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label
                htmlFor="invite-email"
                className="text-sm font-medium text-foreground"
              >
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="user@company.com"
                required
              />
            </div>
            <div>
              <label
                htmlFor="invite-name"
                className="text-sm font-medium text-foreground"
              >
                Name
              </label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder="Full Name"
                required
              />
            </div>
            <div>
              <label
                htmlFor="invite-role"
                className="text-sm font-medium text-foreground"
              >
                Role
              </label>
              <Select
                id="invite-role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as "viewer" | "editor" | "admin");
                }}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            <div>
              <label
                htmlFor="invite-password"
                className="text-sm font-medium text-foreground"
              >
                Temporary Password
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="invite-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                  }}
                  placeholder="Enter or generate..."
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                >
                  Generate
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteUser.isPending}>
              {inviteUser.isPending ? "Inviting..." : "Invite User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { InviteUserDialog };
