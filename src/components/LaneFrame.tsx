import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MeetCell } from "../types";
import type { CellSession } from "../lib/useMeetHub";
import { buildLaunchUrl, clampZoom, fmtDuration, MAX_ZOOM, meetCode, MIN_ZOOM } from "../lib/meet";
import { isPresent } from "../lib/attendance";
import { advanceCounter, counterMs, resolveLivePresent } from "../lib/counter";
import { Ico } from "./icons";

interface Props {
  cell: MeetCell;
  session: CellSession;
  laneNo: number;
  showCode: boolean;
  compactHeader: boolean;
  muteAudioDefault?: boolean;
  muteVideoDefault?: boolean;
  serverLive: boolean;
  serverCount: number;
  serverStatus: "waiting" | "live" | "error" | "idle";
  serverHasToken: boolean;
  serverConnected: boolean;
  onUpdate: (patch: Partial<MeetCell>) => void;
  onRestart: () => void;
  onCloseLane: () => void;
  onJoin: (name: string) => void;
  onLeave: (id: string) => void;
}

let mediaPermissionRequested = false;

/**
 * Sağ paneldeki bağımsız çerçeve.
 * Katılımcı sayısı iki kaynaktan gelir:
 *   1) Sunucu (Google Meet REST API) — gerçek, canlı, otomatik
 *   2) Manuel giriş — sunucu yokken kullanıcı kendi ekler
 * Sayaç içeride en az 1 kişi olduğunda çalışır.
 */
