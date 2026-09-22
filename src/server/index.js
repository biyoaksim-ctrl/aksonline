/**
 * Aks Online — Meet katılım sunucusu.
 *
 * Görevi:
 *  1) Statik arayüzü servis etmek (dist/)
 *  2) Google Meet REST API'yi yoklayarak oda başına canlı katılımcı sayısı üretmek
 *  3) Bu sayıyı WebSocket ile arayüze anında iletmek
 *
 * Neden sunucu gerekiyor?
 *  - Google Meet API'si CORS'a izin vermez; tarayıcıdan doğrudan çağrılamaz.
 *  - Erişim token'ı tarayıcıda tutmak yerine sunucuda tutmak daha güvenlidir.
 *  - Çoklu oda tek bağlantıyla yoklanır, Google kotası verimli kullanılır.
 *
 * Çalıştırma:  npm run server
 * Ortam:       PORT (varsayılan 8787), GOOGLE_ACCESS_TOKEN (isteğe bağlı başlangıç)
 */

import { WebSocketServer } from "ws";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { readAttendance, MeetApiError } from "./googleMeet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
// Render/VPS gibi yayınlarda dış arayüz; 127.0.0.1'e kilitlenmez.
const HOST = process.env.HOST || "0.0.0.0";

/** Sunucu durumu: yalnızca bellekte tutulur, diske yazılmaz. */
const state = {
  token: process.env.GOOGLE_ACCESS_TOKEN || "",
  /** roomId -> { code, count, lastSyncAt, status, error } */
  rooms: new Map(),
  /** roomId -> Set<WebSocket> */
  watchers: new Map(),
};

const app = express();

/**
 * Meet sekmesi (HTTPS) bu sunucuya (HTTP localhost ya da HTTPS yayın) istek atar.
 * Chrome, HTTPS sayfadan yerel/adres isteklerinde "Private Network Access" ön onayı
 * ister; başlık yoksa istek REDDEDİLİR ve sayı hiç ulaşmaz. Bu yüzden başlık zorunlu.
 */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
app.use(cors());
app.use(express.json({ limit: "32kb" }));

/** Sağlık kontrolü: arayüz sunucuya ulaşıp ulaşamadığını anlar. */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasToken: Boolean(state.token), rooms: state.rooms.size });
});

/** Token yalnızca gövdeyle gönderilir; asla URL'ye konmaz, loglanmaz. */
app.post("/api/config", (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim().replace(/^Bearer\s+/i, "") : "";
  if (!token) {
    state.token = "";
    state.rooms.forEach((room) => { room.status = "waiting"; room.error = null; });
    broadcastConfig();
    void pollOnce();
    return res.json({ ok: true, hasToken: false });
  }
  state.token = token;
  state.rooms.forEach((room) => { room.status = "waiting"; room.error = null; });
  broadcastConfig();
  void pollOnce();
  console.log("[config] Google erişim tokenı güncellendi");
  res.json({ ok: true, hasToken: true });
});

/** Meet sekmesindeki eklenti kişi sayısını buraya yollar. Token gerekmez. */
app.post("/api/presence", (req, res) => {
  const code = String(req.body?.code ?? "").toLowerCase();
  const count = Number(req.body?.count);
  if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code) || !Number.isFinite(count) || count < 0 || count > 500) {
    return res.status(400).json({ ok: false });
  }
  const now = Date.now();
  let updated = 0;
  state.rooms.forEach((room, roomId) => {
    if (room.code !== code) return;
    room.count = count;
    room.status = "live";
    room.error = null;
    room.lastSyncAt = now;
    room.source = "meet-tab";
    room.lastPresenceAt = now;
    broadcastAttendance(roomId);
    updated += 1;
  });
  console.log(`[presence] ${code} → ${count} kişi (${updated} çerçeve güncellendi)`);
  res.json({ ok: true, updated });
});

app.get("/api/rooms", (_req, res) => {
  res.json({
    hasToken: Boolean(state.token),
    rooms: [...state.rooms.entries()].map(([id, room]) => ({
      id, code: room.code, count: room.count, status: room.status, lastSyncAt: room.lastSyncAt,
    })),
  });
});

/** Arayüz dosyaları (production derlemesi). */
const distDir = path.resolve(__dirname, "../../dist");
app.use(express.static(distDir, { index: false }));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) res.status(404).send("Arayüz derlemesi bulunamadı. Önce 'npm run build' çalıştırın.");
  });
});

const server = http.createServer(app);

