// Relay URL normalization helpers.
// NDK relay pool keys are exact strings, so normalize aggressively to avoid
// "relay not found in pool" due to trailing slashes / whitespace.

export const normalizeRelayUrl = (raw) => {
  if (!raw) return "";
  let s = `${raw}`.trim();
  if (!s) return "";

  // Accept inputs like "relay.damus.io" and coerce to wss.
  if (!s.startsWith("ws://") && !s.startsWith("wss://")) {
    s = `wss://${s.replace(/^https?:\/\//, "")}`;
  }

  // Strip trailing slashes.
  s = s.replace(/\/+$/, "");

  // Lowercase the scheme+host for stable matching.
  // (Path is not expected for relay URLs; if present we keep it as-is.)
  try {
    const u = new URL(s);
    const host = u.host.toLowerCase();
    const proto = u.protocol.toLowerCase();
    const pathname = u.pathname && u.pathname !== "/" ? u.pathname : "";
    return `${proto}//${host}${pathname}`;
  } catch {
    return s;
  }
};

export const normalizeRelayList = (relays) => {
  const list = Array.isArray(relays) ? relays : [];
  return [...new Set(list.map(normalizeRelayUrl).filter(Boolean))];
};
