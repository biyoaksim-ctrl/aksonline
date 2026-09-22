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

/** Odaya en az bu kadar kişi katıldığında sayaç başlar. */
export const MEETING_THRESHOLD = 2;

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

/** İçeride kaç kişi olduğu: sayaç yalnızca sunucudan gelen canlı sayıya göre çalışır. */
export function resolveLivePresent(serverLive: boolean, serverCount: number): number {
  if (!serverLive) return 0;
  if (!Number.isFinite(serverCount) || serverCount < 0) return 0;
  return Math.floor(serverCount);
}

/** Sayaç şu an çalışıyor mu: içerideki kişi sayısı eşiğe (varsayılan 2) ulaştı mı. */
export function isMeetingRunning(serverLive: boolean, serverCount: number, threshold: number = MEETING_THRESHOLD): boolean {
  return resolveLivePresent(serverLive, serverCount) >= threshold;
}

/** O anki toplam gösterilen süre (biriken + henüz durdurulmamış segment). */
export function counterMs(state: CounterState, now: number): number {
  if (state.startAt === null) return Math.max(0, state.accum);
  return Math.max(0, state.accum) + Math.max(0, now - state.startAt);
}