export default function LaneFrame(p: Props) {
  const { cell, muteAudioDefault = false, muteVideoDefault = false } = p;
  const frameRef = useRef<HTMLElement>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const code = meetCode(cell.url).replace(/\/$/, "");
  const scale = cell.zoom / 100;
  const frameSrc = buildLaunchUrl(cell, muteAudioDefault, muteVideoDefault);

  // Henüz çıkmamış manuel katılımcılar: hem listede gösterilir hem sayacı sürer.
  const manualPeople = cell.attendance.filter((person) => person.source === "manual" && isPresent(person));

  // Katılımcı sayısı iki kaynaktan gelir:
  //   1) Sunucu (Meet sekmesindeki eklenti veya Google API) → canlı sayı
  //   2) Sunucu yokken paneldekilerin elle eklediği katılımcılar
  // Eşik: odada en az 1 kişi varsa sayaç çalışır.
  const MEETING_THRESHOLD = 1;
  const usingServer = p.serverLive;
  const serverCount = p.serverCount;
  const manualPresent = manualPeople.length;
  const livePresent = resolveLivePresent(usingServer, serverCount, manualPresent);
  const participantJoined = livePresent >= MEETING_THRESHOLD;
  const meetingOn = participantJoined;

  // --- BİRİKİMLİ SAYAÇ ---
  // Odaya biri girer → başlar.
  // Oda boşalır → DURUR, süre saklanır.
  // Tekrar girer → kaldığı yerden DEVAM eder. Sayfa yenilense de saklı.
  const [guestAccum, setGuestAccum] = useState<number>(Math.max(0, Number(cell.guestAccum) || 0));
  const [draft, setDraft] = useState("");
  const segmentStartRef = useRef<number | null>(null);
  const [segmentActive, setSegmentActive] = useState(false);

  // Depodaki değer değişirse (başka sekme, geri yükleme) sayaç onu takip eder.
  useEffect(() => {
    if (segmentStartRef.current !== null) return;
    setGuestAccum(Math.max(0, Number(cell.guestAccum) || 0));
  }, [cell.guestAccum]);

  useEffect(() => {
    if (meetingOn) {
      if (segmentStartRef.current === null) {
        segmentStartRef.current = Date.now();
        setSegmentActive(true);
      }
    } else if (segmentStartRef.current !== null) {
      // Oda boşaldı: geçen süreyi topla, segmenti kapat, birikimi depoya yaz.
      const stopped = advanceCounter({ accum: guestAccum, startAt: segmentStartRef.current }, false, Date.now());
      segmentStartRef.current = null;
      setSegmentActive(false);
      setGuestAccum(stopped.accum);
      p.onUpdate({ guestAccum: stopped.accum });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingOn]);

  // Saniye tikini yalnızca bir şey akarken işlet.
  useEffect(() => {
    if (cell.openedAt === null && !segmentActive) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cell.openedAt, segmentActive]);

  useEffect(() => {
    if (!frameSrc || mediaPermissionRequested || !navigator.mediaDevices?.getUserMedia) return;
    mediaPermissionRequested = true;
    void navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then((stream) => stream.getTracks().forEach((track) => track.stop()))
      .catch(() => { /* Tarayıcı izni reddedilirse Meet kendi uyarısını gösterir. */ });
  }, [frameSrc]);

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement === frameRef.current) await document.exitFullscreen();
      else await frameRef.current?.requestFullscreen();
    } catch { /* ignore */ }
  };

  const changeZoom = (value: number) => p.onUpdate({ zoom: clampZoom(value) });

  const roomMs = cell.openedAt ? now - cell.openedAt : 0;
  const guestMs = counterMs({ accum: guestAccum, startAt: segmentStartRef.current }, now);
  const hasTime = guestMs > 0;

  const serverBadge = usingServer
    ? { cls: "on", label: `${livePresent}`, title: `Canlı takip · ${livePresent} kişi içeride · sayaç ${meetingOn ? "ÇALIŞIYOR" : "bekliyor"}` }
    : p.serverConnected
    ? { cls: "wait", label: "…", title: "Sunucu bağlı — Meet sekmesinden katılım bekleniyor (Aks rozetini kontrol edin)" }
    : manualPresent > 0
    ? { cls: "on", label: `${manualPresent}`, title: `Manuel takip · içeride ${manualPresent} kişi · elle eklenen katılımcıyla sayaç çalışıyor` }
    : { cls: "off", label: "off", title: "Sunucu bağlı değil — sunucuyu başlatın ve Meet eklentisini kurun" };

  return (
    <section ref={frameRef} className={`meet-frame ${p.compactHeader ? "compact" : ""}`} style={{ "--lane-color": cell.color } as CSSProperties}>
      <header className="meet-frame-header">
        <span className="meet-frame-number">{String(p.laneNo).padStart(2, "0")}</span>
        <div className="meet-frame-name">
          <strong>{cell.name}</strong>
          {p.showCode && <span>{code}</span>}
        </div>

        <div className="frame-timers">
          <span className={`timer room ${cell.openedAt ? "on" : ""}`} title="Oda süresi">
            <Ico.Clock className="h-3 w-3" /><time>{fmtDuration(roomMs)}</time>
          </span>
          <span className={`timer guest ${meetingOn ? "on" : hasTime ? "paused" : ""}`}
            title={meetingOn ? `ÇALIŞIYOR — ${livePresent} kişi içeride` : hasTime ? `DURDU — süre saklı, oda boşalınca durur` : `Odaya biri girince başlar — şu an ${livePresent}`}>
            <Ico.Users className="h-3 w-3" /><time>{hasTime || meetingOn ? fmtDuration(guestMs) : "00:00:00"}</time><em>{livePresent}/1</em>
          </span>
        </div>

        <span className={`live-detect ${serverBadge.cls}`} title={serverBadge.title}>
          <Ico.Users className="h-3 w-3" /><em>{serverBadge.label}</em>
        </span>

        <span className="mute-indicator" title="Ses ve kamera kapalı başlatılır">
          <Ico.MicOff className="h-3 w-3" />
          <Ico.CamOff className="h-3 w-3" />
        </span>

        <button className="frame-head-button refresh" onClick={p.onRestart} title="Sayfayı yenile" aria-label={`${cell.name} sayfasını yenile`}><Ico.Refresh /></button>
        <button className="frame-head-button" onClick={() => void fullscreen()} title="Tam ekran" aria-label={`${cell.name} çerçevesini tam ekran aç`}><Ico.Focus /></button>
        <button className="frame-head-button close" onClick={p.onCloseLane} title="Çerçeveyi kapat" aria-label={`${cell.name} çerçevesini kapat`}><Ico.X /></button>
      </header>

      <div className="meet-frame-body">
        {frameSrc ? (
          <iframe
            key={`${cell.id}-${p.session.frameKey}`}
            src={frameSrc}
            title={`${cell.name} Meet odası`}
            allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="meeting-iframe"
            style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          />
        ) : (
          <div className="compact-placeholder"><strong>Meet bağlantısı yok</strong></div>
        )}

        <div className="frame-overlay-tools">
          {usingServer && p.serverCount > 0 && (
            <span className="guest-pill live">Meet: {p.serverCount} kişi</span>
          )}
          {/* Sunucu/eklenti yokken katılımcıyı elle girmek için tek giriş kapısı. */}
          <form
            className="guest-chip"
            onSubmit={(event) => {
              event.preventDefault();
              const value = draft.trim();
              if (!value) return;
              p.onJoin(value);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Katılımcı adı"
              maxLength={80}
              aria-label={`${cell.name} katılımcı adı`}
            />
            <button type="submit" title="İçeri al — sayaç başlar" aria-label={`${cell.name} odasına katılımcı ekle`}>
              <Ico.Plus />
            </button>
          </form>
          {manualPeople.map((person) => (
            <button
              key={person.id}
              className="guest-pill live"
              onClick={() => p.onLeave(person.id)}
              title="Odadan çıkar — sayaç burada durur"
            >
              {person.name} <Ico.X className="h-3 w-3" />
            </button>
          ))}
        </div>

        <div className="zoom-flyout">
          {zoomOpen && (
            <div className="zoom-popover">
              <button onClick={() => changeZoom(cell.zoom - 10)} disabled={cell.zoom <= MIN_ZOOM} aria-label="Uzaklaştır"><Ico.Minus /></button>
              <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={10} value={cell.zoom} onChange={(event) => changeZoom(Number(event.target.value))} aria-label="Zoom seviyesi" />
              <button onClick={() => changeZoom(cell.zoom + 10)} disabled={cell.zoom >= MAX_ZOOM} aria-label="Yakınlaştır"><Ico.Plus /></button>
              <button className="zoom-percent" onClick={() => changeZoom(100)} title="Yüzde 100'e sıfırla">%{cell.zoom}</button>
              <button onClick={p.onRestart} title="Yenile"><Ico.Refresh /></button>
            </div>
          )}
          <button className={`zoom-trigger ${zoomOpen ? "active" : ""}`} onClick={() => setZoomOpen((o) => !o)} aria-expanded={zoomOpen} title={`Zoom %${cell.zoom}`}>
            <Ico.Search /><span>%{cell.zoom}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
