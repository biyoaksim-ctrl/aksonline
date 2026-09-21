import { useCallback, useEffect, useRef, useState } from "react";
import type { AttendanceParticipant } from "../types";
import { MeetApiError, readGoogleAttendance } from "./googleMeet";

export interface GoogleAttendanceState {
  status: "idle" | "connecting" | "connected" | "waiting" | "error";
  errorCode: number | null;
  lastSyncedAt: number | null;
  personCount: number;
}

const initial: GoogleAttendanceState = { status: "idle", errorCode: null, lastSyncedAt: null, personCount: 0 };

/**
 * Google Meet REST API ile katılımcı takibi.
 * Google, katılımcı olayları için webhook sunmaz; bu yüzden yoklama (polling) tek yoldur.
 * Toplantı henüz başlamadıysa hızlı, bağlandıktan sonra normal aralıkla kontrol edilir.
 */
export function useGoogleAttendance(code: string, onParticipants: (people: AttendanceParticipant[]) => void) {
  const [connection, setConnection] = useState<{ token: string } | null>(null);
  const [state, setState] = useState<GoogleAttendanceState>(initial);
  const callback = useRef(onParticipants);
  useEffect(() => { callback.current = onParticipants; }, [onParticipants]);

  useEffect(() => {
    if (!connection) return;
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    let record: string | null = null;
    let failures = 0;

    const poll = async () => {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 30000);
      // Toplantı bekleniyorsa hızlı, aktifken normal aralık.
      let delay = 15000;
      try {
        const snapshot = await readGoogleAttendance(code, connection.token, controller.signal, record);
        if (disposed) return;
        record = snapshot.ended ? null : snapshot.conferenceName;
        failures = 0;
        const observedAt = Date.now();
        const people = snapshot.people.map((person) => ({ ...person, verifiedAt: observedAt }));
        if (people.length) callback.current(people);
        setState({
          status: snapshot.waiting ? "waiting" : "connected",
          errorCode: null,
          lastSyncedAt: observedAt,
          personCount: people.filter((person) => person.sessions.some((session) => session.leftAt === null)).length,
        });
        if (snapshot.waiting) delay = 6000;
      } catch (error) {
        if (disposed) return;
        controller.abort();
        const status = error instanceof MeetApiError ? error.status : 0;
        setState((previous) => ({ ...previous, status: "error", errorCode: status }));
        if ([400, 401, 403, 404].includes(status)) {
          setConnection(null);
          return;
        }
        delay = Math.min(120000, 15000 * 2 ** ++failures);
      } finally {
        window.clearTimeout(timeout);
      }
      if (!disposed) timer = window.setTimeout(poll, delay);
    };

    void poll();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [connection, code]);

  const connect = useCallback((token: string) => {
    const clean = token.trim().replace(/^Bearer\s+/i, "");
    if (!clean) return;
    setState({ status: "connecting", errorCode: null, lastSyncedAt: null, personCount: 0 });
    // OAuth erişim tokenı yalnızca bellekte tutulur; depoya veya URL'ye yazılmaz.
    setConnection({ token: clean });
  }, []);

  const disconnect = useCallback(() => {
    setConnection(null);
    setState(initial);
  }, []);

  return { ...state, connect, disconnect, enabled: connection !== null };
}
