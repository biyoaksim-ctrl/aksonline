import type { AttendanceParticipant } from "../types";

const API = "https://meet.googleapis.com/v2/";

export class MeetApiError extends Error {
  constructor(public status: number) {
    super(`Meet API: ${status}`);
  }
}

interface ConferenceRecord {
  name: string;
  endTime?: string;
}

interface GoogleParticipant {
  name: string;
  signedinUser?: { displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
}

interface GoogleSession {
  name: string;
  startTime: string;
  endTime?: string;
}

async function request<T>(path: string, token: string, signal: AbortSignal, params: Record<string, string> = {}): Promise<T> {
  if (!/^conferenceRecords(?:\/[a-zA-Z0-9_-]+(?:\/participants(?:\/[a-zA-Z0-9_-]+(?:\/participantSessions)?)?)?)?$/.test(path)) {
    throw new MeetApiError(400);
  }
  const url = new URL(path, API);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new MeetApiError(response.status);
  return response.json() as Promise<T>;
}

async function listAll<T>(path: string, key: string, token: string, signal: AbortSignal): Promise<T[]> {
  const all: T[] = [];
  const seenTokens = new Set<string>();
  let pageToken = "";
  do {
    const page = await request<Record<string, unknown>>(path, token, signal, { pageSize: "250", ...(pageToken ? { pageToken } : {}) });
    if (Array.isArray(page[key])) all.push(...(page[key] as T[]));
    pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : "";
    if (pageToken && seenTokens.has(pageToken)) throw new MeetApiError(502);
    seenTokens.add(pageToken);
  } while (pageToken);
  return all;
}

export async function readGoogleAttendance(code: string, token: string, signal: AbortSignal, previousRecord: string | null) {
  if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(code)) throw new MeetApiError(400);
  const normalizedCode = code.toLowerCase();
  let conference: ConferenceRecord | undefined;
  if (previousRecord) {
    conference = await request<ConferenceRecord>(previousRecord, token, signal);
  } else {
    // 1) Önce aktif (henüz bitmemiş) konferans kaydını ara.
    const active = await request<{ conferenceRecords?: ConferenceRecord[] }>("conferenceRecords", token, signal, {
      filter: `space.meeting_code = "${normalizedCode}" AND end_time IS NULL`,
      pageSize: "1",
    });
    conference = active.conferenceRecords?.[0];
    // 2) Bulunamazsa: kayıt yeni oluşmuş olabilir. Koda göre en son kaydı ara.
    if (!conference) {
      const latest = await request<{ conferenceRecords?: ConferenceRecord[] }>("conferenceRecords", token, signal, {
        filter: `space.meeting_code = "${normalizedCode}"`,
        pageSize: "5",
      });
      conference = latest.conferenceRecords?.[0];
    }
  }
  if (!conference) return { people: [], conferenceName: null, waiting: true, ended: false };

  const record = conference;
  const participants = await listAll<GoogleParticipant>(`${record.name}/participants`, "participants", token, signal);
  const people: AttendanceParticipant[] = [];
  let nextIndex = 0;
  // Bound parallel requests when several meeting panels are following attendance.
  await Promise.all(Array.from({ length: Math.min(3, participants.length) }, async () => {
    while (nextIndex < participants.length) {
      const participant = participants[nextIndex++];
      const sessions = await listAll<GoogleSession>(`${participant.name}/participantSessions`, "participantSessions", token, signal);
      const normalized = sessions.flatMap((session) => {
        const joinedAt = Date.parse(session.startTime);
        const end = session.endTime ?? record.endTime;
        const leftAt = end ? Date.parse(end) : null;
        if (!Number.isFinite(joinedAt) || (leftAt !== null && !Number.isFinite(leftAt))) return [];
        return [{ id: session.name, joinedAt, leftAt: leftAt === null ? null : Math.max(joinedAt, leftAt) }];
      });
      people.push({
        id: participant.name,
        name: participant.signedinUser?.displayName ?? participant.anonymousUser?.displayName ?? participant.phoneUser?.displayName ?? "Google Meet participant",
        source: "google",
        verifiedAt: Date.now(),
        sessions: normalized,
      });
    }
  }));
  return { people, conferenceName: record.name, waiting: false, ended: !!record.endTime };
}