import { describe, it, expect } from "vitest";
import { iadeAciklamaOku, iadeAciklamaYaz, iadeDetayDuzelt, iadeEksikAdim, iadeOdemeSecenekleri, iadeEtiketi } from "../lib/iade";

describe("iptal / iade ayrıntısı", () => {
  it("paket fişini yazıp geri okur", () => {
    const d = { fis: "paket", marka: "kebo", kanal: "ys", odeme: "online" } as const;
    const metin = iadeAciklamaYaz(d, "müşteri vazgeçti");
    expect(metin).toBe("[Paket · Kebo · Yemeksepeti · Online] müşteri vazgeçti");
    expect(iadeAciklamaOku(metin)).toEqual({ detay: d, not: "müşteri vazgeçti" });
  });

  it("masa fişi ve notsuz satır", () => {
    const metin = iadeAciklamaYaz({ fis: "masa", odeme: "pos" }, "");
    expect(metin).toBe("[Masa · POS]");
    expect(iadeAciklamaOku(metin)).toEqual({ detay: { fis: "masa", odeme: "pos" }, not: "" });
  });

  it("Chick'N Fride ve Kıraloğlu adlarını tanır", () => {
    expect(iadeAciklamaOku("[Paket · Chick'N Fride · Trendyol · Nakit] x").detay).toEqual({ fis: "paket", marka: "cnf", kanal: "trendyol", odeme: "nakit" });
    expect(iadeAciklamaOku("[Paket · Kıraloğlu · Alo Paket · Yemek kartı]").detay).toEqual({ fis: "paket", marka: "kir", kanal: "alo", odeme: "yemek_karti" });
  });

  it("eski (ayrıntısız) metni olduğu gibi bırakır", () => {
    expect(iadeAciklamaOku("yanlış sipariş")).toEqual({ detay: {}, not: "yanlış sipariş" });
    expect(iadeAciklamaOku("[not] yanlış")).toEqual({ detay: {}, not: "[not] yanlış" });
  });

  it("masa ve Alo Paket'te online seçilemez", () => {
    expect(iadeOdemeSecenekleri({ fis: "masa" })).not.toContain("online");
    expect(iadeOdemeSecenekleri({ fis: "paket", marka: "kebo", kanal: "alo" })).not.toContain("online");
    expect(iadeOdemeSecenekleri({ fis: "paket", marka: "kebo", kanal: "ys" })).toContain("online");
  });

  it("üst seçim değişince geçersiz alt seçimleri temizler", () => {
    expect(iadeDetayDuzelt({ fis: "masa", marka: "kebo", kanal: "ys", odeme: "online" })).toEqual({ fis: "masa" });
    expect(iadeDetayDuzelt({ fis: "paket", marka: "cnf", kanal: "alo", odeme: "nakit" })).toEqual({ fis: "paket", marka: "cnf" });
  });

  it("sıradaki adımı söyler", () => {
    expect(iadeEksikAdim({})).toBe("fis");
    expect(iadeEksikAdim({ fis: "paket" })).toBe("marka");
    expect(iadeEksikAdim({ fis: "paket", marka: "kir" })).toBe("kanal");
    expect(iadeEksikAdim({ fis: "masa" })).toBe("odeme");
    expect(iadeEksikAdim({ fis: "masa", odeme: "nakit" })).toBeNull();
    expect(iadeEtiketi({ fis: "paket", marka: "kebo" })).toBe("Paket · Kebo");
  });
});
