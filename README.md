# Aks Online — Meet Panel

React arayüz + Node.js sunucu. Katılımcı sayısı Google Meet REST API üzerinden sunucuda okunur ve WebSocket ile arayüze canlı iletilir.

## Neden sunucu şart?

| Sorun | Neden çözüldü |
| --- | --- |
| Google Meet API CORS'a izin vermez | İstek sunucudan yapılır |
| Erişim token'ı tarayıcıda tutmak riskli | Token sunucu belleğinde kalır |
| Çoklu oda ayrı ayrı yoklarsa kota tükenir | Tek döngüde tüm odalar yoklanır |
| Tarayıcı Meet sayfasını okuyamaz | Sunucu resmi API'yi kullanır |

## Kurulum

```bash
npm install
npm run build
node src/server/index.js  # http://localhost:8787
```

Geliştirme için iki terminal:

```bash
npm run dev             # arayüz :5173
node src/server/index.js # sunucu :8787
```

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | `8787` | Sunucu portu |
| `GOOGLE_ACCESS_TOKEN` | — | Başlangıç token'ı (isteğe bağlı) |

```bash
GOOGLE_ACCESS_TOKEN=ya1.a0Af… npm run server
```

Token arayüzden de girilebilir: **Ayarlar → Sunucu ve canlı katılımcı algılama**.

## Sayaç kuralı

- Sunucu bildirdiği katılımcı sayısı **2'ye çıktığı anda** sayaç başlar.
- Sayı 1'e düşerse sayaç durur ve sıfırlanır.
- Tekrar 2 olunca sayaç sıfırdan yeniden başlar.
- Sayaç zaman damgasına dayanır; sekme arka plana alınsa da kaymaz.

## Google Meet API yetkisi

Gerekli kapsam:

```
https://www.googleapis.com/auth/meetings.space.readonly
```

1. Google Cloud Console'da proje aç
2. **Google Meet API**'yi etkinleştir
3. OAuth consent screen → yukarıdaki kapsamı ekle
4. Erişim tokenı al
5. Arayüze veya `GOOGLE_ACCESS_TOKEN` değişkenine gir

Toplantı kayıtlarına erişim yetkiniz olmalı. Kayıtlar gecikmeli oluşabilir; sunucu 6 saniyede bir bekler, aktifken 15 saniyede bir yoklar.

## Sunucu uçları

| Uç | Amaç |
| --- | --- |
| `GET /api/health` | Durum ve token varlığı |
| `POST /api/config` | Token gönder/gizle (gövdeyle, loglanmaz) |
| `GET /api/rooms` | Oda bazlı sayaç ve eşzamanlama durumu |
| `WS /ws` | `watch` / `unwatch` / `attendance` / `config` |

## Sunucu yoksa ne olur?

Yalnızca `dist/` statik yayınlandığında arayüz çalışmaya devam eder:
- Paneller, zoom, tema, logo, raporlar, WhatsApp çalışır
- Katılımcılar elle eklenir (`+` düğmesi), sayaç yine 2+ kişide başlar
- Sol panelin altında "Sunucu yok · manuel takip" yazar

## Dosya düzeni

```
src/
  server/
    index.js        Express + WebSocket + statik servis
    googleMeet.js   Meet REST API çağrıları
  lib/
    backend.ts      Arayüzün sunucu istemcisi
    reports.ts      Rapor kayıtları ve CSV
    whatsapp.ts     WhatsApp Cloud API
    meet.ts         URL, zoom, süre yardımcıları
  components/
    LaneFrame.tsx   Bağımsız çerçeve, sayaç, zoom
```
