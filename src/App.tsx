import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import CellRow from "./components/CellRow";
import LaneFrame from "./components/LaneFrame";
import { Ico } from "./components/icons";
import { useMeetHub } from "./lib/useMeetHub";
import { clampZoom, COLORS, normalizeMeetUrl } from "./lib/meet";
import type { MeetCell } from "./types";
import { exportReportsCsv, loadReports, makeReport, saveReports, type ReportEntry } from "./lib/reports";
import { fillTemplate, sendWhatsAppText, type WhatsAppConfig } from "./lib/whatsapp";
import { backend, codeFromUrl } from "./lib/backend";

type ThemeId = "night" | "ocean" | "forest" | "sunset" | "light" | "violet";

interface WorkspaceSettings {
  title: string;
  subtitle: string;
  logo: string;
  logoShape: "circle" | "square" | "rect";
  logoZoom: number;
  logoFrameZoom: number;
  theme: ThemeId;
  sidebarWidth: number;
  gap: number;
  radius: number;
  columns: "auto" | 1 | 2 | 3 | 4;
  defaultZoom: number;
  showFrameCode: boolean;
  compactFrameHeader: boolean;
  autoOpenNew: boolean;
  autoJoin: boolean;
  muteAudioDefault: boolean;
  muteVideoDefault: boolean;
  waEnabled: boolean;
  waPhoneId: string;
  waTo: string;
  waTemplate: string;
  sidebarOpen: boolean;
  lanes: string[];
}

const UI_KEY = "aks-mentorluk.workspace.v3";
const MAX_FRAMES = 12;
const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: "night", label: "Gece", swatch: "#0b1220" },
  { id: "ocean", label: "Okyanus", swatch: "#0b2a3d" },
  { id: "forest", label: "Orman", swatch: "#12301f" },
  { id: "sunset", label: "Gün batımı", swatch: "#3a1d18" },
  { id: "light", label: "Açık", swatch: "#eef3f8" },
  { id: "violet", label: "Mor", swatch: "#1d1535" },
];

const DEFAULTS: WorkspaceSettings = {
  title: "Aks Online",
  subtitle: "aksonline.web.app",
  logo: "",
  logoShape: "square",
  logoZoom: 100,
  logoFrameZoom: 100,
  theme: "night",
  sidebarWidth: 310,
  gap: 6,
  radius: 10,
  columns: "auto",
  defaultZoom: 100,
  showFrameCode: true,
  compactFrameHeader: true,
  autoOpenNew: true,
  autoJoin: true,
  muteAudioDefault: true,
  muteVideoDefault: true,
  waEnabled: false,
  waPhoneId: "",
  waTo: "",
  waTemplate: "{name} {room} odasına katıldı. {time}",
  sidebarOpen: true,
  lanes: [],
};

function loadSettings(): WorkspaceSettings {
  try {
    const value = JSON.parse(localStorage.getItem(UI_KEY) ?? localStorage.getItem("aks-mentorluk.workspace.v2") ?? "null") as Partial<WorkspaceSettings> | null;
    if (!value) return DEFAULTS;
    const columns = value.columns === "auto" || [1, 2, 3, 4].includes(Number(value.columns)) ? (value.columns as WorkspaceSettings["columns"]) : "auto";
    const theme = THEMES.some((item) => item.id === value.theme) ? (value.theme as ThemeId) : DEFAULTS.theme;
    return {
      ...DEFAULTS,
      ...value,
      title: typeof value.title === "string" ? value.title.slice(0, 50) : DEFAULTS.title,
      subtitle: typeof value.subtitle === "string" ? value.subtitle.slice(0, 60) : DEFAULTS.subtitle,
      logo: typeof value.logo === "string" && value.logo.startsWith("data:image/") ? value.logo : "",
      logoShape: value.logoShape === "circle" || value.logoShape === "rect" ? value.logoShape : "square",
      logoZoom: Math.min(300, Math.max(50, Number(value.logoZoom) || 100)),
      logoFrameZoom: Math.min(200, Math.max(60, Number(value.logoFrameZoom) || 100)),
      theme,
      sidebarWidth: Math.min(420, Math.max(240, Number(value.sidebarWidth) || DEFAULTS.sidebarWidth)),
      gap: Math.min(16, Math.max(2, Number(value.gap) || DEFAULTS.gap)),
      radius: Math.min(22, Math.max(0, Number(value.radius) || DEFAULTS.radius)),
      defaultZoom: clampZoom(value.defaultZoom ?? DEFAULTS.defaultZoom),
      columns,
      autoJoin: value.autoJoin !== false,
      muteAudioDefault: value.muteAudioDefault !== false,
      muteVideoDefault: value.muteVideoDefault !== false,
      lanes: Array.isArray(value.lanes) ? [...new Set(value.lanes.filter((id): id is string => typeof id === "string"))].slice(0, MAX_FRAMES) : [],
    };
  } catch {
    return DEFAULTS;
  }
}

