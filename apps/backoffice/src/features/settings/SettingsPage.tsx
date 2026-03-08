import { useState } from "react";

import { Button } from "@/components/ui/button";

import { InviteUserDialog } from "./components/InviteUserDialog";
import { UserManagementCard } from "./components/UserManagementCard";
import { useBackofficeUsers } from "./hooks/use-backoffice-users";

function SettingsPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, isLoading } = useBackofficeUsers();

  const users = data?.users ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Settings
        </h1>
        <Button size="sm" onClick={() => { setInviteOpen(true); }}>
          Invite User
        </Button>
      </div>

      <UserManagementCard users={users} isLoading={isLoading} />

      <p className="text-sm text-muted-foreground">
        More settings coming soon.
      </p>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

export { SettingsPage };
