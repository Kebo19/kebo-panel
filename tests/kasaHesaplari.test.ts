import { describe, it, expect } from "vitest";
import { krediKartiDurumu, sonKesimTarihi, sonOdemeTarihi, yemekKartiAlacaklari, type KrediKarti } from "@/lib/kasaHesaplari";

const kart: KrediKarti = {
  id: "k1", ad: "TEB Kredi Kartı", banka: "TEB", kart_limiti: 100000, hesap_kesim_gunu: 10, son_odeme_gunu: 20,
  acilis_borcu: 20000, acilis_tarihi: "2026-10-01", aktif: true, sira: 1,
};

describe("kredi kartı tarihleri", () => {
  it("son kesim ve son ödeme", () => {
    expect(sonKesimTarihi("2026-10-15", 10)).toBe("2026-10-10");
    expect(sonKesimTarihi("2026-10-05", 10)).toBe("2026-09-10");
    expect(sonKesimTarihi("2026-03-05", 31)).toBe("2026-02-28");
    expect(sonOdemeTarihi("2026-10-10", 20)).toBe("2026-10-20");
    expect(sonOdemeTarihi("2026-10-25", 5)).toBe("2026-11-05");
  });
});

describe("kredi kartı durumu", () => {
  const h = [
    { tip: "gider" as const, hesap: "TEB Kredi Kartı", tutar: 5000, islem_tarihi: "2026-10-03" },
    { tip: "gider" as const, hesap: "TEB Kredi Kartı", tutar: 3000, islem_tarihi: "2026-10-12" },
    { tip: "transfer" as const, hesap: "TEB", hedef_hesap: "TEB Kredi Kartı", tutar: 10000, islem_tarihi: "2026-10-14" },
    { tip: "gelir" as const, hesap: "TEB Kredi Kartı", tutar: 500, islem_tarihi: "2026-10-13", kategori: "İade" },
    { tip: "gider" as const, hesap: "Enpara Kredi Kartı", tutar: 999, islem_tarihi: "2026-10-03" },
    { tip: "gider" as const, hesap: "TEB Kredi Kartı", tutar: 777, islem_tarihi: "2026-09-20" }, // açılıştan önce
  ];
  it("borç, kullanılabilir limit ve ekstre", () => {
    const d = krediKartiDurumu(kart, h, "2026-10-15");
    expect(d.borc).toBe(20000 + 5000 + 3000 - 500 - 10000);
    expect(d.kullanilabilir).toBe(100000 - 17500);
    expect(d.kullanimOrani).toBeCloseTo(0.175);
    expect(d.sonKesim).toBe("2026-10-10");
    expect(d.sonOdeme).toBe("2026-10-20");
    expect(d.ekstreBorcu).toBe(20000 + 5000 - 10000); // kesimdeki borç − kesimden sonraki ödemeler
    expect(d.donemHarcama).toBe(3000 - 500); // kesimden sonraki harcama − iade
    expect(d.odemeyeKalan).toBe(5);
    expect(d.sonrakiKesim).toBe("2026-11-10");
  });
  it("limit girilmemişse oran yok", () => {
    expect(krediKartiDurumu({ ...kart, kart_limiti: 0 }, [], "2026-10-15").kullanimOrani).toBeNull();
  });
});

describe("yemek kartı alacakları", () => {
  it("satış − yatan, açıklamadan kart eşleme", () => {
    const r = [
      { tarih: "2026-10-01", kasa_setcard: 1000, kasa_multinet: 400 },
      { tarih: "2026-10-02", kasa_setcard: 500, kasa_edenred: 300 },
      { tarih: "2026-09-30", kasa_setcard: 9999 },
    ];
    const h = [
      { tip: "gelir" as const, hesap: "TEB", tutar: 1400, islem_tarihi: "2026-10-05", kategori: "Yemek Kartı Tahsilatı", aciklama: "SETCARD ODEME" },
      { tip: "gelir" as const, hesap: "TEB", tutar: 200, islem_tarihi: "2026-10-05", kategori: "Yemek Kartı Tahsilatı", aciklama: "bilinmeyen" },
    ];
    const s = yemekKartiAlacaklari(r, h, "2026-10-01", "2026-10");
    const set = s.kartlar.find(k => k.ad === "Setcard")!;
    expect(set.satis).toBe(1500); expect(set.yatan).toBe(1400); expect(set.bekleyen).toBe(100);
    expect(s.kartlar.find(k => k.ad === "Multinet")!.bekleyen).toBe(400);
    expect(s.belirsizYatan).toBe(200);
    expect(s.toplamBekleyen).toBe(100 + 400 + 300 - 200);
  });
});
