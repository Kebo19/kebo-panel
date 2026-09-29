// ─── İŞLEM GEÇMİŞİ YARDIMCILARI ─────────────────────────────────────────────
// islem_gecmisi tablosundaki satırları ekranda Türkçe ve kısa göstermek için.

export const TABLO_ADLARI: Record<string, string> = {
  gunluk_raporlar: "Günlük rapor",
  faturalar: "Fatura",
  cari_odemeler: "Cari ödeme",
  cariler: "Cari",
  kasa_manuel_islemler: "Kasa hareketi",
  personeller: "Personel",
  personel_hassas: "Personel kimlik/IBAN",
  stok_hareketler: "Stok hareketi",
  stok_urunler: "Stok ürünü",
  puantaj: "Puantaj",
  sabit_giderler: "Sabit gider",
  avanslar: "Avans",
  kesintiler: "Kesinti",
  receteler: "Reçete",
};

export const ISLEM_ADLARI: Record<string, string> = {
  ekleme: "Ekleme",
  guncelleme: "Güncelleme",
  silme: "Silme",
};

export const tabloAdi = (t: string) => TABLO_ADLARI[t] || t;
export const islemAdi = (i: string) => ISLEM_ADLARI[i] || i;

/** Hassas alanlar ekranda gösterilmez. */
export const HASSAS_ALANLAR = ["tc_kimlik", "iban"];
/** Özet satırında gösterilmeyen teknik alanlar. */
const ATLANAN_ALANLAR = ["updated_at", "created_at", "guncellenme", "guncelleme_zamani"];

export function degerMetni(alan: string, v: unknown): string {
  if (HASSAS_ALANLAR.includes(alan)) return v === null || v === undefined || v === "" ? "—" : "****";
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 40 ? s.slice(0, 39) + "…" : s;
  }
  const s = String(v);
  return s.length > 40 ? s.slice(0, 39) + "…" : s;
}

type Kayit = Record<string, unknown> | null | undefined;

/** Değişen alanlar (JSON karşılaştırması). */
export function degisenAlanlar(eski: Kayit, yeni: Kayit): string[] {
  const e = eski || {}, y = yeni || {};
  const alanlar = new Set([...Object.keys(e), ...Object.keys(y)]);
  return [...alanlar].filter(a =>
    !ATLANAN_ALANLAR.includes(a) && JSON.stringify(e[a] ?? null) !== JSON.stringify(y[a] ?? null));
}

/** Tek satırlık özet: güncellemede "alan: eski → yeni" (ilk 3 alan). */
export function islemOzeti(islem: string, eski: Kayit, yeni: Kayit): string {
  if (islem === "guncelleme") {
    const alanlar = degisenAlanlar(eski, yeni);
    if (!alanlar.length) return "Değişiklik yok";
    const parca = alanlar.slice(0, 3).map(a => `${a}: ${degerMetni(a, eski?.[a])} → ${degerMetni(a, yeni?.[a])}`);
    return parca.join(" · ") + (alanlar.length > 3 ? ` (+${alanlar.length - 3} alan)` : "");
  }
  const k = (islem === "silme" ? eski : yeni) || {};
  const ad = ["unvan", "isim", "ad", "menu_urun", "fatura_no", "aciklama", "kategori", "tarih", "rapor_tarihi"]
    .map(a => k[a]).find(v => typeof v === "string" && v.trim());
  const tutar = ["toplam_tutar", "tutar"].map(a => k[a]).find(v => v !== null && v !== undefined && v !== "");
  return [ad, tutar !== undefined ? `Tutar: ${tutar}` : ""].filter(Boolean).join(" · ") || "—";
}

/** Tam JSON gösterimi için hassas alanları maskeler (iç içe nesneler dahil). */
export function hassasMaskele(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(hassasMaskele);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, d]) =>
      [k, HASSAS_ALANLAR.includes(k) ? (d === null || d === "" ? d : "****") : hassasMaskele(d)]));
  }
  return v;
}

/** ISO zaman → "GG.AA.YYYY SS:DD" (İstanbul). */
export function zamanMetni(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value || "";
  return `${g("day")}.${g("month")}.${g("year")} ${g("hour")}:${g("minute")}`;
}
