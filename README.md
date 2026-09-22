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

### Tek tıkla (önerilen)

`Baslat.bat` dosyasına **çift tıklayın**. Node.js kuruluysa kurulum, derleme ve sunucu
başlangıcı tek adımda yapılır, tarayıcı `http://localhost:8787` adresinde açılır.

### Elle

```bash
npm install
npm run build
npm start           # http://localhost:8787
```

Geliştirme için iki terminal:

```bash
npm run dev             # arayüz :5173
npm run server          # sunucu :8787
```

## Testler

```bash
npm test     # sayaç kuralları: başlar / durur / kaldığı yerden devam eder
```

`src/lib/counter.ts` içindeki saf sayaç çekirdeği hem LaneFrame bileşeninde hem de
`scripts/counter.test.ts` içinde aynı fonksiyonları kullanır.

## Web'de yayınlama

### 1) GitHub Pages — anında yayında (sunucusuz)

Her `main`'e push `.github/workflows/deploy.yml` ile otomatik yayınlanır:

**https://biyoaksim-ctrl.github.io/aksonline/**

Bu yayında Node sunucusu yoktur. Arayüz çalışır, paneller/zoom/tema/raporlar çalışır,
katılımcı **elle** eklenir ve sayaç aynı kuralla çalışır (ilk kişi girince başlar,
son kişi çıkınca durur). Sol panelin altında "Sunucu yok · manuel takip" yazar.

### 2) Render.com — canlı katılımcı sayısı ile

Canlı Meet sayısının gelmesi için Node sunucusunun da yayınlanması gerekir.

1. Bu repoyu GitHub'a itin (bitti: https://github.com/biyoaksim-ctrl/aksonline)
2. [render.com](https://render.com) → **Sign in with GitHub** → **New +** → **Blueprint** → `aksonline` → **Apply**
   (`render.yaml` build/start/health ayarlarını otomatik getirir)
3. Yayındaki adres: **https://aks-online.onrender.com** ✓ (canlı, `/api/health` yanıt verir)
4. Paneli bu adreste açın; sol alttaki durum noktası yeşile döner
5. Chrome eklentisi bu adresi `extension/content.js` içindeki `HOSTED_ORIGIN` sabitinden okur;
   eklenti zaten yüklüyse `chrome://extensions` → **Yeniden yükle** demek yeterlidir

Notlar:

- Render ücretsiz planında servis birkaç dakika işlem yapmazsa uykuya dalar; ilk istekte
  uyanır. `healthCheckPath: /api/health` bunu hızlandırır.
- Sunucu `HOST` (varsayılan `0.0.0.0`) ve `PORT` üzerinde dinler.
- `dist/` repoda hazır durur ama yayınlarda `npm run build` ile tazelenir.
- GitHub'a her push, Render otomatik yayını (`autoDeploy: true`) ve GitHub Pages'i tetikler.

### Yayın adresini eklentiye tanıma

Yayında canlı sayı için Chrome eklentisinin Render adresine de ulaşması gerekir.
`extension/content.js` içindeki satırı kendi adresinizle değiştirin:

```js
const HOSTED_ORIGIN = "https://aks-online.onrender.com"; // bu depoda zaten böyle
```

Sonra `chrome://extensions` → **Yükleme geliştirici modu** → **Paketlenmemiş yüklemeyi
ekle** ile `extension/` klasörünü yükleyin (zaten yüklüyse **Yeniden yükle** yeterlidir).
Eklenti önce yerel sunucuyu, sonra yayın adresini dener; çalışan adresi hatırlar ve
rozette `→ panel` yazar. Bu depoda `HOSTED_ORIGIN` zaten `https://aks-online.onrender.com`
olarak tanımlıdır.

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `PORT` | `8787` | Sunucu portu |
| `HOST` | `0.0.0.0` | Dinlenecek arayüz |
| `GOOGLE_ACCESS_TOKEN` | — | Başlangıç token'ı (isteğe bağlı) |

```bash
GOOGLE_ACCESS_TOKEN=ya1.a0Af… npm run server
```

Token arayüzden de girilebilir: **Ayarlar → Sunucu ve canlı katılımcı algılama**.

## Sayaç kuralı

- Odada **1 veya daha fazla kişi** olduğunda sayaç başar (canlı sayı `1` olduğunda).
- Sayı 0 olunca sayaç durur; biriken süre saklanır ve kaybolmaz.
- Katılımcı tekrar girdiğinde sayaç kaldığı yerden devam eder.
- Sayaç zaman damgasına dayanır; sekme arka plana alınsa da kaymaz.
- Sunucu yokken paneldekilerle **elle eklenen katılımcılar** da aynı kuralı işletir:
  ilk kişi girince başlar, son kişi çıkınca durur.

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
| `GET /api/health` | Durum, token varlığı ve Render sağlık kontrolü |
| `POST /api/config` | Token gönder/gizle (gövdeyle, loglanmaz) |
| `POST /api/presence` | Meet eklentisinden gelen canlı sayı |
| `GET /api/rooms` | Oda bazlı sayaç ve eşzamanlama durumu |
| `WS /ws` | `watch` / `unwatch` / `config` |

## Sunucu yoksa ne olur?

Yalnızca `dist/` statik yayınlandığında arayüz çalışmaya devam eder:
- Paneller, zoom, tema, logo, raporlar, WhatsApp çalışır
- Katılımcılar elle eklenir (`+` düğmesi), sayaç yine 1+ kişide başlar
- Sol panelin altında "Sunucu yok · manuel takip" yazar

## Dosya düzeni

```
src/
  server/
    index.js        Express + WebSocket + statik servis
    googleMeet.js   Meet REST API çağrıları
  lib/
    backend.ts      Arayüzün sunucu istemcisi
    counter.ts      Sayaç çekirdeği (girince başlar, çıkınca durur)
    reports.ts      Rapor kayıtları ve CSV
    whatsapp.ts     WhatsApp Cloud API
    meet.ts         URL, zoom, süre yardımcıları
  components/
    LaneFrame.tsx   Bağımsız çerçeve, sayaç, zoom
scripts/
  counter.test.ts   Sayaç kuralları testi (npm test)
extension/          Chrome eklentisi: Meet sayısını sunucuya yollar
render.yaml         Render.com yayın tanımı
Baslat.bat          Windows için tek tıkla başlatma
```
