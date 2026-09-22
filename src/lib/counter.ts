/**
 * Sayaç çekirdeği — saf, yan etkisiz, test edilebilir.
 *
 * Kural:
 *   odada en az 1 kişi  → sayaç BAŞLAR
 *   oda boşalır (0 kişi)→ sayaç DURUR, biriken süre saklanır
 *   tekrar girilir      → kaldığı yerden DEVAM eder
 */

export interface CounterState {
  /** Durdurulana kadar biriken toplam ms. */
  accum: number;
  /** Segmentin başladığı an; sayaç akıyorsa null değildir. */
  startAt: number | null;
}

export const emptyCounter: CounterState = { accum: 0, startAt: null };

/** Toplantı sürümünü (giriş/çıkış) yeni duruma uygular. Değişiklik yoksa aynı nesneyi döndürür. */
export function advanceCounter(state: CounterState, running: boolean, now: number): CounterState {
  if (running) {
    // İçeri biri girdi: segment açılmamışsa açılır, açık segmente dokunulmaz.
    return state.startAt === null ? { accum: state.accum, startAt: now } : state;
  }
  // Oda boşaldı: geçen süreyi biriktir ve segmenti kapat.
  if (state.startAt === null) return state;
  return { accum: state.accum + Math.max(0, now - state.startAt), startAt: null };
}

/** Oda içindeki kişi sayısı: sunucu canlı veriyorsa o, değilse elle eklenen katılımcılar. */
export function resolveLivePresent(serverLive: boolean, serverCount: number, manualPresent: number): number {
  if (!Number.isFinite(serverCount) || serverCount < 0) serverCount = 0;
  if (!Number.isFinite(manualPresent) || manualPresent < 0) manualPresent = 0;
  return serverLive ? serverCount : manualPresent;
}

/** O anki toplam gösterilen süre (biriken + henüz durdurulmamış segment). */
export function counterMs(state: CounterState, now: number): number {
  if (state.startAt === null) return Math.max(0, state.accum);
  return Math.max(0, state.accum) + Math.max(0, now - state.startAt);
}
