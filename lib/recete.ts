// ─── REÇETE, ÜRÜN SATIŞLARI VE MALİYET ──────────────────────────────────────
// Adisyon programının "ürün satış raporu" dosyasını ayrıştırma, reçeteden porsiyon
// maliyeti, teorik tüketim (satış × reçete) ile gerçek tüketimin (sayımlar, lib/stok)
// karşılaştırılması ve food cost oranı. Hepsi saf fonksiyon; ekranlar bunları kullanır.
import { gunEkle, gunFarki } from "@/lib/tarih";

// ─── SAYI VE METİN ──────────────────────────────────────────────────────────

/**
 * Hücredeki değeri sayıya çevirir. Türkçe ve İngilizce biçimleri anlar:
 *   "1.234,5" → 1234.5 · "1,234.5" → 1234.5 · "12 ad." → 12 · "₺1.250" → 1250 · "0.18" → 0.18
 * Tek nokta ve arkasında tam 3 rakam varsa ("1.234") binlik ayıracı sayılır.
 * Okunamazsa NaN döner.
 */
export function sayiOku(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (!s) return NaN;
  const eksi = /^-|^\(.*\)$|-$/.test(s.replace(/\s/g, ""));
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return NaN;
  const sonVirgul = s.lastIndexOf(","), sonNokta = s.lastIndexOf(".");
  if (sonVirgul >= 0 && sonNokta >= 0) {
    // İkisi de var: sonda olan ondalık ayıracıdır.
    if (sonVirgul > sonNokta) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (sonVirgul >= 0) {
    // Sadece virgül: "1,234,567" binlik; "12,5" ondalık.
    s = (s.match(/,/g)!.length > 1) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (sonNokta >= 0) {
    // Sadece nokta: birden fazla ya da "1.234" biçimi binlik; "12.5" ondalık.
    if (s.match(/\./g)!.length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  }
  s = s.replace(/^[.,]+|[.,]+$/g, "");
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return NaN;
  return eksi ? -n : n;
}

/** Karşılaştırma için: Türkçe küçük harf, fazla boşluk yok. */
export const normalAd = (s: unknown): string =>
  String(s ?? "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

/** Görünen ad: baştaki/sondaki ve çift boşluklar temizlenir, harfler korunur. */
export const temizAd = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();

/** "TOPLAM", "Genel Toplam", "Ara Toplam", "Toplam:" gibi özet satırları. */
export function toplamSatiriMi(ad: unknown): boolean {
  const a = normalAd(ad).replace(/[:.\-*]/g, "").trim();
  return /^(genel |ara |)toplam( tutar| satış| satis|lar|)$/.test(a) || a === "total" || a === "grand total" || a === "sum";
}

// ─── TARİH ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Hücredeki tarihi "YYYY-AA-GG" yapar. Excel seri numarası, Date, "GG.AA.YYYY",
 * "GG/AA/YYYY", "GG-AA-YYYY", "YYYY-AA-GG" (saat kısmı yok sayılır). Okunamazsa null.
 */
export function tarihOku(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === "number") {
    // Excel seri günü (1900 sistemi): 25569 = 1970-01-01
    if (v < 20000 || v > 80000) return null;
    return gunEkle("1970-01-01", Math.floor(v) - 25569);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return gecerliTarih(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return gecerliTarih(y, +m[2], +m[1]);
  }
  return null;
}

function gecerliTarih(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const t = `${y}-${pad(m)}-${pad(d)}`;
  return gunEkle(t, 0) === t ? t : null;   // 31 Şubat gibi geçersizleri ele
}

/** "YYYY-AA-GG" → "GG.AA" */
export const kisaTarih = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`;

/** Kaynak dosya etiketi: "rapor.xlsx (aralık 01.09–07.09)" */
export const aralikEtiketi = (dosya: string, bas: string, bit: string) =>
  `${dosya} (aralık ${kisaTarih(bas)}–${kisaTarih(bit)})`;

// ─── BAŞLIK VE KOLON EŞLEME ─────────────────────────────────────────────────

export interface KolonEslesme { urun: number; adet: number; tutar: number; tarih: number; }

const ANAHTAR: Record<keyof KolonEslesme, RegExp[]> = {
  urun: [/ürün ?ad/, /urun ?ad/, /^ürün$/, /^urun$/, /stok ?ad/, /menü/, /menu/, /ürün/, /urun/, /^ad[ıi]?$/, /açıklama/, /product/, /item/, /^name$/],
  adet: [/^adet$/, /miktar/, /adet/, /^sayı$/, /satış ?adedi/, /qty/, /quantity/, /^count$/],
  tutar: [/^tutar$/, /toplam ?tutar/, /net ?tutar/, /tutar/, /ciro/, /hasılat/, /satış ?tutar/, /^toplam$/, /amount/, /total/, /fiyat/],
  tarih: [/^tarih$/, /tarih/, /^gün$/, /^date$/, /date/],
};

/** Başlık satırındaki kolon adlarından eşlemeyi tahmin eder (bulunamayan = -1). */
export function kolonTahmin(baslik: unknown[]): KolonEslesme {
  const adlar = baslik.map(normalAd);
  const kullanildi = new Set<number>();
  const bul = (alan: keyof KolonEslesme): number => {
    for (const re of ANAHTAR[alan]) {
      const i = adlar.findIndex((a, j) => a && !kullanildi.has(j) && re.test(a));
      if (i >= 0) { kullanildi.add(i); return i; }
    }
    return -1;
  };
  // Sıra önemli: "birim fiyat" tutar sanılmasın diye adet/tarih önce, ürün en başta.
  const urun = bul("urun"), adet = bul("adet"), tarih = bul("tarih");
  const tutar = bul("tutar");
  return { urun, adet, tutar, tarih };
}

/** İlk 30 satırda ürün ve adet kolonu tanınan ilk satır başlıktır (bulunamazsa 0). */
export function baslikSatiriBul(satirlar: unknown[][]): number {
  const n = Math.min(satirlar.length, 30);
  for (let i = 0; i < n; i++) {
    const e = kolonTahmin(satirlar[i] || []);
    if (e.urun >= 0 && e.adet >= 0) return i;
  }
  return 0;
}

// ─── AYRIŞTIRMA ─────────────────────────────────────────────────────────────

export interface UrunSatisi { tarih: string; menu_urun: string; adet: number; tutar: number | null; kaynak_dosya: string; }

export type TarihSecenegi =
  | { mod: "tek"; tarih: string }
  | { mod: "aralik"; bas: string; bit: string };

export interface AyristirmaSonucu {
  satirlar: UrunSatisi[];
  /** Dosyadaki farklı ürün sayısı */
  urunSayisi: number;
  toplamAdet: number;
  toplamTutar: number;
  /** Atlanan satırlar (toplam satırı, boş ad, okunamayan adet/tarih) */
  atlanan: number;
  uyarilar: string[];
}

/**
 * Ürün satış raporunu kayıtlara çevirir.
 * - Aynı ürün aynı günde birden çok satırda geçerse toplanır.
 * - Tarih kolonu eşlenmişse satırın kendi tarihi kullanılır (okunamazsa seçilen tarih/aralık yok sayılır, satır atlanır).
 * - Tarih kolonu yoksa: tek gün → o güne; aralık → adet ve tutar aralıktaki günlere eşit bölünür.
 */
export function satislariAyristir(
  satirlar: unknown[][], baslikIdx: number, e: KolonEslesme, secenek: TarihSecenegi, dosyaAdi: string,
): AyristirmaSonucu {
  const uyarilar: string[] = [];
  let atlanan = 0;
  const topla = new Map<string, { tarih: string | null; ad: string; adet: number; tutar: number; tutarVar: boolean }>();
  const tarihKolonu = e.tarih >= 0;

  for (let i = baslikIdx + 1; i < satirlar.length; i++) {
    const r = satirlar[i] || [];
    const ad = temizAd(r[e.urun]);
    if (!ad) { if (r.some(x => x !== null && x !== undefined && String(x).trim() !== "")) atlanan++; continue; }
    if (toplamSatiriMi(ad) || r.some(x => toplamSatiriMi(x) && normalAd(x) !== "")) { atlanan++; continue; }
    const adet = sayiOku(r[e.adet]);
    if (!Number.isFinite(adet) || adet === 0) { atlanan++; continue; }
    let tarih: string | null = null;
    if (tarihKolonu) {
      tarih = tarihOku(r[e.tarih]);
      if (!tarih) { atlanan++; continue; }
    }
    const tutarHam = e.tutar >= 0 ? sayiOku(r[e.tutar]) : NaN;
    const k = `${tarih ?? ""}|${normalAd(ad)}`;
    const o = topla.get(k) || { tarih, ad, adet: 0, tutar: 0, tutarVar: false };
    o.adet += adet;
    if (Number.isFinite(tutarHam)) { o.tutar += tutarHam; o.tutarVar = true; }
    topla.set(k, o);
  }

  const cikti: UrunSatisi[] = [];
  const yuvarla = (x: number) => Math.round(x * 10000) / 10000;
  if (tarihKolonu) {
    topla.forEach(o => cikti.push({ tarih: o.tarih!, menu_urun: o.ad, adet: yuvarla(o.adet), tutar: o.tutarVar ? yuvarla(o.tutar) : null, kaynak_dosya: dosyaAdi }));
  } else if (secenek.mod === "tek") {
    topla.forEach(o => cikti.push({ tarih: secenek.tarih, menu_urun: o.ad, adet: yuvarla(o.adet), tutar: o.tutarVar ? yuvarla(o.tutar) : null, kaynak_dosya: dosyaAdi }));
  } else {
    const gun = gunFarki(secenek.bas, secenek.bit) + 1;
    if (gun < 1) { uyarilar.push("Bitiş tarihi başlangıçtan önce."); return { satirlar: [], urunSayisi: 0, toplamAdet: 0, toplamTutar: 0, atlanan, uyarilar }; }
    const etiket = aralikEtiketi(dosyaAdi, secenek.bas, secenek.bit);
    topla.forEach(o => {
      for (let d = 0; d < gun; d++) {
        cikti.push({
          tarih: gunEkle(secenek.bas, d), menu_urun: o.ad, adet: yuvarla(o.adet / gun),
          tutar: o.tutarVar ? yuvarla(o.tutar / gun) : null, kaynak_dosya: etiket,
        });
      }
    });
  }

  const urunler = new Set(Array.from(topla.values()).map(o => normalAd(o.ad)));
  const toplamAdet = Array.from(topla.values()).reduce((s, o) => s + o.adet, 0);
  const toplamTutar = Array.from(topla.values()).reduce((s, o) => s + (o.tutarVar ? o.tutar : 0), 0);
  if (!cikti.length) uyarilar.push("Dosyada okunabilir satış satırı bulunamadı. Kolon eşlemesini kontrol edin.");
  return { satirlar: cikti.sort((a, b) => a.tarih.localeCompare(b.tarih) || a.menu_urun.localeCompare(b.menu_urun, "tr")), urunSayisi: urunler.size, toplamAdet, toplamTutar, atlanan, uyarilar };
}

// ─── REÇETE VE MALİYET ──────────────────────────────────────────────────────

export interface ReceteSatiri { id?: string; menu_urun: string; stok_urun_id: string; miktar: number; }
export interface StokUrunFiyat { id: string; son_fiyat: number | null; }
export interface SatisKaydi { tarih: string; menu_urun: string; adet: number; tutar: number | null; }

/** Porsiyon maliyeti = Σ(miktar × son fiyat). Fiyatı olmayan malzemeler ayrıca sayılır. */
export function porsiyonMaliyeti(recete: Pick<ReceteSatiri, "stok_urun_id" | "miktar">[], urunler: StokUrunFiyat[]) {
  const fiyat = new Map(urunler.map(u => [u.id, u.son_fiyat]));
  let maliyet = 0, fiyatsiz = 0;
  recete.forEach(r => {
    const f = fiyat.get(r.stok_urun_id);
    if (f === null || f === undefined || !Number.isFinite(Number(f)) || Number(f) <= 0) fiyatsiz++;
    else maliyet += Number(r.miktar) * Number(f);
  });
  return { maliyet, fiyatsiz };
}

/** Ortalama satış fiyatı = Σtutar / Σadet (tutarı olan satırlardan). Veri yoksa null. */
export function ortalamaSatisFiyati(satislar: Pick<SatisKaydi, "adet" | "tutar">[]): number | null {
  let adet = 0, tutar = 0;
  satislar.forEach(s => {
    if (s.tutar === null || s.tutar === undefined) return;
    adet += Number(s.adet); tutar += Number(s.tutar);
  });
  return adet > 0 && tutar > 0 ? tutar / adet : null;
}

/** Maliyet oranı % = maliyet / satış fiyatı × 100 */
export const maliyetOrani = (maliyet: number, satisFiyati: number | null): number | null =>
  satisFiyati && satisFiyati > 0 ? (maliyet / satisFiyati) * 100 : null;

/**
 * Teorik tüketim: her stok ürünü için Σ(menü ürünü satış adedi × reçete miktarı).
 * Menü ürün adları büyük/küçük harf ve boşluk farkı gözetmeden eşlenir.
 */
export function teorikTuketim(
  satislar: (Pick<SatisKaydi, "menu_urun" | "adet"> & { tarih?: string })[], receteler: ReceteSatiri[],
  /** Verilirse yalnızca dahil(stokUrunId, tarih) doğru olan günlerin satışı sayılır (ör. sayımı olan günler). */
  dahil?: (stokUrunId: string, tarih: string) => boolean,
) {
  const adetler = new Map<string, number>();
  const gunluk = new Map<string, { tarih: string; adet: number }[]>();
  satislar.forEach(s => {
    const k = normalAd(s.menu_urun);
    adetler.set(k, (adetler.get(k) || 0) + Number(s.adet));
    if (dahil && s.tarih) { const l = gunluk.get(k) || []; l.push({ tarih: s.tarih, adet: Number(s.adet) }); gunluk.set(k, l); }
  });
  const sonuc = new Map<string, number>();
  const receteliMenu = new Set<string>();
  receteler.forEach(r => {
    const k = normalAd(r.menu_urun);
    receteliMenu.add(k);
    const a = dahil
      ? (gunluk.get(k) || []).filter(g => dahil(r.stok_urun_id, g.tarih)).reduce((s, g) => s + g.adet, 0)
      : adetler.get(k) || 0;
    if (a) sonuc.set(r.stok_urun_id, (sonuc.get(r.stok_urun_id) || 0) + a * Number(r.miktar));
  });
  // Satışı olup reçetesi olmayan menü ürünleri (teorik tüketime giremez)
  const recetesiz = Array.from(adetler.entries()).filter(([k, a]) => a > 0 && !receteliMenu.has(k)).map(([k]) => k);
  return { tuketim: sonuc, recetesiz };
}

export interface TuketimSatiri {
  stok_urun_id: string; teorik: number; gercek: number | null;
  fark: number | null; farkYuzde: number | null; farkTutar: number | null;
  /** Gerçek, teorikten %10'dan fazla: fire / kaçak şüphesi */
  supheli: boolean;
}

export const SUPHE_ESIGI = 10;   // %

/**
 * Teorik ve gerçek tüketimi karşılaştırır. gercek: stok ürünü → dönem kullanımı (sayım
 * yoksa listede olmaz ya da null). Fark = gerçek − teorik.
 */
export function tuketimKarsilastir(
  teorik: Map<string, number>, gercek: Map<string, number | null>, urunler: StokUrunFiyat[],
): TuketimSatiri[] {
  const fiyat = new Map(urunler.map(u => [u.id, u.son_fiyat]));
  const idler = new Set<string>([...teorik.keys()]);
  gercek.forEach((v, k) => { if (v !== null && v > 0) idler.add(k); });
  return Array.from(idler).map(id => {
    const t = teorik.get(id) || 0;
    const g = gercek.has(id) ? gercek.get(id)! : null;
    const fark = g === null ? null : g - t;
    const farkYuzde = fark === null || t <= 0 ? null : (fark / t) * 100;
    const f = Number(fiyat.get(id) || 0);
    return {
      stok_urun_id: id, teorik: t, gercek: g, fark, farkYuzde,
      farkTutar: fark === null || !f ? null : fark * f,
      supheli: farkYuzde !== null && farkYuzde > SUPHE_ESIGI,
    };
  }).sort((a, b) => (b.farkTutar ?? -Infinity) - (a.farkTutar ?? -Infinity));
}

// ─── FOOD COST ──────────────────────────────────────────────────────────────

/** Food cost % = mal alışı / net ciro × 100 (ciro yoksa null) */
export const foodCostYuzde = (alis: number, netCiro: number): number | null =>
  netCiro > 0 ? (alis / netCiro) * 100 : null;

/** Verilen tarihin ayı dahil son n ay ("YYYY-AA"), eskiden yeniye. */
export function sonAylar(tarih: string, n: number): string[] {
  const y = Number(tarih.slice(0, 4)), m = Number(tarih.slice(5, 7));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  }
  return out;
}

const AY_ADLARI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
/** "2026-09" → "Eyl 26" */
export const ayEtiketi = (ay: string) => `${AY_ADLARI[Number(ay.slice(5, 7)) - 1]} ${ay.slice(2, 4)}`;

/** Paket başı tüketim (paket yoksa null). */
export const paketBasi = (kullanim: number, paket: number): number | null => paket > 0 ? kullanim / paket : null;
