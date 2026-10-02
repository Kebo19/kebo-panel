// ─── STOK DEĞERİ ────────────────────────────────────────────────────────────
// Kasa sayfasındaki "Stok Değeri" paneli: depodaki malın TL karşılığı.
//   tutar = stok_urunler.mevcut_stok × stok_fiyatlar (son fatura birim fiyatı × çarpan)
// Fiyatlar Mikro e-Portal'daki gelen faturalardan gelir; her sabah zamanlanmış
// görev yeni faturaları okuyup stok_fiyatlar tablosunu günceller.
//
// Paneli SADECE `STOK_DEGER_GORENLER` listesindekiler görür (rol/yetki yetmez).
// Asıl koruma veritabanında: public.stok_deger_raporu() yalnızca
// stok_deger_izinli tablosundaki kullanıcılara veri döner. Birini eklerken ikisine de ekleyin.

export const STOK_DEGER_GORENLER: readonly string[] = [
  "c4d199e9-e0b7-4d33-8ad8-556f7d488bac", // murat@kebo.com
  "e75d458f-1c36-405a-bd56-3c590c28cd54", // bulent@kebo.com
];
export const stokDegerGorebilirMi = (userId?: string | null): boolean =>
  !!userId && STOK_DEGER_GORENLER.includes(userId);

/** public.stok_deger_raporu() satırı (numeric alanlar Supabase'den metin ya da sayı gelebilir) */
export interface StokDegerSatiri {
  urun_id: string;
  urun_adi: string;
  kategori: string | null;
  birim: string;
  mevcut_stok: number | string;
  birim_fiyat: number | string | null;
  kdv_orani: number | string | null;
  tutar: number | string | null;
  tutar_kdvli: number | string | null;
  fatura_kalem_adi: string | null;
  tedarikci: string | null;
  fatura_no: string | null;
  fatura_tarihi: string | null;
  notlar: string | null;
  stok_guncellendi: string | null;
  fiyat_guncellendi: string | null;
}

export interface StokDegerKalemi {
  id: string;
  ad: string;
  kategori: string;
  birim: string;
  miktar: number;
  /** null → faturalarda fiyatı bulunamadı */
  birimFiyat: number | null;
  kdv: number;
  tutar: number;
  tutarKdvli: number;
  kaynak: string | null;
  tedarikci: string | null;
  faturaTarihi: string | null;
  not: string | null;
}

export interface StokDegerOzeti {
  kalemler: StokDegerKalemi[];
  kategoriler: { ad: string; tutar: number; adet: number }[];
  toplam: number;
  toplamKdvli: number;
  /** stokta olup fiyatı olmayan ürünler (toplama girmez) */
  fiyatsiz: StokDegerKalemi[];
  /** fiyatı tahmine dayanan (eşleşme / birim çevirisi notu olan) ürünler */
  uyarili: number;
  /** en son fiyat güncellemesi */
  sonFiyatGuncelleme: string | null;
}

const sayi = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const KATEGORISIZ = "Kategorisiz";

export function stokDegerOzeti(satirlar: StokDegerSatiri[]): StokDegerOzeti {
  const kalemler: StokDegerKalemi[] = satirlar.map(s => {
    const fiyatVar = s.birim_fiyat !== null && s.birim_fiyat !== undefined && s.birim_fiyat !== "";
    return {
      id: s.urun_id,
      ad: s.urun_adi,
      kategori: s.kategori?.trim() || KATEGORISIZ,
      birim: s.birim,
      miktar: sayi(s.mevcut_stok),
      birimFiyat: fiyatVar ? sayi(s.birim_fiyat) : null,
      kdv: sayi(s.kdv_orani),
      tutar: fiyatVar ? sayi(s.tutar) : 0,
      tutarKdvli: fiyatVar ? sayi(s.tutar_kdvli) : 0,
      kaynak: s.fatura_kalem_adi,
      tedarikci: s.tedarikci,
      faturaTarihi: s.fatura_tarihi,
      not: s.notlar?.trim() || null,
    };
  });

  const kategoriMap = new Map<string, { tutar: number; adet: number }>();
  for (const k of kalemler) {
    if (k.birimFiyat === null || k.miktar <= 0) continue;
    const m = kategoriMap.get(k.kategori) ?? { tutar: 0, adet: 0 };
    m.tutar += k.tutar; m.adet += 1;
    kategoriMap.set(k.kategori, m);
  }
  const kategoriler = [...kategoriMap.entries()]
    .map(([ad, v]) => ({ ad, ...v }))
    .sort((a, b) => b.tutar - a.tutar);

  const sonFiyatGuncelleme = satirlar
    .map(s => s.fiyat_guncellendi)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1) ?? null;

  return {
    kalemler,
    kategoriler,
    toplam: kalemler.reduce((t, k) => t + k.tutar, 0),
    toplamKdvli: kalemler.reduce((t, k) => t + k.tutarKdvli, 0),
    fiyatsiz: kalemler.filter(k => k.birimFiyat === null && k.miktar > 0),
    uyarili: kalemler.filter(k => k.not && k.miktar > 0).length,
    sonFiyatGuncelleme,
  };
}
