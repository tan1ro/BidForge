export const TRIGGER_LABELS = {
  bid_received: "Bid received in trigger window",
  rank_change: "Any bidder rank change",
  l1_change: "L1 rank change only",
};

export const BIDDER_VISIBILITY_LABELS = {
  full_rank: "Full rank visibility",
  masked_competitor: "Masked competitors",
};

export const STATUS_LABELS = {
  upcoming: "Upcoming",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
  force_closed: "Force closed",
};

export const TERMINAL_STATUSES = new Set(["closed", "force_closed"]);

const USER_SETTINGS_STORAGE_KEY = "user_settings";

const DEFAULT_USER_SETTINGS = {
  timezone: "Asia/Kolkata",
  use_24h_time: false,
  date_format: "medium",
  auto_refresh_seconds: 10,
};

export function getUserSettings() {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_USER_SETTINGS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(settings) {
  const next = { ...DEFAULT_USER_SETTINGS, ...(settings || {}) };
  localStorage.setItem(USER_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getPreferredTimezoneLabel() {
  return getUserSettings().timezone || "Asia/Kolkata";
}

export function toLocalDateTimeInputValue(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(dateStr) {
  const settings = getUserSettings();
  return new Date(dateStr).toLocaleString("en-IN", {
    timeZone: settings.timezone || "Asia/Kolkata",
    dateStyle: settings.date_format || "medium",
    timeStyle: "short",
    hour12: !settings.use_24h_time,
  });
}

export function formatCurrency(val) {
  if (val == null) return "—";
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export function openFileLink(url, fileName) {
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.click();
}

export function getTimeRemaining(targetDate, nowMs = Date.now()) {
  const targetMs = new Date(targetDate).getTime();
  if (!Number.isFinite(targetMs)) return { expired: true, text: "Expired" };
  const diff = targetMs - nowMs;
  if (diff <= 0) return { expired: true, text: "Expired" };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return {
    expired: false,
    urgent: diff < 5 * 60 * 1000,
    text: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
  };
}
