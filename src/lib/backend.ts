/**
 * Sunucu bağlantı istemcisi.
 *
 * Sunucu ayaktaysa canlı katılımcı sayısı WebSocket ile gelir.
 * Sunucu yoksa (yalnızca statik arayüz yayında) bağlantı kurulamaz ve
 * arayüz manuel kipe düşer; hiçbir şey bozulmaz.
 */

export type ServerAttendance = {
  roomId: string;
  code: string;
  count: number;
  status: "waiting" | "live" | "error" | "idle";
  lastSyncAt: number | null;
  error: string | null;
};

type Listener = (attendance: ServerAttendance) => void;

interface ServerStatus {
  connected: boolean;
  hasToken: boolean;
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

class BackendClient {
  private socket: WebSocket | null = null;
  private retries = 0;
  private reconnectTimer: number | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private watched = new Set<string>();
  private statusListeners = new Set<(status: ServerStatus) => void>();

  connected = false;
  hasToken = false;

  /**
   * Hangi sunucuya bağlanılacak?
   * - Vite dev (5173/4173) → yanındaki Node sunucusu (:8787)
   * - Üretim → VITE_WS_ORIGIN (yayın adresi), yoksa sayfanın kendi origin'i
   * Böylece telefon/tablet/hangi adresi açarsa aynı sayı merkezine bağlanır;
   * WebSocket desteklemeyen bir yayın (ör. GitHub Pages) de sayıyı alabilir.
   */
  private apiBase(): string {
    if (typeof window === "undefined") return "";
    const devServer = window.location.port === "5173" || window.location.port === "4173";
    if (devServer) return `http://${window.location.hostname}:8787`;
    return import.meta.env.VITE_WS_ORIGIN?.trim() || window.location.origin;
  }

  private resolveUrl(): string {
    if (typeof window === "undefined") return "";
    const base = this.apiBase();
    try {
      const url = new URL(base);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return `${url.origin}/ws`;
    } catch {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/ws`;
    }
  }

  connect(): void {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.resolveUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.connected = true;
      this.retries = 0;
      this.emitStatus();
      // Yeniden bağlandığında tüm abonelikleri yenile.
      this.watched.forEach((roomId) => {
        const code = this.codes.get(roomId);
        if (code) this.send({ type: "watch", roomId, code });
      });
    };

    socket.onmessage = (event) => {
      try {
        let message: unknown = JSON.parse(String(event.data));
        // Savunma: bazı ara katmanlar paketi ikez kez sarmış olabilir.
        if (typeof message === "string") message = JSON.parse(message);
        const data = message as { type?: string; roomId?: string; hasToken?: boolean; count?: number; status?: string; lastSyncAt?: number; error?: string | null; code?: string };
        if (data?.type === "config") {
          this.hasToken = Boolean(data.hasToken);
          this.emitStatus();
          return;
        }
        if (data?.type === "attendance" && typeof data.roomId === "string") {
          const listeners = this.listeners.get(data.roomId);
          if (!listeners?.size) return;
          const payload: ServerAttendance = {
            roomId: data.roomId,
            code: String(data.code ?? ""),
            count: Number(data.count) || 0,
            status: (data.status as ServerAttendance["status"]) ?? "idle",
            lastSyncAt: typeof data.lastSyncAt === "number" ? data.lastSyncAt : null,
            error: data.error ?? null,
          };
          listeners.forEach((listener) => listener(payload));
        }
      } catch {
        // Bozuk paket yoksayılır.
      }
    };

    const drop = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.connected = false;
      this.emitStatus();
      this.scheduleReconnect();
    };

    socket.onclose = drop;
    socket.onerror = () => socket.close();
  }

  private codes = new Map<string, string>();

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = RECONNECT_DELAYS[Math.min(this.retries, RECONNECT_DELAYS.length - 1)];
    this.retries += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private emitStatus(): void {
    const status = { connected: this.connected, hasToken: this.hasToken };
    this.statusListeners.forEach((listener) => listener(status));
  }

  /** Bir odayı takip etmeye başlar. */
  watch(roomId: string, code: string, listener: Listener): () => void {
    this.codes.set(roomId, code.toLowerCase());
    const set = this.listeners.get(roomId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(roomId, set);

    if (!this.watched.has(roomId)) {
      this.watched.add(roomId);
      this.send({ type: "watch", roomId, code: code.toLowerCase() });
    }
    this.connect();

    return () => {
      set.delete(listener);
      if (!set.size) {
        this.listeners.delete(roomId);
        this.watched.delete(roomId);
        this.codes.delete(roomId);
        this.send({ type: "unwatch", roomId });
      }
    };
  }

  onStatus(listener: (status: ServerStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener({ connected: this.connected, hasToken: this.hasToken });
    return () => this.statusListeners.delete(listener);
  }

  /** Erişim token'ını gövdeyle iletir; URL'ye ve hafızaya yazılmaz. */
  async saveToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBase()}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) return false;
      this.hasToken = Boolean(token.trim());
      this.emitStatus();
      return true;
    } catch {
      return false;
    }
  }

  async clearToken(): Promise<void> {
    await this.saveToken("");
  }
}

export const backend = new BackendClient();

/** Kod değerinden Meet odası kodu çıkarır. */
export function codeFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/|\/$/g, "");
    return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(path) ? path.toLowerCase() : "";
  } catch {
    return "";
  }
}
