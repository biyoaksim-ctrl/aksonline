/**
 * WebSocket yayın testi — çift JSON sarmalama (regression) denetimi.
 *
 * Hata geçmişi: sunucu mesajı iki kez stringify edince arayüz eline
 * "string içinde string" alıyor, `message.type` okunamıyor ve canlı sayı
 * sessizce yutuluyordu. Bu test tam olarak onu yakalar.
 *
 * Sunucu kapalıysa test atlanır (exit 0): `Baslat.bat` açıkken `npm test` ile çalışır.
 */
import { strict as assert } from "node:assert";
import { WebSocket } from "ws";

const BASE = process.env.TEST_ORIGIN ?? "http://127.0.0.1:8787";
const WS_URL = BASE.replace(/^http/, "ws") + "/ws";
const CODE = "abc-defg-hij";
/** Her çalıştırmada yeni oda: sunucu odayı "idle" (SAYI GELMİYOR) ile açmalı. */
const ROOM_ID = `ws-test-${Date.now()}`;
const TIMEOUT_MS = 15000;

async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await serverUp())) {
    console.log(`\n[ws] ${BASE} çalışmıyor — WebSocket testi atlandı.`);
    console.log("[ws] Tam test için 'Baslat.bat' açıkken 'npm test' çalıştırın.");
    return;
  }

  const messages: unknown[] = [];
  const socket = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "watch", roomId: ROOM_ID, code: CODE }));
      setTimeout(() => {
        void fetch(`${BASE}/api/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://meet.google.com" },
          body: JSON.stringify({ code: CODE, count: 2, source: "meet-tab" }),
        }).catch(() => { /* yanıt beklenen senaryoda kritik değil */ });
      }, 500);
      setTimeout(resolve, 4000);
    });
    socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
    socket.on("error", reject);
  });

  socket.close();

  // 1) Her paket gerçekten bir OBJE olmalı (string ise çift sarmalanmıştır).
  messages.forEach((message, index) => {
    assert.equal(typeof message, "object", `mesaj #${index} object olmalı, çıktı: ${typeof message}`);
    assert.ok(message !== null && !Array.isArray(message), `mesaj #${index} düz nesne olmalı`);
  });

  // 2) İzleme yanıtının kendisi doğru tipte olmalı.
  const first = messages.find((m) => (m as { type?: string }).type === "attendance") as { roomId?: string } | undefined;
  assert.ok(first, "watch anında attendance yanıt gelmeli");

  // 3) Gönderilen sayı, canlı durumla geri dönmeli.
  const live = messages.find((m) => {
    const item = m as { type?: string; count?: number; status?: string };
    return item.type === "attendance" && item.count === 2 && item.status === "live";
  }) as { roomId?: string } | undefined;
  assert.ok(live, "count=2 / status=live mesajı WS ile yayınlanmış olmalı");
  assert.equal(live.roomId, ROOM_ID, "mesaj doğru izleyiciye ulaşmalı");

  // 4) Teşhis durumları: yeni oda "idle" (SAYI GELMİYOR) ile açılmalı.
  const firstStatus = (first as unknown as { status?: string }).status;
  assert.equal(firstStatus, "idle", "yeni açılan oda 'idle' olmalı — panel 'SAYI GELMİYOR' der");

  console.log(`\n[ws] ${messages.length} paket alındı, hepsi nesne ✓ · canlı sayı yayınlandı ✓`);
  console.log("[ws] Teşhis: yeni oda 'idle' ✓ · sayı geldikçe 'live' ✓");
  console.log("[ws] Sonuç: çift JSON sarmalama yok, arayüz mesajı okuyabilir.");
}

void main().then(
  () => process.exit(0),
  (error) => {
    console.error("\n[ws] BAŞARISIZ:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
