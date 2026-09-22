/**
 * Google Meet REST API erişimi (sunucu tarafı).
 *
 * Not: Google, katılımcı olayları için webhook sunmaz. Bu yüzden tek yol
 * conferenceRecords -> participants -> participantSessions zincirini yoklamaktır.
 * Tarayıcı bunu yapamaz (CORS + token sızıntısı), bu yüzden sunucuda çalışır.
 */

const API = "https://meet.googleapis.com/v2/";
const FETCH_TIMEOUT_MS = 20000;

export class MeetApiError extends Error {
  constructor(status, message) {
    super(message || `Meet API ${status}`);
    this.status = status;
    this.name = "MeetApiError";
  }
}

/** Yol enjeksiyonunu engeller: yalnızca beklenen kaynak adları kabul edilir. */
function assertResourcePath(path) {
  if (!/^conferenceRecords(?:\/[a-zA-Z0-9._-]+(?:\/participants(?:\/[a-zA-Z0-9._-]+(?:\/participantSessions)?)?)?)?$/.test(path)) {
    throw new MeetApiError(400, "Geçersiz API yolu");
  }
  return path;
}

async function request(path, token, params = {}, signal) {
  assertResourcePath(path);
  const url = new URL(path, API);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const linked = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: linked,
    cache: "no-store",
    redirect: "error",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new MeetApiError(response.status, body.slice(0, 200) || `Meet API ${response.status}`);
  }
  return response.json();
}

/** Sayfalama döngüsü: sonsuz döngüyü ve mükerrer token'ları engeller. */
async function listAll(path, key, token, signal) {
  const all = [];
  const seenTokens = new Set();
  let pageToken = "";

  do {
    const page = await request(path, token, { pageSize: "250", ...(pageToken ? { pageToken } : {}) }, signal);
    if (Array.isArray(page[key])) all.push(...page[key]);
    pageToken = typeof page.nextPageToken === "string" ? page.nextPageToken : "";
    if (pageToken && seenTokens.has(pageToken)) throw new MeetApiError(502, "Sayfalama döngüsü");
    seenTokens.add(pageToken);
  } while (pageToken);

  return all;
}

/** Konferans kaydını bulur: önce aktif olan, bulunamazsa en son kayıt. */
export async function findConference(code, token, signal, knownRecord = null) {
  const normalized = String(code).toLowerCase();
  if (knownRecord) return request(knownRecord, token, {}, signal);

  const active = await request("conferenceRecords", token, {
    filter: `space.meeting_code = "${normalized}" AND end_time IS NULL`,
    pageSize: "1",
  }, signal);
  const activeRecord = active.conferenceRecords?.[0];
  if (activeRecord) return activeRecord;

  // Kayıt gecikmeli oluşabilir: koda göre en son kaydı dene.
  const latest = await request("conferenceRecords", token, {
    filter: `space.meeting_code = "${normalized}"`,
    pageSize: "5",
  }, signal);
  return latest.conferenceRecords?.[0] ?? null;
}

/**
 * Bir odanın o anki katılımcı sayısını döndürür.
 * endTime'ı boş olan oturumlar "içeride" sayılır.
 */
export async function readAttendance(code, token, signal, knownRecord = null) {
  if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(String(code))) {
    throw new MeetApiError(400, "Toplantı kodu abc-defg-hij biçiminde olmalı");
  }

  const conference = await findConference(code, token, signal, knownRecord);
  if (!conference) return { count: 0, conferenceName: null, waiting: true, ended: false, participants: [] };
  // API en son bitmiş toplantıyı döndürebilir. Eski katılımcıları yeni odaya taşımayın.
  if (conference.endTime) return { count: 0, conferenceName: null, waiting: true, ended: true, participants: [] };

  const participants = await listAll(`${conference.name}/participants`, "participants", token, signal);

  // Eşzamanlı istek sayısını sınırla: kota ve ağ yükünü dengeler.
  const limit = 3;
  const cursor = { index: 0 };
  const rows = await Promise.all(Array.from({ length: Math.min(limit, participants.length) }, async () => {
    const local = [];
    while (cursor.index < participants.length) {
      const participant = participants[cursor.index++];
      const sessions = await listAll(`${participant.name}/participantSessions`, "participantSessions", token, signal);
      local.push({ participant, sessions });
    }
    return local;
  })).then((chunks) => chunks.flat());

  const now = Date.now();
  const people = rows.map(({ participant, sessions }) => {
    const displayName =
      participant.signedinUser?.displayName ??
      participant.anonymousUser?.displayName ??
      participant.phoneUser?.displayName ??
      "Bilinmeyen katılımcı";

    const normalized = sessions.map((session) => {
      const joinedAt = Date.parse(session.startTime);
      const end = session.endTime ?? conference.endTime;
      const leftAt = end ? Date.parse(end) : null;
      if (!Number.isFinite(joinedAt)) return null;
      if (leftAt !== null && !Number.isFinite(leftAt)) return null;
      return { id: session.name, joinedAt, leftAt: leftAt === null ? null : Math.max(joinedAt, leftAt) };
    }).filter(Boolean);

    return {
      id: participant.name,
      name: displayName,
      present: normalized.some((session) => session.leftAt === null),
      sessions: normalized,
    };
  });

  const active = people.filter((person) => person.present);
  return {
    count: active.length,
    conferenceName: conference.name,
    waiting: false,
    ended: Boolean(conference.endTime),
    participants: active.map((person) => ({ id: person.id, name: person.name })),
    lastEventAt: now,
  };
}
