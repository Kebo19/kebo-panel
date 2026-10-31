import { describe, it, expect } from "vitest";
import {
  stokMiktarina, araOrani, miktarSuphesi, baglamKur, receteHesapla, duzReceteler, stokFiyati, miktarYaz, birimSade,
  type ReceteSatiriTam, type ReceteUrunu, type StokBilgi,
} from "@/lib/receteHesap";

let n = 0;
const satir = (menu: string, p: Partial<ReceteSatiriTam>): ReceteSatiriTam => ({
  id: `s${++n}`, menu_urun: menu, stok_urun_id: null, ara_recete: null, malzeme_adi: null,
  miktar: 1, birim: null, etiket: null, notlar: null, sira: n, ...p,
});
const urun = (ad: string, p: Partial<ReceteUrunu> = {}): ReceteUrunu => ({
  ad, tur: "menu", verim_miktar: 1, verim_birim: "adet", satis_fiyati: null, grup: null, notlar: null, sira: 0, ...p,
});
const STOK: StokBilgi[] = [
  { id: "doner", urun_adi: "TAVUK DÖNER", birim: "kg", adet_gram: null, fiyat: 380 },
  { id: "ekmek", urun_adi: "EKMEK 100", birim: "adet", adet_gram: null, fiyat: 8.8 },
  { id: "nugget", urun_adi: "NUGGET", birim: "kg", adet_gram: null, fiyat: 165 },
  { id: "halka", urun_adi: "SOĞAN HALKASI", birim: "kg", adet_gram: 15, fiyat: 115 },
  { id: "sumak", urun_adi: "SUMAK", birim: "kg", adet_gram: null, fiyat: null },
  { id: "yag", urun_adi: "YAĞ", birim: "lt", adet_gram: null, fiyat: 100 },
];

describe("birim dönüşümü", () => {
  it("gramı kg stoğa çevirir", () => {
    expect(stokMiktarina(90, "g", "kg", null)).toBeCloseTo(0.09);
    expect(stokMiktarina(0.5, "kg", "kg", null)).toBe(0.5);
    expect(stokMiktarina(250, "ml", "lt", null)).toBeCloseTo(0.25);
  });
  it("eski satırda (birim yok) miktar stok birimindedir", () => {
    expect(stokMiktarina(0.18, null, "kg", null)).toBe(0.18);
  });
  it("adet → kg için 1 adedin gramı gerekir", () => {
    expect(stokMiktarina(4, "adet", "kg", null)).toBeNull();
    expect(stokMiktarina(4, "adet", "kg", 15)).toBeCloseTo(0.06);
  });
  it("gram → adet stok (schnitzel 100 g)", () => {
    expect(stokMiktarina(200, "g", "adet", 100)).toBe(2);
    expect(stokMiktarina(200, "g", "adet", null)).toBeNull();
    expect(stokMiktarina(3, "adet", "adet", null)).toBe(3);
  });
  it("uymayan birimler null", () => {
    expect(stokMiktarina(10, "g", "lt", null)).toBeNull();
    expect(stokMiktarina(10, "ml", "kg", null)).toBeNull();
  });
  it("birim adlarını sadeleştirir", () => {
    expect(birimSade("KG")).toBe("kg");
    expect(birimSade("gr")).toBe("g");
    expect(birimSade("Litre")).toBe("lt");
  });
});

describe("ara reçete oranı", () => {
  it("kg verimli ara reçete", () => {
    expect(araOrani(50, "g", { verim_miktar: 1, verim_birim: "kg" })).toBeCloseTo(0.05);
    expect(araOrani(50, "g", { verim_miktar: 2, verim_birim: "kg" })).toBeCloseTo(0.025);
    expect(araOrani(1, "adet", { verim_miktar: 1, verim_birim: "kg" })).toBeNull();
  });
  it("adet verimli ara reçete", () => {
    expect(araOrani(2, "adet", { verim_miktar: 1, verim_birim: "adet" })).toBe(2);
    expect(araOrani(2, "g", { verim_miktar: 1, verim_birim: "adet" })).toBeNull();
  });
});

describe("miktar şüphesi", () => {
  it("90 kg döner uyarı verir, 90 g vermez", () => {
    expect(miktarSuphesi(90, "kg")).toMatch(/gram/);
    expect(miktarSuphesi(90, "g")).toBeNull();
    expect(miktarSuphesi(0.95, "kg")).toBeNull();
  });
});

