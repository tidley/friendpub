import axiosInstance from "@/Helpers/HTTP_Client";
import { updateYakiChestStats } from "@/Helpers/Controlers";
import { store } from "@/Store/Store";
import { setUpdatedActionFromYakiChest } from "@/Store/Slides/YakiChest";

export const isYakiChestEnabled = () => {
  // Feature flag:
  // - NEXT_PUBLIC_YAKICHEST_ENABLED=1/true enables it.
  // - Default: enabled in production, disabled in dev/test.
  const raw = process.env.NEXT_PUBLIC_YAKICHEST_ENABLED;
  if (raw !== undefined) return raw === "1" || raw === "true";
  return process.env.NODE_ENV === "production";
};

export const safeUpdateYakiChest = async (action_key) => {
  if (!action_key) return;
  if (!isYakiChestEnabled()) return;

  try {
    const actionKeys = Array.isArray(action_key) ? action_key : [action_key];

    for (let key of actionKeys) {
      const data = await axiosInstance.post("/api/v1/yaki-chest", {
        action_key: key,
      });
      const { user_stats, is_updated } = data.data || {};

      if (is_updated) {
        store.dispatch(setUpdatedActionFromYakiChest(is_updated));
        updateYakiChestStats(user_stats);
      }
    }
  } catch (err) {
    // Optional stats backend; never break core flows.
    // Also avoids 404 spam in dev.
    // console.log(err);
  }
};

export const safeFetchYakiChestStats = async () => {
  if (!isYakiChestEnabled()) return null;
  try {
    const data = await axiosInstance.get("/api/v1/yaki-chest/stats");
    return data?.data || null;
  } catch (err) {
    return null;
  }
};
