export type CellStatus = "idle" | "open" | "closed";

export interface AttendanceSession {
  id: string;
  joinedAt: number;
  leftAt: number | null;
}

export interface AttendanceParticipant {
  id: string;
  name: string;
  source: "manual" | "google";
  sessions: AttendanceSession[];
  verifiedAt?: number;
}

export interface MeetCell {
  id: string;
  name: string;
  url: string;
  color: string;
  tags: string[];
  mic: boolean;
  cam: boolean;
  volume: number;
  pinned: boolean;
  muted: boolean;
  notes: string;
  openedAt: number | null;
  createdAt: number;
  zoom: number;
  attendance: AttendanceParticipant[];
  /** Sayaç 2+ kişide durdurulduğunda biriken toplam ms (sayfa yenilense de korunur). */
  guestAccum?: number;
  example?: boolean;
}

export interface Layout {
  cols: number;
  rows: number;
}
