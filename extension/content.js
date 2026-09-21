// Meet sayfasında çalışır: odadaki kişi sayısını bulur, Aks Online sunucusuna yollar.
// Sağ altta küçük bir rozet gösterir: kaç kişi buldu, gönderildi mi.

const ENDPOINT = "http://127.0.0.1:8787/api/presence";

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
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-tooltip") || ""} ${el.textContent || ""}`;
    const m = text.match(/(\d+)/);
    if (m) return Number(m[1]);
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
  return document.querySelectorAll(
    '[data-test-id="participant_name"], [data-test-id="participant-list-item"]'
  ).length;
}

/* --- 4) Etiket taraması (yedek) --- */
function countFromLabels() {
  let best = 0;
  document.querySelectorAll("[aria-label], [data-tooltip]").forEach((node) => {
    const text = `${node.getAttribute("aria-label") || ""} ${node.getAttribute("data-tooltip") || ""}`;
    const m = text.match(/(\d+)\s*(people|participants|kişi|katılımcı)/i);
    if (m) best = Math.max(best, Number(m[1]));
  });
  return best;
}

function participantCount() {
  return Math.max(countFromElement(), countFromTiles(), countFromList(), countFromLabels());
}

/* --- Rozet: kullanıcı eklentinin çalışıp çalışmadığını görsün --- */
let badge = null;
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
  const count = participantCount();
  if (count < 1) {
    setBadge(`${code} · katılımcı okunamadı`, false);
    return;
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, count, source: "meet-tab" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setBadge(`${code} · ${count} kişi → panel`, (data.updated ?? 0) > 0);
    } else {
      setBadge(`${code} · ${count} kişi → panel yok`, false);
    }
  } catch {
    setBadge(`${code} · ${count} kişi → sunucu yok`, false);
  }
}

report();
setInterval(report, 2000);
