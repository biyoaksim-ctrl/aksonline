import { strict as assert } from "node:assert";
import { advanceCounter, counterMs, emptyCounter, resolveLivePresent } from "../src/lib/counter.ts";

const T0 = 1_700_000_000_000;
let checks = 0;
const ok = (label: string) => { checks += 1; console.log(`  ✓ ${label}`); };

console.log("\n1) Sayaç: girince başlar, çıkınca durur, gelince devam eder");
{
  let s = emptyCounter;
  s = advanceCounter(s, false, T0);
  assert.equal(s.startAt, null, "odada kimse yokken sayaç başlamamalı");
  ok("boş odada başlamaz");

  s = advanceCounter(s, true, T0 + 1_000);
  assert.equal(s.startAt, T0 + 1_000, "ilk katılımcıda başlar");
  ok("katılımcı girince başlar");

  s = advanceCounter(s, true, T0 + 6_000);
  assert.equal(s.startAt, T0 + 1_000, "açık segment açılış zamanını kaybetmez");
  assert.equal(counterMs(s, T0 + 6_000), 5_000, "1 sn sonra giren 5 sn sayar");
  ok("akarken süre akar");

  s = advanceCounter(s, false, T0 + 11_000);
  assert.equal(s.startAt, null, "oda boşalınca durur");
  assert.equal(s.accum, 10_000, "geçen süre saklanır");
  assert.equal(counterMs(s, T0 + 60_000), 10_000, "durduktan sonra süre artmaz");
  ok("çıpınca durur ve süreyi saklar");

  s = advanceCounter(s, false, T0 + 70_000);
  assert.equal(s.accum, 10_000, "tekrar boş geçiş biriktirmez");
  ok("boş odada beklemek süreyi şişirmez");

  s = advanceCounter(s, true, T0 + 80_000);
  s = advanceCounter(s, false, T0 + 85_000);
  assert.equal(s.accum, 15_000, "ikinci ziyaret birikince devam eder");
  assert.equal(counterMs(s, T0 + 90_000), 15_000);
  ok("tekrar girince kaldığı yerden devam eder");
}

console.log("\n2) Sayı kaynağı: yalnızca sunucudan gelen canlı sayı");
{
  assert.equal(resolveLivePresent(true, 3), 3, "canlı sayı geldiğinde sayaç onu izler");
  assert.equal(resolveLivePresent(false, 3), 0, "sunucu yokken sayı yoktur, sayaç başlamaz");
  assert.equal(resolveLivePresent(false, 0), 0, "kimse yoksa sayaç kapalı");
  assert.equal(resolveLivePresent(true, -4), 0, "bozuk sayı 0'a düşer");
  assert.equal(resolveLivePresent(true, 2.7), 2, "kesirli sayı alta yuvarlanır");
  ok("sayaç yalnızca karşıdan katılan gerçek kişi sayısına göre çalışır");
}

console.log(`\nSonuç: ${checks} kontrol geçti.`);
