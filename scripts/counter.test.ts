import { strict as assert } from "node:assert";
import { advanceCounter, counterMs, emptyCounter, resolveLivePresent } from "../src/lib/counter.ts";
import { intervalDuration, isPresent, joinManual, leaveManual } from "../src/lib/attendance.ts";

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

console.log("\n2) Sayı kaynağı: sunucu varsa sunucu, yoksa elle eklenen katılımcı");
{
  assert.equal(resolveLivePresent(true, 3, 5), 3, "canlı sayı geldiğinde sunucu geçerli");
  assert.equal(resolveLivePresent(false, 3, 5), 5, "sunucu yokken manuel katılımcılar sayılır");
  assert.equal(resolveLivePresent(false, 0, 0), 0, "kimse yoksa sayaç kapalı");
  assert.equal(resolveLivePresent(true, -4, 0), 0, "bozuk sayı 0'a düşer");
  ok("kaynak önceliği doğru");
}

console.log("\n3) Manuel katılım kaydı: giriş/çıkış");
{
  let people = joinManual([], "Ayşe", T0);
  assert.equal(isPresent(people[0]), true, "giren katılımcı içeride");
  people = leaveManual(people, people[0].id, T0 + 30_000);
  assert.equal(isPresent(people[0]), false, "çıkan katılımcı dışarıda");
  assert.equal(intervalDuration(people[0].sessions, T0 + 30_000), 30_000, "oturum süresi doğru");
  people = joinManual(people, "ayşe", T0 + 60_000);
  assert.equal(people.length, 1, "aynı isim mükerrer kişi açmaz");
  assert.equal(people[0].sessions.length, 2, "ikinci gelişte yeni oturum açılır");
  assert.equal(isPresent(people[0]), true, "tekrar gelen yeniden içeride sayılır");
  assert.equal(intervalDuration(people[0].sessions, T0 + 90_000), 60_000, "iki oturum toplanır, üste yazmaz");
  ok("aynı kişi tekrar girince yeni oturum açılır");
}

console.log(`\nSonuç: ${checks} kontrol geçti.`);
