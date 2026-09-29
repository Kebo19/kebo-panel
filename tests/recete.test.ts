import { describe, it, expect } from "vitest";
import {
  sayiOku, tarihOku, toplamSatiriMi, kolonTahmin, baslikSatiriBul, satislariAyristir, aralikEtiketi,
  porsiyonMaliyeti, ortalamaSatisFiyati, maliyetOrani, teorikTuketim, tuketimKarsilastir,
  foodCostYuzde, sonAylar, ayEtiketi, paketBasi,
} from "@/lib/recete";

describe("sayiOku", () => {
  it("Türkçe biçim", () => {
    expect(sayiOku("1.234,5")).toBe(1234.5);
    expect(sayiOku("12,5")).toBe(12.5);
    expect(sayiOku("1.234")).toBe(1234);
    expect(sayiOku("1.234.567")).toBe(1234567);
  });
  it("İngilizce biçim ve sayı", () => {
    expect(sayiOku("1,234.5")).toBe(1234.5);
    expect(sayiOku("0.18")).toBe(0.18);
    expect(sayiOku("12.5")).toBe(12.5);
    expect(sayiOku(42)).toBe(42);
  });
  it("birimli metinler", () => {
    expect(sayiOku("12 ad.")).toBe(12);
    expect(sayiOku("12 Adet")).toBe(12);
    expect(sayiOku("₺1.250,00")).toBe(1250);
    expect(sayiOku("3,5 kg")).toBe(3.5);
    expect(sayiOku("-5")).toBe(-5);
  });
  it("okunamayan", () => {
    expect(sayiOku("")).toBeNaN();
    expect(sayiOku("abc")).toBeNaN();
    expect(sayiOku(null)).toBeNaN();
  });
});

describe("tarihOku", () => {
  it("biçimler", () => {
    expect(tarihOku("05.09.2026")).toBe("2026-09-05");
    expect(tarihOku("5/9/2026 14:30")).toBe("2026-09-05");
    expect(tarihOku("2026-09-05")).toBe("2026-09-05");
    expect(tarihOku("05.09.26")).toBe("2026-09-05");
    expect(tarihOku(46270)).toBe("2026-09-05");   // Excel seri günü
  });
  it("geçersiz", () => {
    expect(tarihOku("31.02.2026")).toBeNull();
    expect(tarihOku("Toplam")).toBeNull();
    expect(tarihOku("")).toBeNull();
  });
});

describe("toplam satırı", () => {
  it("tanır", () => {
    ["TOPLAM", "Genel Toplam", "genel toplam:", "Ara Toplam", "Total"].forEach(x => expect(toplamSatiriMi(x)).toBe(true));
    ["Tavuk Dürüm", "Toplam Menü Kova", ""].forEach(x => expect(toplamSatiriMi(x)).toBe(false));
  });
});

