import { uid } from "./meet";

export type ReportKind = "room-open" | "room-close" | "join" | "leave" | "whatsapp";

export interface ReportEntry {
  id: string;
  t: number;
  kind: ReportKind;
  roomId: string;
  roomName: string;
  person?: string;
  detail: string;
  ok?: boolean;
}

const KEY = "aksonline.reports.v1";
const MAX = 500;

export function loadReports(): ReportEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ReportEntry => !!item && typeof item === "object" && typeof (item as ReportEntry).id === "string");
  } catch {
    return [];
  }
}

export function saveReports(entries: ReportEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function makeReport(partial: Omit<ReportEntry, "id" | "t"> & { t?: number }): ReportEntry {
  return { id: uid(), t: partial.t ?? Date.now(), ...partial };
}

export function exportReportsCsv(entries: ReportEntry[]): void {
  const escape = (text: string) => `"${(/^\s*[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  const rows = [["Time", "Kind", "Room", "Person", "Detail", "OK"], ...entries.map((e) => [
    new Date(e.t).toISOString(), e.kind, e.roomName, e.person ?? "", e.detail, e.ok === false ? "fail" : "ok",
  ])];
  const blob = new Blob(["\uFEFF", rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aksonline-rapor.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
