import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  changeRole,
  getMembers,
  transferOwnership,
} from "@/services/admin-api";

export const adminQueryKeys = {
  all: ["admin"] as const,
  members: () => [...adminQueryKeys.all, "members"] as const,
};

export function useMembers() {
  return useQuery({
    queryKey: adminQueryKeys.members(),
    queryFn: () => getMembers(),
    staleTime: 30_000,
    select: (data) => data.members,
  });
}

export function useChangeRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      role,
    }: {
      userId: string;
      role: "admin" | "member";
    }) => changeRole(userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminQueryKeys.members(),
      });
      toast.success("Role updated successfully");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to update role";
      toast.error(message);
    },
  });
}

export function useTransferOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newOwnerId: string) => transferOwnership(newOwnerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminQueryKeys.members(),
      });
      toast.success("Ownership transferred successfully");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to transfer ownership";
      toast.error(message);
    },
  });
}