describe("reçete maliyeti", () => {
  const satirlar = [
    satir("KEBO (90 Gr)", { stok_urun_id: "doner", miktar: 90, birim: "g", etiket: "Döner" }),
    satir("KEBO (90 Gr)", { stok_urun_id: "ekmek", miktar: 1, birim: "adet" }),
    satir("KEBO (90 Gr)", { malzeme_adi: "Taze patates", miktar: 67.5, birim: "g" }),
    satir("KEBABİ", { stok_urun_id: "doner", miktar: 90, birim: "g" }),
    satir("KEBABİ", { ara_recete: "Zerzevat", miktar: 50, birim: "g" }),
    satir("Zerzevat", { stok_urun_id: "halka", miktar: 20, birim: "adet" }),  // 20 × 15 g = 0,3 kg × 115 = 34,5 ₺ / kg
    satir("Zerzevat", { stok_urun_id: "sumak", miktar: 40, birim: "g" }),
    satir("ÇITIR", { stok_urun_id: "nugget", miktar: 4, birim: "adet" }),
    satir("ÇITIR", { stok_urun_id: "halka", miktar: 4, birim: "adet" }),
    satir("DÖNGÜ", { ara_recete: "DÖNGÜ2", miktar: 1, birim: "adet" }),
    satir("DÖNGÜ2", { ara_recete: "DÖNGÜ", miktar: 1, birim: "adet" }),
  ];
  const urunler = [urun("KEBO (90 Gr)"), urun("KEBABİ"), urun("ÇITIR"), urun("Zerzevat", { tur: "ara", verim_birim: "kg" }),
    urun("DÖNGÜ", { tur: "ara" }), urun("DÖNGÜ2", { tur: "ara" })];
  const b = baglamKur(satirlar, urunler, STOK);

  it("gramlı satırı kg fiyatıyla çarpar, stokta olmayanı eksik sayar", () => {
    const h = receteHesapla("KEBO (90 Gr)", b);
    expect(h.maliyet).toBeCloseTo(0.09 * 380 + 8.8);
    expect(h.tuketim.get("doner")).toBeCloseTo(0.09);
    expect(h.eksikler).toEqual([{ ad: "Taze patates", neden: "stokta_yok" }]);
  });
  it("ara reçeteyi oranıyla açar", () => {
    const h = receteHesapla("KEBABİ", b);
    // zerzevat 1 kg = 34,5 ₺ (sumak fiyatsız); 50 g = 1,725 ₺
    expect(h.maliyet).toBeCloseTo(0.09 * 380 + 34.5 * 0.05);
    expect(h.tuketim.get("halka")).toBeCloseTo(0.3 * 0.05);
    expect(h.tuketim.get("sumak")).toBeCloseTo(0.04 * 0.05);
    expect(h.eksikler.map(e => e.neden)).toEqual(["fiyatsiz"]);
    const araSatiri = satirlar.find(s => s.menu_urun === "KEBABİ" && s.ara_recete)!;
    expect(h.satirlar.get(araSatiri.id)?.maliyet).toBeCloseTo(1.725);
    expect(h.satirlar.get(araSatiri.id)?.durum).toBe("ara_eksik");
  });
  it("adedin gramı bilinmeyen ürün eksik, bilineni hesaplanır", () => {
    const h = receteHesapla("ÇITIR", b);
    expect(h.maliyet).toBeCloseTo(4 * 15 / 1000 * 115);
    expect(h.eksikler).toEqual([{ ad: "NUGGET", neden: "cevrilemez" }]);
  });
  it("döngüye girmez", () => {
    const h = receteHesapla("DÖNGÜ", b);
    expect(h.eksikler.some(e => e.neden === "dongu")).toBe(true);
  });
  it("düz reçete: ara reçeteler satılmadığı için listelenmez", () => {
    const d = duzReceteler(b);
    expect(d.some(x => x.menu_urun === "Zerzevat")).toBe(false);
    expect(d.find(x => x.menu_urun === "KEBABİ" && x.stok_urun_id === "doner")?.miktar).toBeCloseTo(0.09);
  });
});

describe("fiyat ve yazım", () => {
  it("fatura fiyatı × çarpan, yoksa son fiyat", () => {
    expect(stokFiyati({ fatura_birim_fiyat: "668.317", carpan: "0.1111111111" })).toBeCloseTo(74.26, 1);
    expect(stokFiyati(undefined, 12)).toBe(12);
    expect(stokFiyati(undefined, null)).toBeNull();
  });
  it("küçük kg miktarını gramla yazar", () => {
    expect(miktarYaz(0.09, "kg")).toBe("90 g");
    expect(miktarYaz(2, "adet")).toBe("2 adet");
  });
});
