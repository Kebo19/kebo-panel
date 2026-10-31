// ─── REÇETE HESABI: birim dönüşümü, ara reçete, porsiyon maliyeti ────────────
// Reçete satırı kendi biriminde girilir (90 g döner, 1 adet ekmek, 4 adet nugget).
// Stok ürünü kendi biriminde tutulur (tavuk döner kg, nugget kg, ekmek adet).
// Bu dosya satırı stok birimine çevirir, ara reçeteleri (yeşil salata 1 kg için…)
// açar ve porsiyon maliyetini hesaplar. Saf fonksiyonlar; testleri tests/receteHesap.test.ts.

export type ReceteBirim = "g" | "kg" | "ml" | "lt" | "adet";
export const RECETE_BIRIMLERI: ReceteBirim[] = ["g", "kg", "ml", "lt", "adet"];

export interface ReceteSatiriTam {
  id: string;
  menu_urun: string;
  stok_urun_id: string | null;
  ara_recete: string | null;
  malzeme_adi: string | null;
  miktar: number;
  /** null = eski satır, miktar stok ürününün biriminde */
  birim: ReceteBirim | null;
  etiket: string | null;
  notlar: string | null;
  sira: number;
}

export interface ReceteUrunu {
  ad: string;
  tur: "menu" | "ara";
  verim_miktar: number;
  verim_birim: "adet" | "kg" | "lt";
  satis_fiyati: number | null;
  grup: string | null;
  notlar: string | null;
  sira: number;
}

export interface StokBilgi {
  id: string;
  urun_adi: string;
  birim: string;
  /** kg ile tutulan ürünün 1 adedi kaç gram (nugget…); adet ile tutulanın 1 adedi kaç gram (schnitzel…) */
  adet_gram: number | null;
  /** Stok biriminin fiyatı (₺/kg, ₺/adet…); bilinmiyorsa null */
  fiyat: number | null;
}

/** Stok birimini sadeleştirir: "KG" → kg, "gr" → g, "litre" → lt; diğerleri olduğu gibi (küçük harf). */
export function birimSade(b: string | null | undefined): string {
  const s = String(b ?? "").toLocaleLowerCase("tr-TR").trim().replace(/\.$/, "");
  if (["kg", "kilo", "kilogram"].includes(s)) return "kg";
  if (["g", "gr", "gram"].includes(s)) return "g";
  if (["lt", "l", "litre", "liter"].includes(s)) return "lt";
  if (["ml", "mililitre"].includes(s)) return "ml";
  if (["adet", "ad", "tane", "pcs", "paket"].includes(s)) return "adet";
  return s;
}

/**
 * Reçete satırındaki miktarı stok ürününün birimine çevirir. Çevrilemezse null
 * (ör. nugget kg ile tutuluyor, reçetede adet var ama 1 adedin gramı bilinmiyor).
 */
export function stokMiktarina(miktar: number, birim: ReceteBirim | null, stokBirimi: string, adetGram: number | null): number | null {
  if (!Number.isFinite(miktar)) return null;
  const hedef = birimSade(stokBirimi);
  if (birim === null || birim === hedef) return miktar;
  const ag = adetGram && adetGram > 0 ? adetGram : null;
  // Önce grama / mililitreye çevir
  let gram: number | null = null, ml: number | null = null;
  if (birim === "g") gram = miktar;
  else if (birim === "kg") gram = miktar * 1000;
  else if (birim === "ml") ml = miktar;
  else if (birim === "lt") ml = miktar * 1000;
  else if (birim === "adet") {
    if (hedef === "adet") return miktar;
    if (!ag) return null;
    if (hedef === "kg" || hedef === "g") gram = miktar * ag;
    else return null;
  }
  if (hedef === "kg") return gram !== null ? gram / 1000 : null;
  if (hedef === "g") return gram;
  if (hedef === "lt") return ml !== null ? ml / 1000 : null;
  if (hedef === "ml") return ml;
  if (hedef === "adet") return gram !== null && ag ? gram / ag : null;
  return null;
}

/** Ara reçete satırındaki miktarın ara reçetenin verimine oranı (50 g yeşil salata / 1 kg = 0,05). */
export function araOrani(miktar: number, birim: ReceteBirim | null, ara: Pick<ReceteUrunu, "verim_miktar" | "verim_birim">): number | null {
  const v = Number(ara.verim_miktar) || 0;
  if (v <= 0 || !Number.isFinite(miktar)) return null;
  const b = birim ?? ara.verim_birim;
  if (ara.verim_birim === "kg") {
    if (b === "g") return miktar / 1000 / v;
    if (b === "kg") return miktar / v;
    return null;
  }
  if (ara.verim_birim === "lt") {
    if (b === "ml") return miktar / 1000 / v;
    if (b === "lt") return miktar / v;
    return null;
  }
  return b === "adet" ? miktar / v : null;
}

