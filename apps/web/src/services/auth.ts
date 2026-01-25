import api from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export interface MeResponseDto {
  user: {
    id: string;
    sfUserId: string;
    email: string | null;
    name: string | null;
  };
  tenant: {
    id: string;
    eid: string;
    tssd: string;
  };
  csrfToken: string | null;
}

export async function getMe(): Promise<MeResponseDto> {
  const { data } = await api.get<MeResponseDto>("/auth/me");
  return data;
}

export async function loginWithJwt(jwt: string): Promise<void> {
  await api.post(
    "/auth/login",
    { jwt },
    { headers: { Accept: "application/json" } },
  );
}

export async function logout(): Promise<void> {
  try {
    await api.get("/auth/logout");
  } finally {
    useAuthStore.getState().logout();
  }
}
