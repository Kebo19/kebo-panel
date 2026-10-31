import { describe, it, expect } from "vitest";
import { cariKarsilastir, cariBul, faturaNoAnahtari, type EkstreOkuma } from "@/lib/cariMutabakat";

const ok: EkstreOkuma = {
  firma: "İBOCAN GIDA SAN. TİC. LTD. ŞTİ.", vergi_no: null, donem_bas: "2026-10-01", donem_bit: "2026-10-31", son_bakiye: 1500,
  satirlar: [
    { tarih: "2026-10-01", evrak_no: null, aciklama: "Devir", tur: "acilis", etki: "artar", tutar: 1000 },
    { tarih: "2026-10-03", evrak_no: "IBO2026000000123", aciklama: null, tur: "fatura", etki: "artar", tutar: 500 },
    { tarih: "2026-10-05", evrak_no: "X-9", aciklama: null, tur: "fatura", etki: "artar", tutar: 250 },
    { tarih: "2026-10-10", evrak_no: "N1", aciklama: "yeni", tur: "fatura", etki: "artar", tutar: 999 },
    { tarih: "2026-10-12", evrak_no: null, aciklama: "EFT", tur: "odeme", etki: "azalir", tutar: 700 },
    { tarih: "2026-10-20", evrak_no: null, aciklama: "havale", tur: "odeme", etki: "azalir", tutar: 300 },
  ],
};

describe("cariKarsilastir", () => {
  it("numara, tutar+tarih ile eşleştirir; eksik/fazla/farklı bulur", () => {
    const k = cariKarsilastir(ok,
      [{ id: "f1", fatura_no: "123", fatura_tarihi: "2026-10-03", toplam_tutar: 520 },
       { id: "f2", fatura_no: "ABC", fatura_tarihi: "2026-10-06", toplam_tutar: 250 },
       { id: "f3", fatura_no: "Z", fatura_tarihi: "2026-10-25", toplam_tutar: 80 },
       { id: "f0", fatura_no: "eski", fatura_tarihi: "2026-09-01", toplam_tutar: 1000 }],
      [{ id: "o1", tarih: "2026-10-14", tutar: 700 }, { id: "o2", tarih: "2026-10-28", tutar: 50 }]);
    expect(k.tutarFarkli.map(x => x.sistem.id)).toEqual(["f1"]);
    expect(k.faturaEslesen.map(x => x.sistem.id)).toEqual(["f2"]);
    expect(k.eksikFatura.map(x => x.evrak_no)).toEqual(["N1"]);
    expect(k.fazlaFatura.map(f => f.id)).toEqual(["f3"]);
    expect(k.odemeEslesen.map(x => x.sistem.id)).toEqual(["o1"]);
    expect(k.eksikOdeme.map(x => x.tutar)).toEqual([300]);
    expect(k.fazlaOdeme.map(o => o.id)).toEqual(["o2"]);
    expect(k.sistemBakiye).toBe(1000 + 520 + 250 + 80 - 700 - 50);
    expect(k.bakiyeFarki).toBe(1500 - 1100);
    expect(k.acilisVar).toBe(true);
  });
  it("fatura no anahtarı ve cari bulma", () => {
    expect(faturaNoAnahtari("IBO2026000000123")).toBe(faturaNoAnahtari("000123"));
    expect(cariBul(ok, [{ id: "a", unvan: "Kebo Gıda" }, { id: "b", unvan: "İbocan Gıda Ltd" }])?.id).toBe("b");
  });
});
