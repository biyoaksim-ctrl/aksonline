import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MeetCell } from "../types";
import type { CellSession } from "../lib/useMeetHub";
import { buildLaunchUrl, clampZoom, fmtDuration, MAX_ZOOM, meetCode, MIN_ZOOM } from "../lib/meet";
import { advanceCounter, counterMs, isMeetingRunning, MEETING_THRESHOLD, resolveLivePresent } from "../lib/counter";
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
}

let mediaPermissionRequested = false;

/**
 * Sağ paneldeki bağımsız çerçeve.
 *
 * Katılımcı sayısı yalnızca canlı veriden gelir:
 *   Meet sekmesindeki Aks eklentisi ya da Google Meet REST API → sunucu → bu çerçeve.
 * Elle katılım girişi YOKTUR; sayaç odadaki gerçek kişi sayısı arttığında başlar.
 */
export default function LaneFrame(p: Props) {
  const { cell, muteAudioDefault = false, muteVideoDefault = false } = p;
  const frameRef = useRef<HTMLElement>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const code = meetCode(cell.url).replace(/\/$/, "");
  const scale = cell.zoom / 100;
  const frameSrc = buildLaunchUrl(cell, muteAudioDefault, muteVideoDefault);

  // Eşik: karşıdan en az 2 kişi katıldığında sayaç başlar (MEETING_THRESHOLD).
  const usingServer = p.serverLive;
  const livePresent = resolveLivePresent(p.serverLive, p.serverCount);
  const meetingOn = isMeetingRunning(p.serverLive, p.serverCount);

  // --- BİRİKİMLİ SAYAÇ ---
  // Odaya biri girer → başlar.
  // Oda boşalır → DURUR, süre saklanır.
  // Tekrar girer → kaldığı yerden DEVAM eder. Sayfa yenilense de saklı.
  const [guestAccum, setGuestAccum] = useState<number>(Math.max(0, Number(cell.guestAccum) || 0));
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

  /**
   * Sağ üst göstergenin durumu — nerede takıldığımız belli olsun:
   *   BAĞLANTI YOK → sunucuya ulaşılamıyor (yanlış adres / ağ)
   *   SAYI GELMİYOR → sunucu bağlı ama Meet'ten henüz sayı yok (eklenti ya da API)
   *   BEKLİYOR n/2 → sayı geldi, eşik dolmadı
   *   ÇALIŞIYOR / DURDU
   */
  const counterState = !p.serverConnected
    ? { cls: "off", label: "BAĞLANTI YOK", title: "Sunucuya ulaşılamıyor. Panelin https://aks-online.onrender.com adresinde açık olduğundan emin ol." }
    : p.serverStatus === "idle"
    ? { cls: "off", label: "SAYI GELMİYOR", title: "Sunucu bağlı ama odanın katılımcı sayısı henüz gelmedi. Bilgisayarda Meet sekmesini aç, chrome://extensions → Aks eklentisini yükle; sonra bu sayfayı yenile." }
    : p.serverStatus === "error"
    ? { cls: "off", label: "HATA", title: "Sunucu katılım verisini okurken hata aldı. Google Meet API bağlıysa token geçersiz olabilir." }
    : meetingOn
    ? { cls: "on", label: "ÇALIŞIYOR", title: `İçeride ${livePresent} kişi · sayaç ${MEETING_THRESHOLD}. katılımcıda başladı` }
    : hasTime
    ? { cls: "paused", label: "DURDU", title: "Oda boşaldı, süre saklandı. Katılımcı girince kaldığı yerden devam eder." }
    : { cls: "wait", label: `BEKLİYOR ${livePresent}/${MEETING_THRESHOLD}`, title: `Sayaç ${MEETING_THRESHOLD}. katılımcıda başlar · şu an içeride ${livePresent} kişi` };

  const serverBadge = usingServer
    ? { cls: "on", label: `${livePresent}`, title: `Canlı takip · ${livePresent} kişi içeride · sayaç ${meetingOn ? "ÇALIŞIYOR" : "bekliyor"}` }
    : p.serverConnected
    ? { cls: "wait", label: "…", title: counterState.title }
    : { cls: "off", label: "off", title: counterState.title };

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
        <button className="frame-head-button close" onClick={p.onCloseLane} title="Çerçeveyi kapat" aria-label={`${cell.name} çerçeveyi kapat`}><Ico.X /></button>
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

        {/* Meet ekranının SAĞ ÜSTÜNDE: katılımcı sayısı ve sayaç durumu. */}
        <div className={`frame-counter ${counterState.cls}`} title={counterState.title}>
          <span className="people"><Ico.Users /><strong>{livePresent}</strong></span>
          <span className="time"><Ico.Clock /><time>{hasTime || meetingOn ? fmtDuration(guestMs) : "00:00:00"}</time></span>
          <em>{counterState.label}</em>
        </div>

        {/* Odadaki canlı kişi sayısı (sunucudan gelir, elle giriş yok). */}
        <div className="frame-overlay-tools">
          {usingServer && p.serverCount > 0 && (
            <span className="guest-pill live">Meet: {p.serverCount} kişi</span>
          )}
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
