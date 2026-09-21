import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { MeetCell } from "../types";
import type { CellSession } from "../lib/useMeetHub";
import { buildLaunchUrl, clampZoom, fmtDuration, MAX_ZOOM, meetCode, MIN_ZOOM } from "../lib/meet";
import { isPresent } from "../lib/attendance";
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

/**
 * Sağ paneldeki bağımsız çerçeve.
 * Katılımcı sayısı iki kaynaktan gelir:
 *   1) Sunucu (Google Meet REST API) — gerçek, canlı, otomatik
 *   2) Manuel giriş — sunucu yokken kullanıcı kendi ekler
 * Sayaç yalnızca içeride 2+ kişi olduğunda çalışır.
 */
export default function LaneFrame(p: Props) {
  const { cell, muteAudioDefault = true, muteVideoDefault = true } = p;
  const frameRef = useRef<HTMLElement>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const code = meetCode(cell.url).replace(/\/$/, "");
  const scale = cell.zoom / 100;
  const frameSrc = buildLaunchUrl(cell, muteAudioDefault, muteVideoDefault);

  // Katılımcı sayısı: sunucu CANLI veri veriyorsa o sayı, yoksa manuel kayıt.
  // Eşik: 2 ve üstü olunca sayaç çalışır.
  const MEETING_THRESHOLD = 2;
  const serverCount = p.serverLive ? p.serverCount : 0;
  const manualPresent = cell.attendance.filter((person) => isPresent(person));
  const livePresent = p.serverLive ? serverCount : manualPresent.length;
  const usingServer = p.serverLive;
  const meetingOn = livePresent >= MEETING_THRESHOLD;

  // --- BİRİKİMLİ SAYAÇ ---
  // Karşıdan biri girer (2. kişi) → başlar.
  // Çıkar (1 kalır) → DURUR, süre saklanır.
  // Tekrar girer → kaldığı yerden DEVAM eder. Sayfa yenilense de saklı.
  const [guestAccum, setGuestAccum] = useState<number>(Math.max(0, Number(cell.guestAccum) || 0));
  const segmentStartRef = useRef<number | null>(null);
  const [segmentActive, setSegmentActive] = useState(false);

  useEffect(() => {
    if (meetingOn) {
      if (segmentStartRef.current === null) {
        segmentStartRef.current = Date.now();
        setSegmentActive(true);
      }
    } else if (segmentStartRef.current !== null) {
      const total = guestAccum + Math.max(0, Date.now() - segmentStartRef.current);
      segmentStartRef.current = null;
      setSegmentActive(false);
      setGuestAccum(total);
      p.onUpdate({ guestAccum: total });
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

  // Meet sayfası 4 sn içinde yüklenmezse gömülme engellenmiş kabul edilir.
  useEffect(() => {
    if (!frameSrc) return;
    setFrameLoaded(false);
    const timer = window.setTimeout(() => setFrameLoaded((loaded) => loaded), 4000);
    return () => window.clearTimeout(timer);
  }, [frameSrc, p.session.frameKey]);

  const fullscreen = async () => {
    try {
      if (document.fullscreenElement === frameRef.current) await document.exitFullscreen();
      else await frameRef.current?.requestFullscreen();
    } catch { /* ignore */ }
  };

  const changeZoom = (value: number) => p.onUpdate({ zoom: clampZoom(value) });

  const submitGuest = (event: FormEvent) => {
    event.preventDefault();
    const value = guestName.trim() || `Katılımcı ${cell.attendance.length + 1}`;
    p.onJoin(value);
    setGuestName("");
    setNow(Date.now());
  };

  const roomMs = cell.openedAt ? now - cell.openedAt : 0;
  const runningMs = segmentStartRef.current ? Math.max(0, now - segmentStartRef.current) : 0;
  const guestMs = guestAccum + runningMs;
  const hasTime = guestMs > 0;

  const serverBadge = usingServer
    ? { cls: "on", label: `${livePresent}`, title: `Canlı takip · ${livePresent} kişi içeride · sayaç ${meetingOn ? "ÇALIŞIYOR" : "bekliyor"}` }
    : p.serverConnected
    ? { cls: "wait", label: "…", title: "Sunucu bağlı — Meet sekmesinden katılım bekleniyor (Aks rozetini kontrol edin)" }
    : { cls: "off", label: "off", title: "Sunucu bağlı değil — sunucuyu başlatın ve Meet eklentisini kurun" };

  const iframeAllow = muteAudioDefault && muteVideoDefault
    ? "camera 'none'; microphone 'none'; display-capture; autoplay; fullscreen; clipboard-write"
    : "camera; microphone; display-capture; autoplay; fullscreen; clipboard-write";

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
            title={meetingOn ? `ÇALIŞIYOR — ${livePresent} kişi içeride` : hasTime ? `DURDU — süre saklı, ${livePresent}/2 · karşıdan biri girince devam eder` : `Karşıdan biri girince (2 kişi) başlar — şu an ${livePresent}`}>
            <Ico.Users className="h-3 w-3" /><time>{hasTime || meetingOn ? fmtDuration(guestMs) : "00:00:00"}</time><em>{livePresent}/2</em>
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
            allow={iframeAllow}
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className="meeting-iframe"
            onLoad={() => setFrameLoaded(true)}
            style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          />
        ) : (
          <div className="compact-placeholder"><strong>Meet bağlantısı yok</strong></div>
        )}

        {frameSrc && !frameLoaded && (
          <div className="frame-blocked-notice">
            <Ico.Info className="h-3 w-3" />
            <div>
              <strong>Meet sayfası bu çerçevede gösterilemiyor</strong>
              <span>Google güvenlik politikası gereği gömülmeyi engelliyor. Katılımcı takibi sunucu üzerinden çalışır; aşağıdan elle de ekleyebilirsiniz.</span>
            </div>
          </div>
        )}

        <div className="frame-overlay-tools">
          {!usingServer && (
            <form className="guest-chip" onSubmit={submitGuest}>
              <input value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Katılımcı adı yaz" maxLength={40} aria-label="Katılımcı adı" />
              <button type="submit" title="Katılımcı ekle — 2+ kişide sayaç başlar"><Ico.Plus /></button>
            </form>
          )}

          {usingServer
            ? p.serverCount > 0 && (
              <span className="guest-pill live">Sunucu: {p.serverCount} kişi</span>
            )
            : manualPresent.slice(0, 3).map((person) => (
              <button
                key={person.id}
                className="guest-pill"
                onClick={() => { p.onLeave(person.id); setNow(Date.now()); }}
                title="Çıkış kaydet"
              >
                {person.name}
              </button>
            ))
          }
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