/** WebSocket: arayüzün oda takibine abone olmasını sağlar. */
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcastConfig() {
  const payload = JSON.stringify({ type: "config", hasToken: Boolean(state.token) });
  wss.clients.forEach((client) => { if (client.readyState === 1) client.send(payload); });
}

function broadcastAttendance(roomId) {
  const room = state.rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify({
    type: "attendance",
    roomId,
    code: room.code,
    count: room.count,
    status: room.status,
    lastSyncAt: room.lastSyncAt,
    error: room.error,
  });
  (state.watchers.get(roomId) ?? new Set()).forEach((ws) => send(ws, payload));
}

function touchRoom(roomId, code) {
  if (!state.rooms.has(roomId)) {
    state.rooms.set(roomId, { code, count: 0, lastSyncAt: null, status: "waiting", error: null });
    state.watchers.set(roomId, new Set());
  } else {
    state.rooms.get(roomId).code = code;
  }
}

wss.on("connection", (ws) => {
  send(ws, { type: "config", hasToken: Boolean(state.token) });

  ws.on("message", (raw) => {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }

    if (message?.type === "watch" && typeof message.roomId === "string") {
      const roomId = message.roomId.slice(0, 60);
      const code = String(message.code ?? "").toLowerCase();
      if (!/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(code)) return;

      touchRoom(roomId, code);
      state.watchers.get(roomId)?.add(ws);
      const room = state.rooms.get(roomId);
      send(ws, { type: "attendance", roomId, code, count: room.count, status: room.status, lastSyncAt: room.lastSyncAt });
      void pollOnce();
      return;
    }

    if (message?.type === "unwatch" && typeof message.roomId === "string") {
      state.watchers.get(message.roomId)?.delete(ws);
      return;
    }
  });

  const cleanup = () => state.watchers.forEach((set) => set.delete(ws));
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

/** Yoklama döngüsü: Google olay göndermediği için tek yol budur. */
const POLL_ACTIVE_MS = 15000;
const POLL_WAITING_MS = 6000;
let polling = false;

async function pollOnce() {
  if (polling) return;
  if (!state.token || state.rooms.size === 0) return;

  polling = true;
  const entries = [...state.rooms.entries()];
  try {
    for (const [roomId, room] of entries) {
      const controller = new AbortController();
      try {
        const result = await readAttendance(room.code, state.token, controller.signal, room.conferenceName ?? null);
        room.conferenceName = result.conferenceName ?? null;
        // Meet sekmesi (eklenti) son 30 sn içinde sayı gönderdiyse o değer geçerlidir.
        const presenceFresh = room.lastPresenceAt && Date.now() - room.lastPresenceAt < 30000;
        if (!presenceFresh || result.waiting === false && result.count > room.count) {
          room.count = result.count;
        }
        // Eklenti canlı sayı verirken oda "waiting" diye alçaltılmaz.
        if (!(presenceFresh && room.status === "live")) {
          room.status = result.waiting ? "waiting" : "live";
        }
        room.error = null;
        room.lastSyncAt = Date.now();
        broadcastAttendance(roomId);
      } catch (error) {
        const status = error instanceof MeetApiError ? error.status : 0;
        room.status = "error";
        room.error = status || "ağ hatası";
        // Yetki/istek hatalarında tekrar denemek faydasız: oturumu beklet.
        if ([400, 401, 403, 404].includes(status)) room.conferenceName = null;
        broadcastAttendance(roomId);
      } finally {
        controller.abort();
      }
    }
  } finally {
    polling = false;
  }
}

setInterval(() => {
  const anyWaiting = [...state.rooms.values()].some((room) => room.status === "waiting");
  void pollOnce();
  return anyWaiting;
}, POLL_ACTIVE_MS);

// Bekleme durumunda daha sık kontrol: toplantı başlar başlamaz yakalanır.
setInterval(() => {
  const anyWaiting = [...state.rooms.values()].some((room) => room.status === "waiting");
  if (anyWaiting) void pollOnce();
}, POLL_WAITING_MS);

server.listen(PORT, HOST, () => {
  console.log(`[aks-online] sunucu hazır: http://localhost:${PORT}`);
  console.log(`[aks-online] WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`[aks-online] dinlenen arayüz: ${HOST}:${PORT}`);
  if (!process.env.GOOGLE_ACCESS_TOKEN) {
    console.log("[aks-online] Google token girilmedi. Arayüzden Ayarlar bölümünden ekleyebilirsiniz.");
  }
});
