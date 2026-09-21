import type { MeetCell } from "../types";

export const COLORS = [
  "#6366f1",
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
];

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 200;

export function clampZoom(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value / 10) * 10)) : 100;
}

/** "abc-defg-hij", tam url veya sadece kod kabul eder. */
export function normalizeMeetUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(value)) {
    return `https://meet.google.com/${value.toLowerCase()}`;
  }
  try {
    const url = new URL(/^meet\.google\.com\//i.test(value) ? `https://${value}` : value);
    if (url.protocol !== "https:" || url.hostname !== "meet.google.com" || url.username || url.password || url.port) return "";
    if (!/^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[a-z0-9_-]+|new)\/?$/i.test(url.pathname)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function meetCode(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.replace(/^\//, "");
    return seg || u.hostname;
  } catch {
    return url;
  }
}

export function makeCell(partial: Partial<MeetCell> = {}): MeetCell {
  return {
    id: uid(),
    name: partial.name || "Yeni Hücre",
    url: partial.url || "",
    color: partial.color || COLORS[Math.floor(Math.random() * COLORS.length)],
    tags: partial.tags || [],
    mic: partial.mic ?? false,
    cam: partial.cam ?? false,
    volume: partial.volume ?? 80,
    pinned: partial.pinned ?? false,
    muted: partial.muted ?? false,
    notes: partial.notes ?? "",
    openedAt: null,
    createdAt: Date.now(),
    zoom: clampZoom(partial.zoom ?? 100),
    attendance: partial.attendance ?? [],
    guestAccum: Math.max(0, Number(partial.guestAccum) || 0),
    example: partial.example ?? false,
  };
}

/**
 * Meet bağlantısını oluşturur.
 * Ses ve kamera kapalı olarak başlatmak ve otomatik odaya yönlendirmek için
 * Google Workspace / Meet URL parametreleri (authuser, hs, pli) eklenir.
 */
export function buildLaunchUrl(cell: MeetCell, muteAudio = true, muteVideo = true): string {
  const base = normalizeMeetUrl(cell.url);
  if (!base) return "";
  try {
    const u = new URL(base);
    if (u.hostname.includes("meet.google.com")) {
      u.searchParams.set("authuser", "0");
      u.searchParams.set("hs", "179");
      if (muteAudio || muteVideo) {
        u.searchParams.set("pli", "1");
      }
    }
    return u.toString();
  } catch {
    return base;
  }
}

export interface TileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Ekranı n pencereye böler (kiremit düzeni). */
export function tileRects(n: number, cols?: number): TileRect[] {
  const sw = window.screen.availWidth || 1440;
  const sh = window.screen.availHeight || 900;
  const c = cols || Math.ceil(Math.sqrt(Math.max(n, 1)));
  const r = Math.ceil(n / c);
  const w = Math.floor(sw / c);
  const h = Math.floor(sh / r);
  return Array.from({ length: n }, (_, i) => ({
    left: (i % c) * w,
    top: Math.floor(i / c) * h,
    width: w - 6,
    height: h - 6,
  }));
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