function autoColumns(count: number, width: number): number {
  if (count <= 1) return 1;
  if (width < 520) return 1;
  if (width < 820) return Math.min(2, count);
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

export default function App() {
  const hub = useMeetHub();
  const [settings, setSettings] = useState<WorkspaceSettings>(loadSettings);
  const [laneIds, setLaneIds] = useState<string[]>(() => settings.lanes.filter((id) => hub.cells.some((cell) => cell.id === id)));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [waToken, setWaToken] = useState("");
  const [tab, setTab] = useState<"panels" | "reports" | "settings">("panels");
  const [reports, setReports] = useState<ReportEntry[]>(loadReports);
  const notified = useRef<Set<string>>(new Set());
  const [stageWidth, setStageWidth] = useState(typeof window === "undefined" ? 1200 : window.innerWidth);
  const nameRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const restored = useRef(false);

  // --- Sunucu (Node.js) bağlantı durumu ---
  const [server, setServer] = useState({ connected: false, hasToken: false });
  const [attendance, setAttendance] = useState<Record<string, { count: number; status: string; live: boolean }>>({});
  const [tokenDraft, setTokenDraft] = useState("");

  useEffect(() => backend.connect(), []);

  useEffect(() => backend.onStatus((status) => setServer(status)), []);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    hub.cells.filter((cell) => laneIds.includes(cell.id)).forEach(hub.start);
  }, [hub.cells, hub.start, laneIds]);

  useEffect(() => {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ ...settings, lanes: laneIds }));
    } catch {
      setNotice("Ayarlar tarayıcıya kaydedilemedi.");
    }
  }, [settings, laneIds]);

  useEffect(() => {
    document.title = `${settings.title || "Aks Online"} | aksonline`;
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.title, settings.theme]);

  useEffect(() => {
    if (showAdd && settings.sidebarOpen) nameRef.current?.focus();
  }, [showAdd, settings.sidebarOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageWidth(stage.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("tr-TR");
    return hub.cells.filter((cell) => `${cell.name} ${cell.url}`.toLocaleLowerCase("tr-TR").includes(term));
  }, [hub.cells, query]);

  const staged = laneIds.map((id) => hub.cells.find((cell) => cell.id === id)).filter((cell): cell is MeetCell => !!cell);
  const targets = selected.length ? hub.cells.filter((cell) => selected.includes(cell.id)) : filtered;
  const columns = settings.columns === "auto" ? autoColumns(staged.length, stageWidth) : Math.min(settings.columns, Math.max(1, staged.length));
  const rows = Math.max(1, Math.ceil(Math.max(staged.length, 1) / Math.max(columns, 1)));

  const updateSetting = <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  };

  // Sunucuya oda takibi: her çerçeve kendi Meet koduyla abone olur.
  // Oda kodu değişirse abonelik yenilenir.
  const watchKey = laneIds.join("|") + "#" + laneIds.map((id) => codeFromUrl(hub.cells.find((c) => c.id === id)?.url ?? "")).join("|");
  useEffect(() => {
    const subscriptions = staged.map((cell) => {
      const code = codeFromUrl(cell.url);
      if (!code) return null;
      return backend.watch(cell.id, code, (snapshot) => {
        setAttendance((previous) => ({
          ...previous,
          [cell.id]: { count: snapshot.count, status: snapshot.status, live: snapshot.status === "live" },
        }));
      });
    }).filter((off): off is () => void => off !== null);

    return () => subscriptions.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey]);

  // Sunucu katılımcı sayısını bildirdiğinde rapora + WhatsApp'a düşür.
  // Sayaç kuralı: sayı 2'ye ulaşınca başlar (LaneFrame içinde uygulanır).
  const lastCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    staged.forEach((cell) => {
      const snapshot = attendance[cell.id];
      if (!snapshot) return;
      // "live" değilse (waiting/error) sayaç takılmaz, son sayı sıfırlanır.
      if (snapshot.status !== "live") {
        lastCounts.current[cell.id] = 0;
        return;
      }
      const previousCount = lastCounts.current[cell.id] ?? 0;
      if (snapshot.count > previousCount) {
        for (let i = previousCount; i < snapshot.count; i += 1) {
          const person = `Katılımcı ${i + 1}`;
          const reachedTwo = snapshot.count >= 2 && previousCount < 2;
          pushReport({
            kind: "join",
            roomId: cell.id,
            roomName: cell.name,
            person,
            detail: reachedTwo
              ? "Oda sayısı 2'ye ulaştı — sayaç OTOMATİK başladı"
              : "Sunucu katılımcı sayısı arttı",
          });
          // Sunucudan gelen her yeni kişi için de WhatsApp gönder.
          if (settings.waEnabled) {
            const cfg: WhatsAppConfig = {
              enabled: true,
              phoneNumberId: settings.waPhoneId,
              accessToken: waToken,
              to: settings.waTo,
              template: settings.waTemplate,
            };
            const text = fillTemplate(settings.waTemplate || DEFAULTS.waTemplate, {
              name: person,
              room: cell.name,
              time: new Date().toLocaleString("tr-TR"),
            });
            void sendWhatsAppText(cfg, text).then((result) => {
              pushReport({ kind: "whatsapp", roomId: cell.id, roomName: cell.name, person, detail: result.detail, ok: result.ok });
            });
          }
        }
        if (snapshot.count >= 2 && previousCount < 2) {
          setNotice(`${cell.name}: 2 kişi oldu — sayaç başladı`);
        }
      } else if (snapshot.count < previousCount) {
        pushReport({
          kind: "leave",
          roomId: cell.id,
          roomName: cell.name,
          detail: `Sunucu katılımcı sayısı azaldı (${previousCount} → ${snapshot.count})`,
        });
        if (snapshot.count < 2 && previousCount >= 2) {
          pushReport({
            kind: "leave",
            roomId: cell.id,
            roomName: cell.name,
            detail: "Sayı 2'nin altına düştü — sayaç durdu",
          });
        }
      }
      lastCounts.current[cell.id] = snapshot.count;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, staged]);

  // Manuel sayaç eşiği: sunucu canlı değilken 2'ye ulaşınca sayaç başlar.
  const lastManualCounts = useRef<Record<string, number>>({});
  useEffect(() => {
    staged.forEach((cell) => {
      const snap = attendance[cell.id];
      const serverLiveNow = server.connected && server.hasToken && snap?.status === "live";
      if (serverLiveNow) return; // sunucu otorite, yukarıdaki effect bakar
      const manualCount = cell.attendance.filter((person) =>
        person.sessions.some((s) => s.leftAt === null)
      ).length;
      const prev = lastManualCounts.current[cell.id] ?? 0;
      if (manualCount >= 2 && prev < 2) {
        pushReport({
          kind: "join",
          roomId: cell.id,
          roomName: cell.name,
          detail: `Oda sayısı 2'ye ulaştı (${manualCount} kişi) — sayaç OTOMATİK başladı`,
        });
        setNotice(`${cell.name}: 2 kişi oldu — sayaç başladı`);
      } else if (manualCount < 2 && prev >= 2) {
        pushReport({
          kind: "leave",
          roomId: cell.id,
          roomName: cell.name,
          detail: "Sayı 2'nin altına düştü — sayaç durdu",
        });
      }
      lastManualCounts.current[cell.id] = manualCount;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.cells, staged, server.connected, server.hasToken, attendance]);

  const pushReport = (entry: Omit<ReportEntry, "id" | "t">) => {
    setReports((previous) => {
      const next = [makeReport(entry), ...previous].slice(0, 500);
      saveReports(next);
      return next;
    });
  };

  const notifyJoin = (cell: MeetCell, person: string) => {
    const key = `${cell.id}:${person.toLocaleLowerCase("tr-TR")}`;
    if (notified.current.has(key)) return;
    notified.current.add(key);
    pushReport({ kind: "join", roomId: cell.id, roomName: cell.name, person, detail: "Odaya katıldı — sayaç başladı" });
    if (!settings.waEnabled) return;
    const cfg: WhatsAppConfig = {
      enabled: true,
      phoneNumberId: settings.waPhoneId,
      accessToken: waToken,
      to: settings.waTo,
      template: settings.waTemplate,
    };
    const text = fillTemplate(settings.waTemplate || DEFAULTS.waTemplate, {
      name: person,
      room: cell.name,
      time: new Date().toLocaleString("tr-TR"),
    });
    void sendWhatsAppText(cfg, text).then((result) => {
      pushReport({ kind: "whatsapp", roomId: cell.id, roomName: cell.name, person, detail: result.detail, ok: result.ok });
    });
  };

  const openLane = (cell: MeetCell) => {
    if (laneIds.includes(cell.id)) return;
    if (laneIds.length >= MAX_FRAMES) {
      setNotice("Sağ panelde en fazla 12 çerçeve açılabilir.");
      return;
    }
    setLaneIds((previous) => [...previous, cell.id]);
    hub.start(cell);
    pushReport({ kind: "room-open", roomId: cell.id, roomName: cell.name, detail: "Oda çerçevede açıldı — oda sayacı başladı" });
    if (window.innerWidth < 900) updateSetting("sidebarOpen", false);
  };

  const closeLane = (cell: MeetCell) => {
    hub.stop(cell);
    setLaneIds((previous) => previous.filter((id) => id !== cell.id));
    pushReport({ kind: "room-close", roomId: cell.id, roomName: cell.name, detail: "Çerçeve kapatıldı" });
    notified.current.forEach((key) => { if (key.startsWith(`${cell.id}:`)) notified.current.delete(key); });
  };

  const openAll = () => {
    const free = MAX_FRAMES - laneIds.length;
    const waiting = targets.filter((cell) => !laneIds.includes(cell.id));
    const newCells = waiting.slice(0, free);
    setLaneIds((previous) => [...previous, ...newCells.map((cell) => cell.id)]);
    newCells.forEach(hub.start);
    if (waiting.length > free) setNotice("12 çerçeve sınırı nedeniyle kalan paneller açılmadı.");
  };

  const openForm = (cell?: MeetCell) => {
    updateSetting("sidebarOpen", true);
    setEditingId(cell?.id ?? null);
    setName(cell?.name ?? "");
    setUrl(cell?.url ?? "");
    setColor(cell?.color ?? COLORS[0]);
    setFormError("");
    setShowAdd(true);
    setTab("panels");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeMeetUrl(url);
    if (!normalized) {
      setFormError("Geçerli bir Meet kodu veya bağlantısı girin.");
      return;
    }
    const data = { name: name.trim() || `Panel ${hub.cells.length + 1}`, url: normalized, color, example: false };
    if (editingId) hub.update(editingId, data);
    else {
      const cell = hub.add({ ...data, zoom: settings.defaultZoom });
      if (settings.autoOpenNew) openLane(cell);
    }
    setShowAdd(false);
    setEditingId(null);
  };

  const removeCell = (cell: MeetCell) => {
    if (!window.confirm(`"${cell.name}" paneli silinsin mi?`)) return;
    closeLane(cell);
    hub.remove(cell.id, cell.name);
    setSelected((previous) => previous.filter((id) => id !== cell.id));
  };

  const loadLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 500_000) {
      setNotice("Logo PNG, JPG veya WEBP olmalı ve 500 KB'ı geçmemeli.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && updateSetting("logo", reader.result);
    reader.onerror = () => setNotice("Logo okunamadı.");
    reader.readAsDataURL(file);
  };

  const resetSettings = () => {
    if (!window.confirm("Görünüm ayarları varsayılana döndürülsün mü? Paneller silinmez.")) return;
    setSettings((previous) => ({ ...DEFAULTS, lanes: previous.lanes, sidebarOpen: previous.sidebarOpen }));
  };

  const shellStyle = {
    "--sidebar-width": `${settings.sidebarWidth}px`,
    "--grid-gap": `${settings.gap}px`,
    "--frame-radius": `${settings.radius}px`,
  } as CSSProperties;

  return (
    <div className={`aks-shell theme-${settings.theme} ${settings.sidebarOpen ? "sidebar-open" : "sidebar-closed"}`} style={shellStyle}>
      <button className="edge-toggle" onClick={() => updateSetting("sidebarOpen", !settings.sidebarOpen)} aria-label={settings.sidebarOpen ? "Sol paneli gizle" : "Sol paneli aç"}>
        <Ico.Sidebar />
      </button>
      {settings.sidebarOpen && <button className="mobile-backdrop" onClick={() => updateSetting("sidebarOpen", false)} aria-label="Sol paneli kapat" />}

      <aside className="aks-sidebar" inert={!settings.sidebarOpen} aria-hidden={!settings.sidebarOpen}>
        <div className="aks-brand">
          <label
            className={`brand-logo shape-${settings.logoShape}`}
            title="Logo yükle"
            style={{ "--logo-frame": settings.logoFrameZoom / 100, "--logo-zoom": settings.logoZoom / 100 } as CSSProperties}
          >
            {settings.logo ? <img src={settings.logo} alt="Kurum logosu" /> : <span>AKS</span>}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={loadLogo} />
          </label>
          <div>
            <h1>{settings.title || "Aks Online"}</h1>
            <p>{settings.subtitle || "Meet çalışma alanı"}</p>
          </div>
          <button className="icon-button sidebar-close" onClick={() => updateSetting("sidebarOpen", false)} title="Sol paneli gizle"><Ico.X /></button>
        </div>

        <div className="sidebar-tabs three">
          <button className={tab === "panels" ? "active" : ""} onClick={() => setTab("panels")}><Ico.Grid />Paneller</button>
          <button className={tab === "reports" ? "active" : ""} onClick={() => { setTab("reports"); setShowAdd(false); }}><Ico.Notes />Rapor</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => { setTab("settings"); setShowAdd(false); }}><Ico.Bolt />Ayarlar</button>
        </div>

        {tab === "settings" ? (
          <div className="settings-panel">
            <SettingSection title="Marka / Başlık">
              <label>Başlık<input className="field" value={settings.title} maxLength={50} onChange={(event) => updateSetting("title", event.target.value)} placeholder="Aks Online" /></label>
              <label>Alt başlık<input className="field" value={settings.subtitle} maxLength={60} onChange={(event) => updateSetting("subtitle", event.target.value)} placeholder="Meet çalışma alanı" /></label>
              <label className="btn logo-upload"><Ico.Plus />Bilgisayardan logo seç<input type="file" accept="image/png,image/jpeg,image/webp" onChange={loadLogo} /></label>
              {settings.logo && <button className="text-button danger-hover" onClick={() => updateSetting("logo", "")}>Logoyu kaldır</button>}
              <div className="shape-picker" role="group" aria-label="Logo şekli">
                {([["circle", "Daire"], ["square", "Kare"], ["rect", "Dikdörtgen"]] as const).map(([shape, label]) => (
                  <button key={shape} type="button" className={settings.logoShape === shape ? "active" : ""} onClick={() => updateSetting("logoShape", shape)}>
                    <i className={`shape-demo shape-${shape}`} /><span>{label}</span>
                  </button>
                ))}
              </div>
              <RangeSetting label="Logo çerçevesi (büyüt / küçült)" value={settings.logoFrameZoom} min={60} max={200} step={5} suffix="%" onChange={(value) => updateSetting("logoFrameZoom", value)} />
              <RangeSetting label="Logoyu yakınlaştır / uzaklaştır" value={settings.logoZoom} min={50} max={300} step={5} suffix="%" onChange={(value) => updateSetting("logoZoom", value)} />
            </SettingSection>

            <SettingSection title="Sunucu ve canlı katılımcı algılama">
              <div className={`server-status ${server.connected ? "on" : "off"}`}>
                <span className="status-dot" />
                <div>
                  <strong>{server.connected ? "Node.js sunucusu bağlı" : "Sunucu yok — yalnızca arayüz yayında"}</strong>
                  <span>{server.connected ? "Katılımcı sayısı Google Meet API'den canlı okunur" : "Canlı takip için: npm run build && npm run server"}</span>
                </div>
              </div>
              <p className="hint-text"><b>Kod ile tespit mümkün — sunucu üzerinden.</b> Google Meet API'si CORS'a izin vermez; bu yüzden istekler Node.js sunucusundan yapılır. Token sunucuda tutulur, tarayıcıda kalmaz.</p>
              <label>Google OAuth erişim tokenı
                <input className="field" type="password" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value.trim())} placeholder="ya1.a0Af…" autoComplete="off" spellCheck={false} />
              </label>
              <div className="batch-actions">
                <button className="btn btn-primary" disabled={!tokenDraft.trim() || !server.connected} onClick={async () => {
                  const ok = await backend.saveToken(tokenDraft);
                  setNotice(ok ? "Token sunucuya iletildi. Odalar yoklanıyor…" : "Token gönderilemedi. Sunucu ayakta mı?");
                  if (ok) setTokenDraft("");
                }}>Sunucuya gönder</button>
                {server.hasToken && <button className="text-button danger-hover" onClick={async () => { await backend.clearToken(); setNotice("Sunucudaki token kaldırıldı."); }}>Token'ı kaldır</button>}
              </div>
              <div className="batch-actions">
                <span className={`hint-text ${server.connected && server.hasToken ? "ok" : ""}`}>
                  {server.connected && server.hasToken ? "Canlı takip açık · katılımcı sayısı artınca sayaç otomatik başlar" : server.connected ? "Token girilmedi: katılımcılar elle eklenir" : "Sunucu bağlantısı yok: katılımcılar elle eklenir"}
                </span>
              </div>
              <p className="hint-text"><b>Karşıdan katılımı görmek için:</b> Chrome’da <code>chrome://extensions</code> → Geliştirici modu → Paketlenmemiş yükle → bu projedeki <code>extension</code> klasörü. Meet’i normal sekmede aç. Eklenti kişi sayısını sunucuya yollar. Sayı 2 olunca (sen + karşıdan biri) sayaç başlar.</p>
            </SettingSection>

            <SettingSection title="WhatsApp bildirimi (Cloud API)">
              <p className="hint-text">WhatsApp Web otomatik mesaj gönderemez. Resmi <b>WhatsApp Cloud API</b> ile öğrenci girince mesaj gider ve rapora yazılır. Token sayfa belleğinde tutulur.</p>
              <Toggle label="Girişte WhatsApp mesajı gönder" checked={settings.waEnabled} onChange={(value) => updateSetting("waEnabled", value)} />
              <label>Phone Number ID<input className="field" value={settings.waPhoneId} onChange={(event) => updateSetting("waPhoneId", event.target.value.replace(/\D/g, ""))} placeholder="123456789012345" /></label>
              <label>Alıcı (ülke kodu + numara)<input className="field" value={settings.waTo} onChange={(event) => updateSetting("waTo", event.target.value.replace(/\D/g, ""))} placeholder="905xxxxxxxxx" /></label>
              <label>Erişim tokenı<input className="field" type="password" value={waToken} onChange={(event) => setWaToken(event.target.value.trim())} autoComplete="off" placeholder="EAAG…" /></label>
              <label>Mesaj şablonu<textarea className="field" rows={3} value={settings.waTemplate} onChange={(event) => updateSetting("waTemplate", event.target.value.slice(0, 500))} /></label>
            </SettingSection>

            <SettingSection title="Tema">
              <div className="theme-grid">
                {THEMES.map((theme) => (
                  <button key={theme.id} type="button" className={settings.theme === theme.id ? "active" : ""} onClick={() => updateSetting("theme", theme.id)} title={theme.label}>
                    <i style={{ background: theme.swatch }} />
                    <span>{theme.label}</span>
                  </button>
                ))}
              </div>
            </SettingSection>

            <SettingSection title="Yerleşim">
              <label>Sütun düzeni
                <select className="field" value={settings.columns} onChange={(event) => updateSetting("columns", event.target.value === "auto" ? "auto" : Number(event.target.value) as 1 | 2 | 3 | 4)}>
                  <option value="auto">Otomatik (telefon / tablet / PC)</option>
                  <option value="1">1 sütun</option>
                  <option value="2">2 sütun</option>
                  <option value="3">3 sütun</option>
                  <option value="4">4 sütun</option>
                </select>
              </label>
              <RangeSetting label="Sol panel genişliği" value={settings.sidebarWidth} min={240} max={420} suffix=" px" onChange={(value) => updateSetting("sidebarWidth", value)} />
              <RangeSetting label="Çerçeve aralığı" value={settings.gap} min={2} max={16} suffix=" px" onChange={(value) => updateSetting("gap", value)} />
              <RangeSetting label="Köşe yuvarlaklığı" value={settings.radius} min={0} max={22} suffix=" px" onChange={(value) => updateSetting("radius", value)} />
            </SettingSection>

            <SettingSection title="Meet odaları">
              <RangeSetting label="Varsayılan zoom" value={settings.defaultZoom} min={10} max={200} step={10} suffix="%" onChange={(value) => updateSetting("defaultZoom", value)} />
              <Toggle label="Mikrofonu kapalı başlat (Mute)" checked={settings.muteAudioDefault} onChange={(value) => updateSetting("muteAudioDefault", value)} />
              <Toggle label="Kamerayı kapalı başlat (Camera Off)" checked={settings.muteVideoDefault} onChange={(value) => updateSetting("muteVideoDefault", value)} />
              <Toggle label="Yeni paneli otomatik sağda aç" checked={settings.autoOpenNew} onChange={(value) => updateSetting("autoOpenNew", value)} />
              <Toggle label="Meet kodunu göster" checked={settings.showFrameCode} onChange={(value) => updateSetting("showFrameCode", value)} />
              <Toggle label="Kompakt başlık" checked={settings.compactFrameHeader} onChange={(value) => updateSetting("compactFrameHeader", value)} />
              <button className="btn" onClick={() => hub.cells.forEach((cell) => hub.update(cell.id, { zoom: settings.defaultZoom }))}>Tüm zoomları varsayılana getir</button>
            </SettingSection>

            <button className="text-button reset-settings" onClick={resetSettings}><Ico.Refresh />Görünüm ayarlarını sıfırla</button>
          </div>
        ) : tab === "reports" ? (
          <div className="reports-panel">
            <div className="batch-actions">
              <button className="btn btn-subtle" disabled={!reports.length} onClick={() => exportReportsCsv(reports)}><Ico.Download />CSV</button>
              <button className="text-button danger-hover" disabled={!reports.length} onClick={() => { if (window.confirm("Tüm raporlar silinsin mi?")) { setReports([]); saveReports([]); } }}>Temizle</button>
            </div>
            <div className="report-list">
              {reports.length ? reports.map((item) => (
                <div key={item.id} className={`report-row ${item.kind} ${item.ok === false ? "fail" : ""}`}>
                  <time>{new Date(item.t).toLocaleString("tr-TR")}</time>
                  <strong>{item.roomName}</strong>
                  <span>{item.person ? `${item.person} · ` : ""}{item.detail}</span>
                </div>
              )) : <p className="list-empty">Henüz rapor yok. Oda açınca ve katılımcı girince kayıt düşer.</p>}
            </div>
          </div>
        ) : (
          <>
            <div className="panel-tools">
              <label className="search-field"><Ico.Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Panel ara" /></label>
              {showAdd ? (
                <form className="panel-form" onSubmit={submit}>
                  <div className="section-heading"><strong>{editingId ? "Paneli düzenle" : "Yeni panel"}</strong><button type="button" className="icon-button small" onClick={() => setShowAdd(false)}><Ico.X /></button></div>
                  <input ref={nameRef} className="field" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Panel adı" />
                  <input className="field font-mono" value={url} onChange={(event) => { setUrl(event.target.value); setFormError(""); }} placeholder="abc-defg-hij" required />
                  {formError && <p className="error-text">{formError}</p>}
                  <div className="color-picker">{COLORS.map((value) => <button key={value} type="button" style={{ background: value }} className={color === value ? "selected" : ""} onClick={() => setColor(value)} aria-label="Panel rengi" />)}</div>
                  <button className="btn btn-primary" type="submit">{editingId ? "Kaydet" : "Panel ekle"}</button>
                </form>
              ) : (
                <button className="btn btn-primary add-panel" onClick={() => openForm()}><Ico.Plus />Panel ekle</button>
              )}
              <div className="batch-actions">
                <button className="btn btn-subtle" onClick={openAll} disabled={!targets.length || laneIds.length >= MAX_FRAMES}><Ico.Play />{selected.length ? `Seçimi aç (${selected.length})` : "Tümünü aç"}</button>
                <button className="text-button" onClick={() => setSelected(selected.length ? [] : filtered.map((cell) => cell.id))}>{selected.length ? "Seçimi bırak" : "Tümünü seç"}</button>
              </div>
              <div className="capacity"><span><i style={{ width: `${(staged.length / MAX_FRAMES) * 100}%` }} /></span>{staged.length} / {MAX_FRAMES} açık</div>
            </div>
            <div className="panel-list">
              {filtered.map((cell) => (
                <CellRow
                  key={cell.id}
                  cell={cell}
                  inLane={laneIds.includes(cell.id)}
                  laneNo={laneIds.indexOf(cell.id) + 1}
                  selected={selected.includes(cell.id)}
                  onToggleSelect={() => setSelected((previous) => previous.includes(cell.id) ? previous.filter((id) => id !== cell.id) : [...previous, cell.id])}
                  onOpenLane={() => openLane(cell)}
                  onCloseLane={() => closeLane(cell)}
                  onEdit={() => openForm(cell)}
                  onRemove={() => removeCell(cell)}
                />
              ))}
              {!filtered.length && <div className="list-empty">Panel bulunamadı.</div>}
            </div>
          </>
        )}
        <div className="sidebar-status">
          <span className={`status-dot ${server.connected ? "on" : ""}`} />
          <span className="server-label">
            {server.connected ? (server.hasToken ? "Sunucu bağlı · canlı takip açık" : "Sunucu bağlı · token bekleniyor") : "Sunucu yok · manuel takip"}
          </span>
        </div>
        <div className="sidebar-status secondary">{hub.storageError ? "Kaydetme hatası" : "Telefon · tablet · PC uyumlu"}</div>
      </aside>

      <main ref={stageRef} className="aks-stage" inert={settings.sidebarOpen && stageWidth + settings.sidebarWidth < 900}>
        {!staged.length ? (
          <div className="stage-empty">
            <div className="empty-window"><Ico.Monitor /></div>
            <h2>{settings.title || "Aks Online"}</h2>
            <p>Odalar sağ çerçevede açılır. Oda sayacı açılışta, katılımcı sayacı girişte başlar.</p>
            <button className="btn btn-primary" onClick={() => updateSetting("sidebarOpen", true)}><Ico.Sidebar />Sol paneli aç</button>
          </div>
        ) : (
          <div className="fit-grid" style={{ "--columns": columns, "--rows": rows } as CSSProperties}>
            {staged.map((cell, index) => (
              <LaneFrame
                key={cell.id}
                cell={cell}
                session={hub.sessionOf(cell.id)}
                laneNo={index + 1}
                showCode={settings.showFrameCode}
                compactHeader={settings.compactFrameHeader}
                muteAudioDefault={settings.muteAudioDefault}
                muteVideoDefault={settings.muteVideoDefault}
                // Meet sekmesi veya Google API canlı sayı gönderdiyse o sayı geçerlidir.
                serverLive={server.connected && attendance[cell.id]?.status === "live"}
                serverCount={attendance[cell.id]?.count ?? 0}
                serverStatus={(attendance[cell.id]?.status as "waiting" | "live" | "error" | "idle") ?? "idle"}
                serverHasToken={server.hasToken}
                serverConnected={server.connected}
                onUpdate={(patch) => hub.update(cell.id, patch)}
                onRestart={() => hub.restart(cell)}
                onCloseLane={() => closeLane(cell)}
                onJoin={(participantName) => { hub.recordJoin(cell.id, participantName); notifyJoin(cell, participantName); }}
                onLeave={(participantId) => {
                  const person = cell.attendance.find((item) => item.id === participantId);
                  hub.recordLeave(cell.id, participantId);
                  pushReport({ kind: "leave", roomId: cell.id, roomName: cell.name, person: person?.name, detail: "Odadan çıkış" });
                }}
              />
            ))}
          </div>
        )}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="setting-section"><h2>{title}</h2>{children}</section>;
}

function RangeSetting({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="range-setting"><span>{label}<output>{value}{suffix}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-setting"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
