import { describe, it, expect } from "vitest";
import { stokDegerOzeti, type StokDegerSatiri } from "@/lib/stokDeger";
import { sayfaErisimi } from "@/lib/yetki";

const satir = (p: Partial<StokDegerSatiri>): StokDegerSatiri => ({
  urun_id: "x", urun_adi: "Ürün", kategori: "Donuk", birim: "kg", mevcut_stok: 0,
  birim_fiyat: null, kdv_orani: null, tutar: null, tutar_kdvli: null,
  fatura_kalem_adi: null, tedarikci: null, fatura_no: null, fatura_tarihi: null,
  notlar: null, stok_guncellendi: null, fiyat_guncellendi: null, ...p,
});

describe("stok değeri", () => {
  it("toplar, kategorilere ayırır, fiyatsızları ayrı tutar", () => {
    const o = stokDegerOzeti([
      satir({ urun_id: "1", urun_adi: "Tavuk Döner", mevcut_stok: "202.50", birim_fiyat: "382.63", kdv_orani: "1", tutar: "77482.58", tutar_kdvli: "78257.40", fiyat_guncellendi: "2026-10-02T01:00:00Z" }),
      satir({ urun_id: "2", urun_adi: "Pipet", kategori: "Kebo Sarf Malzeme ", birim: "adet", mevcut_stok: 5000, birim_fiyat: 0.66, kdv_orani: 20, tutar: 3300, tutar_kdvli: 3960, notlar: " " }),
      satir({ urun_id: "3", urun_adi: "Wrap kutusu", kategori: null, birim: "adet", mevcut_stok: 750 }),
      satir({ urun_id: "4", urun_adi: "Boş ürün", mevcut_stok: 0, birim_fiyat: 5, tutar: 0, tutar_kdvli: 0, notlar: "tahmin" }),
    ]);
    expect(o.toplam).toBeCloseTo(80782.58, 2);
    expect(o.toplamKdvli).toBeCloseTo(82217.4, 2);
    expect(o.kategoriler.map(k => k.ad)).toEqual(["Donuk", "Kebo Sarf Malzeme"]);
    expect(o.fiyatsiz.map(k => k.ad)).toEqual(["Wrap kutusu"]);
    expect(o.kalemler.find(k => k.id === "3")?.kategori).toBe("Kategorisiz");
    // stoku sıfır olanın notu uyarı sayılmaz, boş not da sayılmaz
    expect(o.uyarili).toBe(0);
    expect(o.sonFiyatGuncelleme).toBe("2026-10-02T01:00:00Z");
  });

  it("Fiyat Listesi 'stok_deger' yetkisi ister", () => {
    expect(sayfaErisimi("Tam Yetkili", [], "/fiyatlar")).toBe(true);
    expect(sayfaErisimi("Müdür", ["stok"], "/fiyatlar")).toBe(false);
    expect(sayfaErisimi("Müdür", ["stok_deger"], "/fiyatlar")).toBe(true);
  });
});
