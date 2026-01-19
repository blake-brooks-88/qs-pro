export interface MceAuthProvider {
  refreshToken(
    tenantId: string,
    userId: string,
    mid: string,
    forceRefresh?: boolean,
  ): Promise<{ accessToken: string; tssd: string }>;

  invalidateToken(tenantId: string, userId: string, mid: string): Promise<void>;
}

export const MCE_AUTH_PROVIDER = "MCE_AUTH_PROVIDER";
