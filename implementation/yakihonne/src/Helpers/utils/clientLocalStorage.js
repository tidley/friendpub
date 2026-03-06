export const localStorage_ = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Never crash the app on localStorage quota issues.
      const name = e?.name || "";
      const msg = e?.message || "";
      const isQuota = name === "QuotaExceededError" || /quota/i.test(String(msg));
      if (!isQuota) console.warn("[localStorage_] setItem failed", e);
    }
  },
  removeItem(key) {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[localStorage_] removeItem failed", e);
    }
  },
};
