/** Official WhatsApp Cloud API (not WhatsApp Web scraping). */

export interface WhatsAppConfig {
  enabled: boolean;
  phoneNumberId: string;
  accessToken: string;
  to: string;
  template: string;
}

export function fillTemplate(template: string, vars: { name: string; room: string; time: string }): string {
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{room\}/g, vars.room)
    .replace(/\{time\}/g, vars.time);
}

export function digitsPhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export async function sendWhatsAppText(config: WhatsAppConfig, text: string, signal?: AbortSignal): Promise<{ ok: boolean; detail: string }> {
  const phoneId = config.phoneNumberId.trim();
  const token = config.accessToken.trim();
  const to = digitsPhone(config.to);
  if (!phoneId || !token || !to) return { ok: false, detail: "WhatsApp Cloud API: numara kimliği, token veya alıcı eksik" };
  if (!/^\d{10,15}$/.test(to)) return { ok: false, detail: "Alıcı numara uluslararası formatta olmalı (örn. 905xxxxxxxxx)" };
  if (!/^\d+$/.test(phoneId)) return { ok: false, detail: "Phone Number ID geçersiz" };

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: text.slice(0, 1024) },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, detail: `WhatsApp API ${res.status}${body ? `: ${body.slice(0, 180)}` : ""}` };
    }
    return { ok: true, detail: "WhatsApp mesajı gönderildi" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ağ hatası";
    return { ok: false, detail: `WhatsApp gönderilemedi: ${msg}` };
  }
}
