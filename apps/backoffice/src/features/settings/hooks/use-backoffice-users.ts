import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface BackofficeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: string;
}

interface UsersResponse {
  users: BackofficeUser[];
  total: number;
}

export function useBackofficeUsers() {
  return useQuery<UsersResponse>({
    queryKey: ["backoffice-users"],
    queryFn: async () => {
      const { data } = await api.get<UsersResponse>("/settings/users");
      return data;
    },
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      email: string;
      name: string;
      role: "viewer" | "editor" | "admin";
      temporaryPassword: string;
    }) => {
      const { data } = await api.post("/settings/users/invite", params);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
    },
  });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data } = await api.patch(`/settings/users/${userId}/role`, { role });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
    },
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data } = await api.post(`/settings/users/${userId}/ban`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
    },
  });
}

export function useUnbanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data } = await api.post(`/settings/users/${userId}/unban`);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
    },
  });
}
