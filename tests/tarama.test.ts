import { describe, it, expect } from "vitest";
import { paraOku, adetOku, taramaDuzelt, taramaTarihi } from "../lib/tarama";

describe("kağıt rapor tarama düzeltmesi", () => {
  it("binlik ayraç yanlış okunan tutarları düzeltir", () => {
    expect(paraOku(3.285)).toBe(3285);
    expect(paraOku(5.002)).toBe(5002);
    expect(paraOku(301)).toBe(301);
    expect(paraOku(12.5)).toBe(12.5);
    expect(paraOku(3.28)).toBe(3.28);
  });
  it("Türkçe metin sayıları okur", () => {
    expect(paraOku("3.285")).toBe(3285);
    expect(paraOku("1.234,50")).toBe(1234.5);
    expect(paraOku("12,5")).toBe(12.5);
    expect(paraOku("₺ 5.002 TL")).toBe(5002);
    expect(paraOku("")).toBe(0);
    expect(paraOku(null)).toBe(0);
    expect(adetOku("12")).toBe(12);
  });
  it("iç içe JSON'u düzeltir", () => {
    const v = taramaDuzelt({ online: { kebo: { ys: { tutar: 3.285, paket: 12, indirim: 301 } } },
      kapida: { kebo: { ys: { tutar: "5.002", paket: "5", indirim: 2 } } }, notlar: "3.285", giderler: [{ aciklama: "x", tutar: 1.5 }] });
    expect(v.online.kebo.ys).toEqual({ tutar: 3285, paket: 12, indirim: 301 });
    expect(v.kapida.kebo.ys).toEqual({ tutar: 5002, paket: 5, indirim: 2 });
    expect(v.notlar).toBe("3.285");
    expect(v.giderler[0].tutar).toBe(1.5);
  });
  it("geçersiz tarihi null yapar", () => {
    expect(taramaTarihi("2026-09-24")).toBe("2026-09-24");
    expect(taramaTarihi("2026-02-30")).toBeNull();
    expect(taramaTarihi("2026-00-00")).toBeNull();
    expect(taramaTarihi(null)).toBeNull();
  });
});

import { kurusluAlanlar, alanEtiketi } from "../lib/tarama";
describe("belirsiz alanlar", () => {
  it("kuruşlu tutarları işaretler", () => {
    expect(kurusluAlanlar({ online: { kebo: { ys: { tutar: 3285, indirim: 30.1, paket: 12 } } }, giderler: [{ tutar: 12.5 }] }))
      .toEqual(["online.kebo.ys.indirim", "giderler.0.tutar"]);
  });
  it("alan adlarını Türkçeleştirir", () => {
    expect(alanEtiketi("online.kebo.ys.indirim")).toBe("Online › KEBO › Yemeksepeti › İndirim");
    expect(alanEtiketi("giderler.0.tutar")).toBe("Gider › 1. satır › Tutar");
  });
});
