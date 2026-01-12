import api from "@/services/api";
import { getTierFeatures, type TenantFeatures } from "@qs-pro/shared-types";
import { isPreviewModeEnabled } from "@/utils/preview-mode";

export async function getTenantFeatures(): Promise<TenantFeatures> {
  if (isPreviewModeEnabled()) {
    return getTierFeatures("enterprise");
  }
  const { data } = await api.get<TenantFeatures>("/features");
  return data;
}