describe("başlık ve kolon", () => {
  const dosya: unknown[][] = [
    ["KEBO RESTORAN"],
    ["Ürün Satış Raporu", null, "01.09.2026 - 07.09.2026"],
    [],
    ["Grup", "Ürün Adı", "Birim Fiyat", "Miktar", "Toplam Tutar"],
    ["Dürüm", "Tavuk Dürüm", "150", "12 ad.", "1.800,00"],
    ["Dürüm", "Et Dürüm", "250", "3", "750"],
    ["Dürüm", "tavuk  dürüm", "150", "2", "300"],
    [null, "TOPLAM", null, "17", "2.850"],
    ["Genel Toplam", null, null, "17", "2.850"],
  ];
  it("başlık satırını bulur", () => expect(baslikSatiriBul(dosya)).toBe(3));
  it("kolonları tahmin eder", () => expect(kolonTahmin(dosya[3])).toEqual({ urun: 1, adet: 3, tutar: 4, tarih: -1 }));

  it("tek gün: aynı ürünü toplar, toplam satırlarını atlar", () => {
    const s = satislariAyristir(dosya, 3, kolonTahmin(dosya[3]), { mod: "tek", tarih: "2026-09-07" }, "rapor.xlsx");
    expect(s.satirlar).toEqual([
      { tarih: "2026-09-07", menu_urun: "Et Dürüm", adet: 3, tutar: 750, kaynak_dosya: "rapor.xlsx" },
      { tarih: "2026-09-07", menu_urun: "Tavuk Dürüm", adet: 14, tutar: 2100, kaynak_dosya: "rapor.xlsx" },
    ]);
    expect(s.atlanan).toBe(2);
    expect(s.toplamAdet).toBe(17);
    expect(s.urunSayisi).toBe(2);
  });

  it("aralık: günlere eşit böler, etiket yazar", () => {
    const s = satislariAyristir(dosya, 3, kolonTahmin(dosya[3]), { mod: "aralik", bas: "2026-09-01", bit: "2026-09-04" }, "rapor.xlsx");
    expect(s.satirlar).toHaveLength(8);
    const tavuk = s.satirlar.filter(x => x.menu_urun === "Tavuk Dürüm");
    expect(tavuk.map(x => x.tarih)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(tavuk[0].adet).toBe(3.5);
    expect(tavuk[0].tutar).toBe(525);
    expect(tavuk[0].kaynak_dosya).toBe("rapor.xlsx (aralık 01.09–04.09)");
    expect(aralikEtiketi("a.csv", "2026-09-01", "2026-09-30")).toBe("a.csv (aralık 01.09–30.09)");
  });

  it("tarih kolonu varsa satır bazında kullanır", () => {
    const d: unknown[][] = [
      ["Tarih", "Ürün", "Adet"],
      ["01.09.2026", "Kova", "4"],
      ["02.09.2026", "Kova", "5"],
      ["02.09.2026", "kova", "1"],
      ["xx", "Kova", "1"],
    ];
    const e = kolonTahmin(d[0]);
    expect(e).toEqual({ urun: 1, adet: 2, tutar: -1, tarih: 0 });
    const s = satislariAyristir(d, 0, e, { mod: "tek", tarih: "2026-09-30" }, "f.csv");
    expect(s.satirlar).toEqual([
      { tarih: "2026-09-01", menu_urun: "Kova", adet: 4, tutar: null, kaynak_dosya: "f.csv" },
      { tarih: "2026-09-02", menu_urun: "Kova", adet: 6, tutar: null, kaynak_dosya: "f.csv" },
    ]);
    expect(s.atlanan).toBe(1);
  });

  it("ters aralık uyarı verir", () => {
    const s = satislariAyristir(dosya, 3, kolonTahmin(dosya[3]), { mod: "aralik", bas: "2026-09-05", bit: "2026-09-01" }, "r");
    expect(s.satirlar).toHaveLength(0);
    expect(s.uyarilar.length).toBeGreaterThan(0);
  });
});

describe("maliyet", () => {
  const urunler = [{ id: "tavuk", son_fiyat: 200 }, { id: "lavas", son_fiyat: 5 }, { id: "sos", son_fiyat: null }];
  it("porsiyon maliyeti", () => {
    const r = porsiyonMaliyeti([{ stok_urun_id: "tavuk", miktar: 0.18 }, { stok_urun_id: "lavas", miktar: 1 }, { stok_urun_id: "sos", miktar: 1 }], urunler);
    expect(r.maliyet).toBeCloseTo(41);
    expect(r.fiyatsiz).toBe(1);
  });
  it("ortalama satış fiyatı ve oran", () => {
    expect(ortalamaSatisFiyati([{ adet: 10, tutar: 1500 }, { adet: 5, tutar: null }, { adet: 10, tutar: 1700 }])).toBe(160);
    expect(ortalamaSatisFiyati([{ adet: 3, tutar: null }])).toBeNull();
    expect(maliyetOrani(40, 160)).toBe(25);
    expect(maliyetOrani(40, null)).toBeNull();
  });
});

describe("teorik ve gerçek tüketim", () => {
  const receteler = [
    { menu_urun: "Tavuk Dürüm", stok_urun_id: "tavuk", miktar: 0.18 },
    { menu_urun: "Tavuk Dürüm", stok_urun_id: "lavas", miktar: 1 },
    { menu_urun: "Kova", stok_urun_id: "tavuk", miktar: 0.5 },
  ];
  const satislar = [
    { menu_urun: "tavuk dürüm", adet: 60 }, { menu_urun: "Tavuk Dürüm", adet: 40 },
    { menu_urun: "Kova", adet: 10 }, { menu_urun: "Ayran", adet: 30 },
  ];
  it("teorik tüketim", () => {
    const t = teorikTuketim(satislar, receteler);
    expect(t.tuketim.get("tavuk")).toBeCloseTo(23);
    expect(t.tuketim.get("lavas")).toBe(100);
    expect(t.recetesiz).toEqual(["ayran"]);
  });
  it("gün filtresi (yalnızca sayımı olan günler)", () => {
    const s = [
      { tarih: "2026-09-01", menu_urun: "Kova", adet: 10 },
      { tarih: "2026-09-02", menu_urun: "Kova", adet: 20 },
    ];
    const t = teorikTuketim(s, receteler, (id, tarih) => id === "tavuk" && tarih === "2026-09-02");
    expect(t.tuketim.get("tavuk")).toBe(10);
  });
  it("karşılaştırma ve şüphe", () => {
    const t = teorikTuketim(satislar, receteler).tuketim;
    const g = new Map<string, number | null>([["tavuk", 26], ["lavas", 105], ["yag", 4]]);
    const k = tuketimKarsilastir(t, g, [{ id: "tavuk", son_fiyat: 200 }, { id: "lavas", son_fiyat: 5 }, { id: "yag", son_fiyat: 80 }]);
    const tavuk = k.find(x => x.stok_urun_id === "tavuk")!;
    expect(tavuk.fark).toBeCloseTo(3);
    expect(tavuk.farkYuzde).toBeCloseTo(13.04, 1);
    expect(tavuk.supheli).toBe(true);
    expect(tavuk.farkTutar).toBeCloseTo(600);
    const lavas = k.find(x => x.stok_urun_id === "lavas")!;
    expect(lavas.supheli).toBe(false);
    const yag = k.find(x => x.stok_urun_id === "yag")!;
    expect(yag.teorik).toBe(0);
    expect(yag.farkYuzde).toBeNull();
    expect(k[0].stok_urun_id).toBe("tavuk");   // en büyük ₺ fark başta
  });
  it("sayım yoksa gerçek null", () => {
    const k = tuketimKarsilastir(new Map([["tavuk", 5]]), new Map(), [{ id: "tavuk", son_fiyat: 200 }]);
    expect(k[0].gercek).toBeNull();
    expect(k[0].fark).toBeNull();
    expect(k[0].supheli).toBe(false);
  });
});

describe("food cost ve aylar", () => {
  it("oran", () => {
    expect(foodCostYuzde(30000, 100000)).toBe(30);
    expect(foodCostYuzde(100, 0)).toBeNull();
  });
  it("son aylar", () => {
    expect(sonAylar("2026-02-15", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(ayEtiketi("2026-09")).toBe("Eyl 26");
  });
  it("paket başı", () => {
    expect(paketBasi(50, 200)).toBe(0.25);
    expect(paketBasi(50, 0)).toBeNull();
  });
});