/** Çok büyük görünen miktar (ör. 90 yerine 90 kg yazılmış): uyarı metni ya da null. */
export function miktarSuphesi(miktar: number, birim: ReceteBirim | null): string | null {
  if (birim === "kg" && miktar > 3) return `${miktar} kg çok fazla görünüyor — gram mı olacaktı?`;
  if (birim === "lt" && miktar > 3) return `${miktar} lt çok fazla görünüyor — ml mi olacaktı?`;
  if (birim === "g" && miktar > 2000) return `${miktar} g çok fazla görünüyor.`;
  if (birim === "adet" && miktar > 50) return `${miktar} adet çok fazla görünüyor.`;
  return null;
}

export interface ReceteBaglami {
  satirlar: Map<string, ReceteSatiriTam[]>;   // anahtar: normalAd(menu_urun)
  urunler: Map<string, ReceteUrunu>;          // anahtar: normalAd(ad)
  stok: Map<string, StokBilgi>;               // anahtar: stok id
}

export const anahtar = (s: unknown): string =>
  String(s ?? "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

export function baglamKur(satirlar: ReceteSatiriTam[], urunler: ReceteUrunu[], stok: StokBilgi[]): ReceteBaglami {
  const s = new Map<string, ReceteSatiriTam[]>();
  satirlar.forEach(r => {
    const k = anahtar(r.menu_urun);
    if (!s.has(k)) s.set(k, []);
    s.get(k)!.push(r);
  });
  s.forEach(l => l.sort((a, b) => a.sira - b.sira || a.id.localeCompare(b.id)));
  return { satirlar: s, urunler: new Map(urunler.map(u => [anahtar(u.ad), u])), stok: new Map(stok.map(u => [u.id, u])) };
}

export type SatirDurumu =
  | "tamam"          // stok miktarı ve fiyat var
  | "fiyatsiz"       // stok ürününün fiyatı yok
  | "cevrilemez"     // birim stok birimine çevrilemiyor (1 adet kaç gram?)
  | "stokta_yok"     // sadece ad, stokta karşılığı yok
  | "ara_eksik"      // ara reçetenin içinde eksik var
  | "ara_bos"        // ara reçetenin satırı yok
  | "ara_birim"      // ara reçetenin verimine çevrilemiyor
  | "dongu"          // ara reçete kendini içeriyor
  | "silinmis";      // bağlı stok ürünü / ara reçete bulunamadı

export interface SatirHesabi {
  /** Stok biriminde miktar (stok ürününe bağlı satırda) */
  stokMiktar: number | null;
  /** Satırın porsiyon maliyeti (bilinen kısmı) */
  maliyet: number;
  durum: SatirDurumu;
}

export interface ReceteHesabi {
  maliyet: number;
  /** Tam hesaplanamayan kalemler (ad: neden) */
  eksikler: { ad: string; neden: SatirDurumu }[];
  /** Stok ürünü → stok biriminde porsiyon tüketimi (ara reçeteler açılmış) */
  tuketim: Map<string, number>;
  satirlar: Map<string, SatirHesabi>;
}

/** Bir menü ürününün / ara reçetenin porsiyon (ara reçetede verim) maliyetini ve tüketimini hesaplar. */
export function receteHesapla(ad: string, b: ReceteBaglami, carpan = 1, yol: string[] = []): ReceteHesabi {
  const k = anahtar(ad);
  const sonuc: ReceteHesabi = { maliyet: 0, eksikler: [], tuketim: new Map(), satirlar: new Map() };
  const eksik = (ad: string, neden: SatirDurumu) => sonuc.eksikler.push({ ad, neden });
  for (const r of b.satirlar.get(k) || []) {
    const gorunen = r.etiket || r.malzeme_adi || r.ara_recete || b.stok.get(r.stok_urun_id || "")?.urun_adi || "?";
    let h: SatirHesabi;
    if (r.stok_urun_id) {
      const u = b.stok.get(r.stok_urun_id);
      if (!u) { h = { stokMiktar: null, maliyet: 0, durum: "silinmis" }; eksik(gorunen, "silinmis"); }
      else {
        const m = stokMiktarina(Number(r.miktar), r.birim, u.birim, u.adet_gram);
        if (m === null) { h = { stokMiktar: null, maliyet: 0, durum: "cevrilemez" }; eksik(gorunen, "cevrilemez"); }
        else {
          sonuc.tuketim.set(u.id, (sonuc.tuketim.get(u.id) || 0) + m * carpan);
          const f = u.fiyat;
          if (f === null || !Number.isFinite(f) || f <= 0) { h = { stokMiktar: m, maliyet: 0, durum: "fiyatsiz" }; eksik(gorunen, "fiyatsiz"); }
          else h = { stokMiktar: m, maliyet: m * f, durum: "tamam" };
        }
      }
    } else if (r.ara_recete) {
      const ak = anahtar(r.ara_recete);
      const ara = b.urunler.get(ak);
      if (!ara) { h = { stokMiktar: null, maliyet: 0, durum: "silinmis" }; eksik(gorunen, "silinmis"); }
      else if (yol.includes(ak) || ak === k) { h = { stokMiktar: null, maliyet: 0, durum: "dongu" }; eksik(gorunen, "dongu"); }
      else {
        const oran = araOrani(Number(r.miktar), r.birim, ara);
        if (oran === null) { h = { stokMiktar: null, maliyet: 0, durum: "ara_birim" }; eksik(gorunen, "ara_birim"); }
        else if (!(b.satirlar.get(ak) || []).length) { h = { stokMiktar: null, maliyet: 0, durum: "ara_bos" }; eksik(gorunen, "ara_bos"); }
        else {
          const alt = receteHesapla(ara.ad, b, carpan * oran, [...yol, k]);
          alt.tuketim.forEach((v, id) => sonuc.tuketim.set(id, (sonuc.tuketim.get(id) || 0) + v));
          const maliyet = alt.maliyet / carpan;   // alt hesap çarpanla geldi; satır maliyeti porsiyon başı
          h = { stokMiktar: null, maliyet, durum: alt.eksikler.length ? "ara_eksik" : "tamam" };
          alt.eksikler.forEach(e => eksik(`${gorunen} › ${e.ad}`, e.neden));
        }
      }
    } else {
      h = { stokMiktar: null, maliyet: 0, durum: "stokta_yok" };
      eksik(gorunen, "stokta_yok");
    }
    sonuc.maliyet += h.maliyet * carpan;
    sonuc.satirlar.set(r.id, h);
  }
  return sonuc;
}

export const DURUM_METNI: Record<SatirDurumu, string> = {
  tamam: "",
  fiyatsiz: "fiyatı yok",
  cevrilemez: "1 adedi kaç gram?",
  stokta_yok: "stokta yok, maliyete girmez",
  ara_eksik: "içinde eksik var",
  ara_bos: "ara reçete boş",
  ara_birim: "birim ara reçeteye uymuyor",
  dongu: "ara reçete kendini içeriyor",
  silinmis: "bağlı kayıt bulunamadı",
};

/** Teorik tüketim için: her menü ürününü stok ürünü bazında düz reçete satırlarına açar. */
export function duzReceteler(b: ReceteBaglami): { menu_urun: string; stok_urun_id: string; miktar: number }[] {
  const out: { menu_urun: string; stok_urun_id: string; miktar: number }[] = [];
  const adlar = new Map<string, string>();
  b.satirlar.forEach((l, k) => adlar.set(k, l[0]?.menu_urun || k));
  adlar.forEach((ad, k) => {
    if (b.urunler.get(k)?.tur === "ara") return;   // ara reçeteler satılmaz
    receteHesapla(ad, b).tuketim.forEach((miktar, id) => { if (miktar > 0) out.push({ menu_urun: ad, stok_urun_id: id, miktar }); });
  });
  return out;
}

/** stok_fiyatlar satırından stok biriminin fiyatı (fatura birim fiyatı × çarpan). */
export function stokFiyati(f: { fatura_birim_fiyat: number | string | null; carpan: number | string | null } | undefined, sonFiyat?: number | string | null): number | null {
  if (f && f.fatura_birim_fiyat !== null && f.fatura_birim_fiyat !== undefined) {
    const v = Number(f.fatura_birim_fiyat) * (Number(f.carpan) || 1);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const s = Number(sonFiyat);
  return Number.isFinite(s) && s > 0 ? s : null;
}

/** Miktarı birimiyle okunaklı yazar: 0,09 kg → "90 g"; 1 adet → "1 adet". */
export function miktarYaz(m: number, birim: string): string {
  const b = birimSade(birim);
  const s = (x: number, d = 3) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(x);
  if (b === "kg" && m > 0 && m < 1) return `${s(m * 1000, 1)} g`;
  if (b === "lt" && m > 0 && m < 1) return `${s(m * 1000, 1)} ml`;
  return `${s(m)} ${birim}`;
}
