// Meet sayfasında çalışır: odadaki kişi sayısını bulur, Aks Online sunucusuna yollar.
// Sağ altta küçük bir rozet gösterir: kaç kişi buldu, gönderildi mi.

// Sunucu adresleri: önce yerel (Baslat.bat), sonra yayınlanan Render adresi denenir.
// Yayın adresinizi değiştirmek isterseniz aşağıdaki satırı kendi adresinizle değiştirin.
const HOSTED_ORIGIN = "https://aks-online.onrender.com";
const LOCAL_ORIGINS = ["http://127.0.0.1:8787", "http://localhost:8787"];
const ENDPOINT_PATH = "/api/presence";

let apiOrigin = null; // Çalışan sunucu adresi (bulunduğunda saklanır).

function candidateOrigins(stored) {
  return [...new Set([stored, ...LOCAL_ORIGINS, HOSTED_ORIGIN].filter(Boolean))];
}

async function storedOrigin() {
  try {
    const data = await chrome.storage?.local.get("apiOrigin");
    return data?.apiOrigin || "";
  } catch {
    return "";
  }
}

/** Çalışan sunucuyu bulur; bulunan adres hatırlanır ki sonraki gönderimler hızlı olsun. */
async function resolveOrigin() {
  if (apiOrigin) return apiOrigin;
  const candidates = candidateOrigins(await storedOrigin());
  for (const origin of candidates) {
    try {
      const res = await fetch(`${origin}/api/health`, { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        apiOrigin = origin;
        try { await chrome.storage?.local.set({ apiOrigin: origin }); } catch { /* depo yoksa yoksay */ }
        return origin;
      }
    } catch {
      // Bu adres çalışmıyor, sıradakini dene.
    }
  }
  return null;
}

function meetingCode() {
  const path = location.pathname.replace(/^\/|\/$/g, "").split("/")[0] || "";
  return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(path) ? path.toLowerCase() : "";
}

/* --- 1) Sayı yazan buton: katılımcı listesini açan buton sayıyı içerir --- */
function countFromElement() {
  const selectors = [
    '[data-test-id="participant_count"]',
    '[data-test-id="people_count"]',
    '[data-test-id="people-icon-button"]',
    '[data-test-id="participant-list-icon"]',
  ];
  const candidates = selectors.flatMap((sel) => [...document.querySelectorAll(sel)]);
  candidates.push(...document.querySelectorAll('button[aria-label], [role="button"][aria-label]'));
  for (const el of candidates) {
    const text = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-tooltip") || ""} ${el.textContent || ""}`;
    const m = text.match(/(?:people|participants|kişi|katılımcı|personas|participants?)\D{0,12}(\d+)|(\d+)\D{0,12}(?:people|participants|kişi|katılımcı|personas|participants?)/i);
    if (m) return Number(m[1] || m[2]);
  }
  return 0;
}

/* --- 2) Video karoları: her katılımcının karosu data-participant-id taşır --- */
function countFromTiles() {
  const ids = new Set();
  document.querySelectorAll('[data-participant-id]').forEach((node) => {
    const id = node.getAttribute("data-participant-id");
    if (id) ids.add(id);
  });
  return ids.size;
}

/* --- 3) Katılımcı listesi açıkken: satır sayısını say --- */
function countFromList() {
  const rows = document.querySelectorAll(
    '[data-test-id="participant_name"], [data-test-id="participant-list-item"], [data-participant-id], [role="listitem"][aria-label]'
  );
  return new Set([...rows].map((node) => node.getAttribute("data-participant-id") || node.textContent?.trim()).values()).size;
}

/* --- 4) Etiket taraması (yedek) --- */
function countFromLabels() {
  let best = 0;
  document.querySelectorAll("[aria-label], [data-tooltip]").forEach((node) => {
    const text = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("data-tooltip") || ""}`;
    const m = text.match(/(?:people|participants|kişi|katılımcı|personas)\D{0,12}(\d+)|(\d+)\D{0,12}(?:people|participants|kişi|katılımcı|personas)/i);
    if (m) best = Math.max(best, Number(m[1] || m[2]));
  });
  return best;
}

function participantCount() {
  return Math.max(countFromElement(), countFromTiles(), countFromList(), countFromLabels());
}

/* --- Rozet: kullanıcı eklentinin çalışıp çalışmadığını görsün --- */
let badge = null;
let reportTimer = null;
let reportQueued = false;
function ensureBadge() {
  if (badge && document.body?.contains(badge)) return badge;
  badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed;right:12px;bottom:70px;z-index:2147483647;display:flex;gap:6px;align-items:center;" +
    "padding:4px 9px;border-radius:999px;background:rgba(15,23,42,.88);color:#e2e8f0;" +
    "font:11px/1.4 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none;";
  (document.body || document.documentElement).appendChild(badge);
  return badge;
}

function setBadge(text, ok) {
  const el = ensureBadge();
  el.innerHTML =
    `<span style="width:7px;height:7px;border-radius:50%;background:${ok ? "#34d399" : "#f87171"}"></span>` +
    `<span>Aks ${text}</span>`;
}

async function report() {
  const code = meetingCode();
  if (!code) {
    setBadge("bu sayfada değil", false);
    return;
  }
  const origin = await resolveOrigin();
  if (!origin) {
    setBadge("sunucu yok", false);
    return;
  }
  const count = participantCount();
  try {
    const res = await fetch(`${origin}${ENDPOINT_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, count, source: "meet-tab" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setBadge(`${code} · ${count} kişi → panel`, (data.updated ?? 0) > 0 || count === 0);
    } else {
      setBadge(`${code} · ${count} kişi → panel yok`, false);
    }
  } catch {
    setBadge(`${code} · ${count} kişi → sunucu yok`, false);
  }
}

function queueReport() {
  if (reportQueued) return;
  reportQueued = true;
  window.clearTimeout(reportTimer);
  reportTimer = window.setTimeout(() => {
    reportQueued = false;
    void report();
  }, 150);
}

void report();
window.setInterval(() => void report(), 2000);
new MutationObserver(queueReport).observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["aria-label", "data-tooltip", "data-participant-id"],
});
