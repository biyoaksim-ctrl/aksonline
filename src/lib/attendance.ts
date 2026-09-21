import type { AttendanceParticipant, AttendanceSession } from "../types";
import { uid } from "./meet";

export function isPresent(person: AttendanceParticipant): boolean {
  return person.sessions.some((session) => session.leftAt === null);
}

export function isVerified(person: AttendanceParticipant, googleVerifiedAt: number | null): boolean {
  return person.source === "manual" || (googleVerifiedAt !== null && person.verifiedAt === googleVerifiedAt);
}

export function attendanceNow(person: AttendanceParticipant, now: number, googleVerifiedAt: number | null): number {
  if (isVerified(person, googleVerifiedAt)) return now;
  const lastKnownAt = person.verifiedAt ?? Math.max(0, ...person.sessions.map((session) => session.leftAt ?? session.joinedAt));
  return Math.min(now, lastKnownAt);
}

// Merge overlapping device sessions so one person's time is never counted twice.
export function intervalDuration(sessions: AttendanceSession[], now: number): number {
  const ranges = sessions
    .map((session): [number, number] => [session.joinedAt, Math.max(session.joinedAt, session.leftAt ?? now)])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let start = 0;
  let end = 0;
  for (const [from, to] of ranges) {
    if (from > end) {
      total += end - start;
      start = from;
      end = to;
    } else {
      end = Math.max(end, to);
    }
  }
  return total + end - start;
}

export function personDuration(person: AttendanceParticipant, now: number, googleVerifiedAt: number | null = null): number {
  return intervalDuration(person.sessions, attendanceNow(person, now, googleVerifiedAt));
}

export function attendanceSummary(people: AttendanceParticipant[], now: number, googleVerifiedAt: number | null = null) {
  const sessions = people.flatMap((person) => person.sessions.map((session) => ({
    ...session,
    leftAt: session.leftAt ?? attendanceNow(person, now, googleVerifiedAt),
  })));
  return {
    present: people.filter((person) => isPresent(person) && isVerified(person, googleVerifiedAt)).length,
    unverified: people.filter((person) => isPresent(person) && !isVerified(person, googleVerifiedAt)).length,
    joins: people.reduce((sum, person) => sum + person.sessions.length, 0),
    leaves: people.reduce((sum, person) => sum + person.sessions.filter((session) => session.leftAt !== null).length, 0),
    duration: intervalDuration(sessions, now),
  };
}

export function joinManual(people: AttendanceParticipant[], name: string, now: number): AttendanceParticipant[] {
  const normalized = name.trim().slice(0, 80);
  if (!normalized) return people;
  const existing = people.find((person) => person.source === "manual" && person.name.toLocaleLowerCase("tr-TR") === normalized.toLocaleLowerCase("tr-TR"));
  if (existing && isPresent(existing)) return people;
  const session: AttendanceSession = { id: uid(), joinedAt: now, leftAt: null };
  if (existing) {
    return people.map((person) => person.id === existing.id ? { ...person, sessions: [...person.sessions, session] } : person);
  }
  return [...people, { id: uid(), name: normalized, source: "manual", sessions: [session] }];
}

export function leaveManual(people: AttendanceParticipant[], id: string, now: number): AttendanceParticipant[] {
  return people.map((person) => person.id !== id || person.source !== "manual" ? person : {
    ...person,
    sessions: person.sessions.map((session) => session.leftAt !== null ? session : {
      ...session, leftAt: Math.max(now, session.joinedAt),
    }),
  });
}

export function mergeGoogleParticipants(current: AttendanceParticipant[], incoming: AttendanceParticipant[]): AttendanceParticipant[] {
  const result = new Map(current.map((person) => [person.id, person]));
  for (const person of incoming) {
    const previous = result.get(person.id);
    const sessions = new Map((previous?.sessions ?? []).map((session) => [session.id, session]));
    for (const session of person.sessions) {
      const old = sessions.get(session.id);
      sessions.set(session.id, { ...session, leftAt: session.leftAt ?? old?.leftAt ?? null });
    }
    result.set(person.id, { ...person, sessions: [...sessions.values()].sort((a, b) => a.joinedAt - b.joinedAt) });
  }
  return [...result.values()];
}

export function attendanceEvents(people: AttendanceParticipant[]) {
  return people.flatMap((person) => person.sessions.flatMap((session) => [
    { id: `${session.id}-in`, name: person.name, kind: "join" as const, at: session.joinedAt, source: person.source },
    ...(session.leftAt === null ? [] : [{ id: `${session.id}-out`, name: person.name, kind: "leave" as const, at: session.leftAt, source: person.source }]),
  ])).sort((a, b) => b.at - a.at);
}

export function downloadAttendance(name: string, people: AttendanceParticipant[], now: number, googleVerifiedAt: number | null): void {
  const escape = (text: string) => `"${(/^\s*[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  const rows = [["Participant", "Source", "Joined", "Left", "Duration (seconds)", "Status"], ...people.flatMap((person) => person.sessions.map((session) => [
    person.name, person.source, new Date(session.joinedAt).toISOString(),
    session.leftAt === null ? "" : new Date(session.leftAt).toISOString(),
    String(Math.floor(Math.max(0, (session.leftAt ?? attendanceNow(person, now, googleVerifiedAt)) - session.joinedAt) / 1000)),
    session.leftAt !== null ? "left" : !isVerified(person, googleVerifiedAt) ? "unverified" : "present",
  ]))];
  const blob = new Blob(["\uFEFF", rows.map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-z0-9_-]/gi, "_")}-attendance.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function restoreAttendance(raw: unknown): AttendanceParticipant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const person = item as Partial<AttendanceParticipant>;
    if (typeof person.id !== "string" || typeof person.name !== "string" || !Array.isArray(person.sessions)) return [];
    const sessions = person.sessions.filter((session) => session && typeof session.id === "string"
      && Number.isFinite(session.joinedAt) && session.joinedAt > 0
      && (session.leftAt === null || (Number.isFinite(session.leftAt) && session.leftAt >= session.joinedAt)));
    return [{ id: person.id, name: person.name.slice(0, 80), source: person.source === "google" ? "google" as const : "manual" as const,
      sessions, verifiedAt: Number.isFinite(person.verifiedAt) ? person.verifiedAt : undefined }];
  });
}