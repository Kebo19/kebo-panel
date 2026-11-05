import { describe, it, expect } from "vitest";
import { hesapBakiyeleri, posBekleyenHesapla, type BakiyeHareketi } from "@/lib/kasaBakiye";

const h = (p: Partial<BakiyeHareketi>): BakiyeHareketi =>
  ({ id: Math.random().toString(), tip: "gider", hesap: "Nakit", kategori: "Diğer Gider", tutar: 0, islem_tarihi: "2026-11-02", ...p });

describe("hesapBakiyeleri", () => {
  it("1 Kasım öncesini saymaz, raporu nakde ekler, hareketleri işler", () => {
    const b = hesapBakiyeleri(
      [{ tarih: "2026-10-31", kasa_nakit: 9999 }, { tarih: "2026-11-01", kasa_nakit: 1000 }],
      [
        h({ tip: "gider", hesap: "Nakit", tutar: 200 }),
        h({ tip: "gelir", hesap: "TEB", kategori: "Diğer Gelir", tutar: 500 }),
        h({ tip: "transfer", hesap: "Nakit", hedef_hesap: "Enpara", tutar: 300 }),
        h({ tip: "gider", hesap: "TEB Kredi Kartı", tutar: 50 }),
        h({ tip: "gider", hesap: "Nakit", tutar: 70, islem_tarihi: "2026-10-30" }),
      ],
      100,
    );
    expect(b).toEqual({ Nakit: 500, TEB: 500, VakıfBank: 100, Enpara: 300 });
  });
});

describe("posBekleyenHesapla", () => {
  it("yatışı görünmeyen POS komisyonlu beklenir", () => {
    const p = posBekleyenHesapla([{ tarih: "2026-11-01", kasa_pos: 1000 }], [], "2026-11-05");
    expect(p.gun).toBe(1);
    expect(p.toplam).toBe(980);
  });
});
