// ─── PARA YARDIMCILARI ──────────────────────────────────────────────────────
// Türkçe biçim: binlik ayırıcı nokta, ondalık ayırıcı virgül ("1.234,50").

/** "1.234,50" gibi bir metni sayıya çevirir. Sayı gelirse olduğu gibi döner. */
export function tv(val: string | number | null | undefined): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const s = val.toString().trim().replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const tamSayi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const kurusluSayi = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esnekSayi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

/** Tam sayıya yuvarlayarak gösterir: 1234.6 → "1.235" */
export const fmt = (v: number): string => tamSayi.format(Math.round(v || 0));
/** Her zaman 2 ondalık: 1234.5 → "1.234,50" */
export const fmt2 = (v: number): string => kurusluSayi.format(v || 0);
/** Kuruş varsa gösterir, yoksa göstermez: 1234 → "1.234", 1234.5 → "1.234,5" */
export const fmtEsnek = (v: number): string => esnekSayi.format(v || 0);

/** Kısa gösterim: 1.250.000 → "₺1.3M", 45.000 → "₺45K" */
export function fmtK(v: number): string {
  const mutlak = Math.abs(v);
  const isaret = v < 0 ? "-" : "";
  if (mutlak >= 1_000_000) return `${isaret}₺${(mutlak / 1_000_000).toFixed(1)}M`;
  if (mutlak >= 1_000) return `${isaret}₺${(mutlak / 1_000).toFixed(0)}K`;
  return `${isaret}₺${fmt(mutlak)}`;
}

/**
 * Para giriş kutusu için biçimlendirici. Kullanıcı yazarken çağrılır.
 * Eskiden değer her tuşta sayıya çevrilip geri biçimlendiriliyordu; bu yüzden
 * virgül siliniyor ve kuruş girilemiyordu. Artık yazılan metin korunuyor,
 * sadece tam kısım gruplanıyor ve en fazla 2 ondalık basamağa izin veriliyor.
 *   "1234"    → "1.234"
 *   "1234,"   → "1.234,"
 *   "1234,567"→ "1.234,56"
 */
export function paraGirdisi(ham: string): string {
  if (!ham) return "";
  // Sadece rakam, nokta ve virgül kalsın. Noktalar binlik ayırıcı sayılır.
  const temiz = ham.replace(/[^\d,]/g, "");
  const virgulIdx = temiz.indexOf(",");
  let tam = virgulIdx === -1 ? temiz : temiz.slice(0, virgulIdx);
  const ondalik = virgulIdx === -1 ? null : temiz.slice(virgulIdx + 1).replace(/,/g, "").slice(0, 2);
  tam = tam.replace(/^0+(?=\d)/, "");
  const gruplu = tam ? tamSayi.format(Number(tam)) : (ondalik !== null ? "0" : "");
  return ondalik === null ? gruplu : `${gruplu},${ondalik}`;
}

/** Kayıtlı bir sayıyı giriş kutusuna yüklemek için metne çevirir (kuruşu korur). 0 → "" */
export function paraYaz(v: number | null | undefined): string {
  if (!v) return "";
  return esnekSayi.format(v);
}
