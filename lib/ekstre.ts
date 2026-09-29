// ─── BANKA EKSTRESİ AYRIŞTIRMA ──────────────────────────────────────────────
// Kasa → "Ekstre yükle" ekranının saf mantığı. Dosya okuma (XLSX) bileşende;
// burada sadece satır dizileri (unknown[][]) üzerinde çalışılır.
//
// Türk bankası ekstrelerinde:
//   "Borç"  = hesaptan ÇIKAN para (−),  "Alacak" = hesaba GİREN para (+).
//   Tutar tek kolonsa işaretli gelir ("-1.234,56" çıkış).

export type EkstreHesap = "TEB" | "VakıfBank" | "Enpara";
export const EKSTRE_HESAPLARI: EkstreHesap[] = ["TEB", "VakıfBank", "Enpara"];

export interface KolonEslesme {
  tarih: number; aciklama: number; tutar: number; borc: number; alacak: number;
}
export interface EkstreSatiri { tarih: string; aciklama: string; tutar: number }
export interface KategoriTahmini {
  tip: "gelir" | "gider"; kategori: string;
  /** Kendi hesaplarımız arası transfer olabilir → varsayılan işaretsiz gelir */
  transfer: boolean;
}

// ─── METİN ─────────────────────────────────────────────────────────────────
/** Büyük harf + Türkçe karakterleri ASCII'ye katlar, boşlukları sadeleştirir. "Üye İşyeri" → "UYE ISYERI" */
export function normalize(s: unknown): string {
  return String(s ?? "")
    .replace(/i/g, "İ").replace(/ı/g, "I")
    .toUpperCase()
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C")
    .replace(/Â/g, "A").replace(/Î/g, "I").replace(/Û/g, "U")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── SAYI ──────────────────────────────────────────────────────────────────
/**
 * Banka tutarını sayıya çevirir. Desteklenen: 1234.5 (sayı), "1.234,56", "-1.234,56",
 * "1234,56", "1,234.56", "(1.234,56)" (negatif), "1.234,56-", "₺1.234,56", "1.234,56 TL".
 * Çözülemezse null.
 */
export function sayiCoz(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  let negatif = false;
  if (/^\(.*\)$/.test(s)) { negatif = true; s = s.slice(1, -1); }
  s = s.replace(/TRY|TL|₺|\s/gi, "");
  if (s.endsWith("-")) { negatif = !negatif; s = s.slice(0, -1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) { negatif = !negatif; s = s.slice(1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const sonNokta = s.lastIndexOf("."), sonVirgul = s.lastIndexOf(",");
  let temiz: string;
  if (sonNokta >= 0 && sonVirgul >= 0) {
    // İkisi de var: sonda olan ondalık ayırıcıdır
    temiz = sonVirgul > sonNokta ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (sonVirgul >= 0) {
    // Tek virgül Türkçe ondalık ("1234,5"); birden çok virgül binlik ("1,234,567")
    const adet = s.split(",").length - 1;
    temiz = adet > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (sonNokta >= 0) {
    const adet = s.split(".").length - 1;
    const sonrasi = s.length - sonNokta - 1;
    // "1.234" Türkçe binlik; "1234.5" / "12.50" ondalık
    temiz = adet > 1 || sonrasi === 3 ? s.replace(/\./g, "") : s;
  } else temiz = s;

  const n = parseFloat(temiz);
  if (!Number.isFinite(n)) return null;
  return negatif ? -n : n;
}

// ─── TARİH ─────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
function gecerliTarih(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Excel seri numarası (1900 sistemi) → "YYYY-AA-GG". Saat kısmı atılır. */
export function excelSeriTarih(seri: number): string | null {
  if (!Number.isFinite(seri) || seri < 20000 || seri > 80000) return null;
  const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(seri) * 86400000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Tarih hücresini "YYYY-AA-GG"ye çevirir. Desteklenen: Excel seri numarası,
 * Date, "29.09.2026", "29/09/2026", "29-09-2026", "2026-09-29", "29.09.26",
 * sonunda saat olabilir ("29.09.2026 14:35:10").
 */
export function tarihCoz(v: unknown): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return gecerliTarih(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === "number") return excelSeriTarih(v);
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s].*)?$/);
  if (m) return gecerliTarih(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})(?:\s.*)?$/);
  if (m) return gecerliTarih(+m[3], +m[2], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSeriTarih(Number(s));
  return null;
}

// ─── BAŞLIK / KOLON ────────────────────────────────────────────────────────
const bosEslesme = (): KolonEslesme => ({ tarih: -1, aciklama: -1, tutar: -1, borc: -1, alacak: -1 });

/** Başlık metinlerine bakarak kolonları tahmin eder. */
export function kolonTahmin(basliklar: unknown[]): KolonEslesme {
  const e = bosEslesme();
  const h = basliklar.map(normalize);
  const bul = (kosul: (s: string) => boolean, haric: number[] = []) =>
    h.findIndex((s, i) => !!s && !haric.includes(i) && kosul(s));

  e.tarih = bul(s => s.includes("TARIH") && !s.includes("VALOR"));
  if (e.tarih < 0) e.tarih = bul(s => s.includes("TARIH") || s === "DATE");
  const borcMu = (s: string) => /\bBORC\b|CIKIS|CIKAN|GIDEN|^BORC/.test(s) && !s.includes("BAKIYE");
  const alacakMu = (s: string) => /\bALACAK\b|GIRIS|GIREN|GELEN|^ALACAK/.test(s) && !s.includes("BAKIYE");
  // "Borç/Alacak" gibi tek başlık hem borç hem alacak kelimesi içerir → işaretli tek tutar kolonudur
  const birlesik = bul(s => borcMu(s) && alacakMu(s));
  e.borc = bul(s => borcMu(s) && !alacakMu(s));
  e.alacak = bul(s => alacakMu(s) && !borcMu(s), [e.borc]);
  e.tutar = bul(s => (s.includes("TUTAR") || s === "MIKTAR" || s === "AMOUNT") && !s.includes("BAKIYE") && !borcMu(s) && !alacakMu(s), [e.borc, e.alacak]);
  if (birlesik >= 0 && e.borc < 0 && e.alacak < 0) e.tutar = birlesik;
  else if (e.tutar < 0 && birlesik >= 0) e.tutar = birlesik;
  e.aciklama = bul(s => s.includes("ACIKLAMA") || s.includes("DETAY") || s === "DESCRIPTION");
  if (e.aciklama < 0) e.aciklama = bul(s => s.includes("ISLEM") && !s.includes("TARIH") && !s.includes("TUTAR") && !s.includes("NO"), [e.tarih]);
  return e;
}

/** Eşleme kullanılabilir mi? Tarih + (tutar veya borç/alacak) şart. */
export const eslesmeGecerli = (e: KolonEslesme): boolean =>
  e.tarih >= 0 && (e.tutar >= 0 || e.borc >= 0 || e.alacak >= 0);

/** İlk 40 satır içinde başlık satırını bulur. */
export function baslikBul(satirlar: unknown[][]): { satir: number; eslesme: KolonEslesme } | null {
  let enIyi: { satir: number; eslesme: KolonEslesme; puan: number } | null = null;
  const sinir = Math.min(satirlar.length, 40);
  for (let i = 0; i < sinir; i++) {
    const e = kolonTahmin(satirlar[i] || []);
    if (!eslesmeGecerli(e)) continue;
    const puan = [e.tarih, e.aciklama, e.tutar, e.borc, e.alacak].filter(x => x >= 0).length;
    if (!enIyi || puan > enIyi.puan) enIyi = { satir: i, eslesme: e, puan };
  }
  return enIyi ? { satir: enIyi.satir, eslesme: enIyi.eslesme } : null;
}

/** Başlığın altındaki satırları çözer; tarihi ya da tutarı olmayan satırlar (toplam, boş) atlanır. */
export function satirlariCoz(satirlar: unknown[][], baslikSatir: number, e: KolonEslesme): EkstreSatiri[] {
  const sonuc: EkstreSatiri[] = [];
  for (let i = baslikSatir + 1; i < satirlar.length; i++) {
    const r = satirlar[i] || [];
    const tarih = e.tarih >= 0 ? tarihCoz(r[e.tarih]) : null;
    if (!tarih) continue;
    let tutar: number | null = null;
    if (e.borc >= 0 || e.alacak >= 0) {
      const borc = e.borc >= 0 ? Math.abs(sayiCoz(r[e.borc]) ?? 0) : 0;
      const alacak = e.alacak >= 0 ? Math.abs(sayiCoz(r[e.alacak]) ?? 0) : 0;
      if (borc || alacak) tutar = alacak - borc;
    }
    if (tutar === null && e.tutar >= 0) tutar = sayiCoz(r[e.tutar]);
    if (!tutar) continue;
    const aciklama = e.aciklama >= 0 ? String(r[e.aciklama] ?? "").replace(/\s+/g, " ").trim() : "";
    sonuc.push({ tarih, aciklama, tutar: Math.round(tutar * 100) / 100 });
  }
  return sonuc;
}

// ─── CSV ───────────────────────────────────────────────────────────────────
/** Basit CSV ayrıştırıcı: ayraç otomatik (; , TAB), tırnaklı alanlar desteklenir. */
export function csvCoz(metin: string): string[][] {
  const temiz = metin.replace(/^﻿/, "");
  const ilkSatirlar = temiz.split(/\r?\n/).slice(0, 20).join("\n");
  const say = (c: string) => ilkSatirlar.split(c).length - 1;
  const ayrac = [";", "\t", ","].reduce((a, b) => (say(b) > say(a) ? b : a), ";");
  const satirlar: string[][] = [];
  let satir: string[] = [], alan = "", tirnak = false;
  for (let i = 0; i < temiz.length; i++) {
    const c = temiz[i];
    if (tirnak) {
      if (c === '"' && temiz[i + 1] === '"') { alan += '"'; i++; }
      else if (c === '"') tirnak = false;
      else alan += c;
    } else if (c === '"') tirnak = true;
    else if (c === ayrac) { satir.push(alan); alan = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && temiz[i + 1] === "\n") i++;
      satir.push(alan); satirlar.push(satir); satir = []; alan = "";
    } else alan += c;
  }
  if (alan || satir.length) { satir.push(alan); satirlar.push(satir); }
  return satirlar.filter(s => s.some(x => x.trim() !== ""));
}

// ─── KATEGORİ TAHMİNİ ──────────────────────────────────────────────────────
type Kural = { kelimeler: string[]; kategori: string };

const GELIR_KURALLARI: Kural[] = [
  { kelimeler: ["EDENRED", "METROPOL", "SETCARD", "PLUXEE", "SODEXO", "PAYE", "MULTINET", "TICKET"], kategori: "Yemek Kartı Tahsilatı" },
  { kelimeler: ["YEMEKSEPETI", "YEMEK SEPETI", "TRENDYOL", "MIGROS", "GETIR"], kategori: "Platform Hakedişi" },
  { kelimeler: ["POS", "UIY", "UYE ISYERI", "UYEISYERI"], kategori: "POS / Kart Tahsilatı" },
];
const GIDER_KURALLARI: Kural[] = [
  { kelimeler: ["SGK", "SOSYAL GUVENLIK"], kategori: "SGK Primi" },
  { kelimeler: ["KIRA"], kategori: "Kira" },
  { kelimeler: ["ELEKTRIK", "ENERJISA", "CK ENERJI", "BEDAS", "AYEDAS"], kategori: "Elektrik" },
  { kelimeler: ["IGDAS", "DOGALGAZ", "DOGAL GAZ"], kategori: "Doğalgaz" },
  { kelimeler: ["ISKI", "SU"], kategori: "Su" },
  { kelimeler: ["MAAS"], kategori: "Personel Maaş" },
  { kelimeler: ["KOMISYON", "MASRAF", "UCRET", "BSMV"], kategori: "Banka Komisyonu" },
];
const TRANSFER_KELIMELERI = ["VIRMAN", "HESAPLAR ARASI", "KENDI HESAB", "HESABIMA", "HESABIMIZA"];
const HAVALE_KELIMELERI = ["EFT", "HAVALE", "FAST"];

/** Kısa kelimeler (≤3 harf: POS, SU, SGK, UIY...) sadece tam kelime olarak eşleşir. */
function icerir(metin: string, kelime: string): boolean {
  if (kelime.length > 3) return metin.includes(kelime);
  return new RegExp(`(^|[^A-Z0-9])${kelime}([^A-Z0-9]|$)`).test(metin);
}
const herhangi = (metin: string, kelimeler: string[]) => kelimeler.some(k => icerir(metin, k));

/**
 * Açıklama + tutar yönüne göre tip/kategori önerir.
 * `sirketAdlari`: kendi unvanımızdaki kelimeler (EFT/HAVALE ile birlikte geçerse
 * hesaplar arası transfer sayılır).
 */
export function kategoriTahmin(aciklama: string, tutar: number, sirketAdlari: string[] = ["KEBO"]): KategoriTahmini {
  const a = normalize(aciklama);
  const tip: "gelir" | "gider" = tutar >= 0 ? "gelir" : "gider";
  const sirket = sirketAdlari.map(normalize).filter(Boolean);
  if (herhangi(a, TRANSFER_KELIMELERI) || (herhangi(a, HAVALE_KELIMELERI) && sirket.some(s => icerir(a, s)))) {
    return { tip, kategori: "Hesaplar arası transfer", transfer: true };
  }
  if (tip === "gelir") {
    const k = GELIR_KURALLARI.find(k => herhangi(a, k.kelimeler));
    return { tip, kategori: k?.kategori ?? "Diğer Gelir", transfer: false };
  }
  // Gider: "POS KOMISYONU" gibi satırlar POS Komisyonu olsun
  const k = GIDER_KURALLARI.find(k => herhangi(a, k.kelimeler));
  if (k?.kategori === "Banka Komisyonu" && herhangi(a, ["POS", "UIY", "UYE ISYERI"])) return { tip, kategori: "POS Komisyonu", transfer: false };
  return { tip, kategori: k?.kategori ?? "Diğer Gider", transfer: false };
}

// ─── TEKİLLİK ANAHTARI ─────────────────────────────────────────────────────
/** kasa_manuel_islemler.ekstre_ref (UNIQUE): hesap|tarih|tutar|açıklamanın ilk 60 karakteri */
export function ekstreRef(hesap: string, tarih: string, tutar: number, aciklama: string): string {
  return `${hesap}|${tarih}|${tutar.toFixed(2)}|${normalize(aciklama).slice(0, 60)}`;
}

/**
 * Dosyadaki tüm satırların anahtarları. Aynı gün aynı tutar ve açıklamayla birden
 * çok satır varsa (ör. iki ayrı EFT masrafı) ikincisinden itibaren "#2", "#3" eklenir;
 * aynı dosya tekrar yüklenince aynı anahtarlar üretilir.
 */
export function ekstreRefleri(hesap: string, satirlar: EkstreSatiri[]): string[] {
  const sayac = new Map<string, number>();
  return satirlar.map(s => {
    const ref = ekstreRef(hesap, s.tarih, s.tutar, s.aciklama);
    const n = (sayac.get(ref) || 0) + 1;
    sayac.set(ref, n);
    return n === 1 ? ref : `${ref}#${n}`;
  });
}

// ─── ELLE GİRİLMİŞ KAYITLA EŞLEŞTİRME ──────────────────────────────────────
/** kasa_manuel_islemler'den karşılaştırma için gereken alanlar */
export interface MevcutKasaKaydi {
  id?: string;
  tip: string; // 'gelir' | 'gider' | 'transfer'
  hesap: string | null;
  hedef_hesap?: string | null;
  tutar: number | string | null;
  islem_tarihi: string;
  aciklama?: string | null;
  kategori?: string | null;
  kaynak?: string | null;
}

const tarihGun = (t: string) => Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 86400000;

/**
 * Ekstre satırı (hesap + işaretli tutar) ile elle girilmiş kasa kaydı aynı hareket olabilir mi?
 * Kurallar: kaynak 'banka_ekstre' değil; aynı hesap; aynı yön (giriş = gelir ya da bu hesaba
 * gelen transfer [hedef_hesap], çıkış = gider ya da bu hesaptan çıkan transfer [hesap]);
 * tutar farkı ≤ 1 TL; tarih farkı ≤ 2 gün.
 */
export function kayitEslesirMi(hesap: string, satir: EkstreSatiri, k: MevcutKasaKaydi): boolean {
  if (k.kaynak === "banka_ekstre") return false;
  const giris = satir.tutar > 0;
  let uygun: boolean;
  if (k.tip === "transfer") uygun = giris ? k.hedef_hesap === hesap : k.hesap === hesap;
  else if (k.tip === "gelir") uygun = giris && k.hesap === hesap;
  else if (k.tip === "gider") uygun = !giris && k.hesap === hesap;
  else uygun = false;
  if (!uygun) return false;
  if (Math.abs(Math.abs(satir.tutar) - Math.abs(Number(k.tutar) || 0)) > 1) return false;
  const t = String(k.islem_tarihi || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  return Math.abs(tarihGun(t) - tarihGun(satir.tarih)) <= 2;
}

/**
 * Her ekstre satırı için muhtemelen zaten elle girilmiş kaydı döndürür (yoksa null).
 * Bir kasa kaydı en fazla bir satırla eşleşir; önce tarihi ve tutarı en yakın olan seçilir.
 */
export function muhtemelEslesmeler<K extends MevcutKasaKaydi>(hesap: string, satirlar: EkstreSatiri[], kayitlar: K[]): (K | null)[] {
  const adaylar: { si: number; ki: number; puan: number }[] = [];
  satirlar.forEach((s, si) => kayitlar.forEach((k, ki) => {
    if (!kayitEslesirMi(hesap, s, k)) return;
    const gun = Math.abs(tarihGun(String(k.islem_tarihi).slice(0, 10)) - tarihGun(s.tarih));
    const fark = Math.abs(Math.abs(s.tutar) - Math.abs(Number(k.tutar) || 0));
    adaylar.push({ si, ki, puan: gun * 10 + fark });
  }));
  adaylar.sort((a, b) => a.puan - b.puan || a.si - b.si || a.ki - b.ki);
  const sonuc: (K | null)[] = satirlar.map(() => null);
  const kullanilan = new Set<number>();
  for (const a of adaylar) {
    if (sonuc[a.si] || kullanilan.has(a.ki)) continue;
    sonuc[a.si] = kayitlar[a.ki];
    kullanilan.add(a.ki);
  }
  return sonuc;
}
