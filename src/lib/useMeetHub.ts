import { useCallback, useEffect, useState } from "react";
import type { AttendanceParticipant, MeetCell } from "../types";
import { clampZoom, COLORS, makeCell, normalizeMeetUrl } from "./meet";
import { joinManual, leaveManual, mergeGoogleParticipants, restoreAttendance } from "./attendance";

const KEY = "meethub.cells.v4";

function loadCells(): MeetCell[] {
  for (const key of [KEY, "meethub.cells.v3", "meethub.cells.v2", "meethub.cells.v1"]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      return parsed.flatMap((value: unknown) => {
        if (!value || typeof value !== "object") return [];
        const cell = value as Partial<MeetCell>;
        if (typeof cell.id !== "string" || typeof cell.name !== "string") return [];
        return [{
          ...makeCell(),
          id: cell.id,
          name: cell.name.slice(0, 80),
          url: typeof cell.url === "string" ? normalizeMeetUrl(cell.url) : "",
          color: typeof cell.color === "string" && /^#[a-f0-9]{6}$/i.test(cell.color) ? cell.color : COLORS[0],
          tags: Array.isArray(cell.tags) ? cell.tags.filter((tag): tag is string => typeof tag === "string") : [],
          notes: typeof cell.notes === "string" ? cell.notes : "",
          pinned: cell.pinned === true,
          zoom: clampZoom(cell.zoom ?? 100),
          guestAccum: Math.max(0, Number(cell.guestAccum) || 0),
          attendance: restoreAttendance(cell.attendance),
          example: cell.example === true,
          createdAt: typeof cell.createdAt === "number" && Number.isFinite(cell.createdAt) ? cell.createdAt : Date.now(),
        }];
      });
    } catch {
      // Invalid older data must not prevent the workspace from opening.
    }
  }
  return [
    makeCell({ name: "Ana Salon", url: "https://meet.google.com/abc-defg-hij", color: COLORS[0], example: true }),
    makeCell({ name: "Ekip A", url: "https://meet.google.com/kkk-llll-mmm", color: COLORS[1], example: true }),
    makeCell({ name: "Ekip B", url: "https://meet.google.com/nnn-oooo-ppp", color: COLORS[2], example: true }),
    makeCell({ name: "Moderasyon", url: "https://meet.google.com/qqq-rrrr-sss", color: COLORS[3], example: true }),
  ];
}

export interface CellSession {
  live: boolean;
  frameKey: number;
}

const blankSession: CellSession = { live: false, frameKey: 0 };

export function useMeetHub() {
  const [cells, setCells] = useState<MeetCell[]>(loadCells);
  const [sessions, setSessions] = useState<Record<string, CellSession>>({});
  const [storageError, setStorageError] = useState(false);
  const [log, setLog] = useState<{ t: number; msg: string }[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cells));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [cells]);

  const pushLog = useCallback((msg: string) => {
    setLog((previous) => [{ t: Date.now(), msg }, ...previous].slice(0, 50));
  }, []);

  const update = useCallback((id: string, patch: Partial<MeetCell>) => {
    setCells((previous) => previous.map((cell) => cell.id === id ? {
      ...cell, ...patch, id: cell.id, zoom: clampZoom(patch.zoom ?? cell.zoom),
    } : cell));
  }, []);

  const add = useCallback((partial: Partial<MeetCell>) => {
    const cell = makeCell(partial);
    setCells((previous) => [...previous, cell]);
    pushLog(`${cell.name}: panel eklendi`);
    return cell;
  }, [pushLog]);

  const remove = useCallback((id: string, name?: string) => {
    setCells((previous) => previous.filter((cell) => cell.id !== id));
    setSessions((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    pushLog(`${name ?? "Panel"}: yerel panel silindi`);
  }, [pushLog]);

  const start = useCallback((cell: MeetCell) => {
    setSessions((previous) => previous[cell.id]?.live ? previous : {
      ...previous, [cell.id]: { live: true, frameKey: (previous[cell.id]?.frameKey ?? 0) + 1 },
    });
    setCells((previous) => previous.map((item) => item.id === cell.id ? {
      ...item, openedAt: item.openedAt ?? Date.now(),
    } : item));
    pushLog(`${cell.name}: sağ çerçeve açıldı`);
  }, [pushLog]);

  const stop = useCallback((cell: MeetCell) => {
    setSessions((previous) => ({ ...previous, [cell.id]: { ...(previous[cell.id] ?? blankSession), live: false } }));
    update(cell.id, { openedAt: null });
    // Closing a local frame is not a participant leaving Google Meet.
    pushLog(`${cell.name}: çerçeve gizlendi, katılım kayıtları korundu`);
  }, [pushLog, update]);

  const restart = useCallback((cell: MeetCell) => {
    setSessions((previous) => ({
      ...previous, [cell.id]: { live: true, frameKey: (previous[cell.id]?.frameKey ?? 0) + 1 },
    }));
    pushLog(`${cell.name}: yalnızca çerçeve yenilendi`);
  }, [pushLog]);

  const recordJoin = useCallback((id: string, name: string) => {
    const now = Date.now();
    setCells((previous) => previous.map((cell) => cell.id === id ? {
      ...cell, attendance: joinManual(cell.attendance, name, now),
    } : cell));
  }, []);

  const recordLeave = useCallback((id: string, participantId: string) => {
    const now = Date.now();
    setCells((previous) => previous.map((cell) => cell.id === id ? {
      ...cell, attendance: leaveManual(cell.attendance, participantId, now),
    } : cell));
  }, []);

  const mergeAttendance = useCallback((id: string, people: AttendanceParticipant[]) => {
    setCells((previous) => previous.map((cell) => cell.id === id ? {
      ...cell, attendance: mergeGoogleParticipants(cell.attendance, people),
    } : cell));
  }, []);

  const sessionOf = useCallback((id: string): CellSession => sessions[id] ?? blankSession, [sessions]);

  return {
    cells, log, storageError, pushLog, update, add, remove,
    start, stop, restart, sessionOf, recordJoin, recordLeave, mergeAttendance,
  };
}