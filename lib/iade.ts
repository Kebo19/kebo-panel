/**
 * İptal / iade fişinin ayrıntısı (kasa raporu 2 · Gider adımı).
 *
 * Adım adım seçilir: Fiş (masa / paket) → paketse Marka → Kanal → Ödeme.
 * Ayrıntı `iade_aciklama` metninde satırın başına köşeli parantezle yazılır:
 *   "[Paket · Kebo · Yemeksepeti · Online] müşteri vazgeçti: ₺450"
 * Eski raporlardaki köşeli parantezsiz satırlar "ayrıntısız" okunur.
 * Hesaplar değişmez: iade toplamı eskisi gibi net cirodan düşülür.
 */

export type IadeFis = "masa" | "paket";
export type IadeMarka = "kebo" | "cnf" | "kir";
export type IadeKanal = "alo" | "ys" | "trendyol" | "migros" | "getir";
export type IadeOdeme = "online" | "nakit" | "pos" | "yemek_karti";

export interface IadeDetay {
  fis?: IadeFis;
  marka?: IadeMarka;
  kanal?: IadeKanal;
  odeme?: IadeOdeme;
}

export const IADE_FIS: { v: IadeFis; ad: string }[] = [
  { v: "masa", ad: "Masa fişi" },
  { v: "paket", ad: "Paket fişi" },
];

export const IADE_MARKA: { v: IadeMarka; ad: string }[] = [
  { v: "kebo", ad: "Kebo" },
  { v: "cnf", ad: "Chick'N Fride" },
  { v: "kir", ad: "Kıraloğlu" },
];

export const IADE_KANAL_AD: Record<IadeKanal, string> = {
  alo: "Alo Paket", ys: "Yemeksepeti", trendyol: "Trendyol", migros: "Migros", getir: "Getir",
};

/** Markanın sipariş aldığı kanallar (kasa raporundaki satış tablosuyla aynı). */
export const MARKA_KANALLARI: Record<IadeMarka, IadeKanal[]> = {
  kebo: ["alo", "ys", "trendyol", "migros", "getir"],
  cnf: ["ys", "trendyol", "migros"],
  kir: ["alo", "ys", "trendyol", "migros"],
};

export const IADE_ODEME_AD: Record<IadeOdeme, string> = {
  online: "Online", nakit: "Nakit", pos: "POS", yemek_karti: "Yemek kartı",
};

/** Seçilebilecek ödeme türleri: masa ve Alo Paket'te online yok. */
export function iadeOdemeSecenekleri(d: IadeDetay): IadeOdeme[] {
  if (d.fis === "masa") return ["nakit", "pos", "yemek_karti"];
  if (d.fis === "paket" && d.kanal) return d.kanal === "alo" ? ["nakit", "pos", "yemek_karti"] : ["online", "nakit", "pos", "yemek_karti"];
  return [];
}

/** Bir üst seçim değişince, artık geçersiz kalan alt seçimleri temizler. */
export function iadeDetayDuzelt(d: IadeDetay): IadeDetay {
  const s: IadeDetay = { ...d };
  if (s.fis !== "paket") { delete s.marka; delete s.kanal; }
  if (s.marka && s.kanal && !MARKA_KANALLARI[s.marka].includes(s.kanal)) delete s.kanal;
  if (s.fis === "paket" && !s.marka) delete s.kanal;
  if (s.odeme && !iadeOdemeSecenekleri(s).includes(s.odeme)) delete s.odeme;
  return s;
}

/** Sıradaki seçilmesi gereken adım; hepsi seçildiyse null. */
export function iadeEksikAdim(d: IadeDetay): "fis" | "marka" | "kanal" | "odeme" | null {
  if (!d.fis) return "fis";
  if (d.fis === "paket" && !d.marka) return "marka";
  if (d.fis === "paket" && !d.kanal) return "kanal";
  if (!d.odeme) return "odeme";
  return null;
}

export const iadeTamamMi = (d: IadeDetay) => iadeEksikAdim(d) === null;

/** "Paket · Kebo · Yemeksepeti · Online" / "Masa · Nakit"; eksikse seçilenler kadarı. */
export function iadeEtiketi(d: IadeDetay): string {
  const p: string[] = [];
  if (d.fis) p.push(d.fis === "masa" ? "Masa" : "Paket");
  if (d.fis === "paket" && d.marka) p.push(IADE_MARKA.find(m => m.v === d.marka)!.ad);
  if (d.fis === "paket" && d.kanal) p.push(IADE_KANAL_AD[d.kanal]);
  if (d.odeme) p.push(IADE_ODEME_AD[d.odeme]);
  return p.join(" · ");
}

/** Satır açıklamasını metne yazar: ayrıntı seçildiyse başına [etiket]. */
export function iadeAciklamaYaz(d: IadeDetay, not: string): string {
  const et = iadeEtiketi(d);
  const n = not.replace(/[[\]]/g, "").trim();
  return et ? `[${et}]${n ? " " + n : ""}` : n;
}

const ad2 = <T extends string>(liste: Record<T, string>, ad: string): T | undefined =>
  (Object.keys(liste) as T[]).find(k => liste[k] === ad);

/** iadeAciklamaYaz'ın tersi. Köşeli parantez yoksa ayrıntı boş döner. */
export function iadeAciklamaOku(metin: string): { detay: IadeDetay; not: string } {
  const m = /^\[([^\]]*)\]\s*/.exec(metin || "");
  if (!m) return { detay: {}, not: (metin || "").trim() };
  const parcalar = m[1].split(" · ").map(s => s.trim());
  const d: IadeDetay = {};
  const fis = parcalar.shift();
  if (fis === "Masa") d.fis = "masa";
  else if (fis === "Paket") d.fis = "paket";
  else return { detay: {}, not: (metin || "").trim() };
  if (d.fis === "paket" && parcalar.length) {
    const marka = IADE_MARKA.find(x => x.ad === parcalar[0]);
    if (marka) { d.marka = marka.v; parcalar.shift(); }
    const kanal = parcalar.length ? ad2(IADE_KANAL_AD, parcalar[0]) : undefined;
    if (kanal) { d.kanal = kanal; parcalar.shift(); }
  }
  const odeme = parcalar.length ? ad2(IADE_ODEME_AD, parcalar[0]) : undefined;
  if (odeme) d.odeme = odeme;
  return { detay: d, not: metin.slice(m[0].length).trim() };
}
