// ─── TARİH YARDIMCILARI ─────────────────────────────────────────────────────
// Tüm "bugün" hesapları İstanbul saatine göre yapılır. Eskiden kod
// `new Date().toISOString().split("T")[0]` kullanıyordu; bu UTC tarihini verdiği
// için gece 00:00–03:00 arasında "bugün" bir önceki gün çıkıyordu.

export const SAAT_DILIMI = "Europe/Istanbul";

const pad = (n: number) => String(n).padStart(2, "0");

/** Bir Date nesnesinin İstanbul'daki takvim gününü "YYYY-AA-GG" olarak verir. */
export function istanbulTarihi(d: Date = new Date()): string {
  // en-CA biçimi zaten YYYY-AA-GG üretir.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SAAT_DILIMI, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** İstanbul saatine göre bugünün tarihi (YYYY-AA-GG). */
export const bugun = (): string => istanbulTarihi();

/** "YYYY-AA-GG" tarihine gün ekler/çıkarır (saat dilimi kaymasından etkilenmez). */
export function gunEkle(tarih: string, gun: number): string {
  const [y, m, d] = tarih.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + gun));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** İki "YYYY-AA-GG" tarihi arasındaki gün farkı (b - a). */
export function gunFarki(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Yerel bir Date'i (takvim günü olarak) "YYYY-AA-GG" yapar — toISOString kullanmaz. */
export function yerelTarih(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Ayın ilk günü (YYYY-AA-01). */
export const ayBasi = (tarih: string = bugun()): string => tarih.slice(0, 8) + "01";

/** Ayın son günü. */
export function aySonu(yil: number | string, ay: number | string): string {
  const y = Number(yil), m = Number(ay);
  const son = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(son)}`;
}

/** Bugünün İstanbul'daki ay ve yıl bilgisi ("09", "2026"). */
export function buAyYil(): { ay: string; yil: string } {
  const t = bugun();
  return { ay: t.slice(5, 7), yil: t.slice(0, 4) };
}

/** "YYYY-AA-GG" → "GG.AA.YYYY" */
export function fmtTarih(t?: string | null): string {
  if (!t) return "";
  const [y, m, d] = t.split("-");
  return `${d}.${m}.${y}`;
}
