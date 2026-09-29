import { describe, it, expect } from "vitest";
import {
  posBeklenenYatis, tutarTutarMi, posMutabakati, yemekKartiBul, ayAnahtari, yemekKartiMutabakati,
} from "@/lib/mutabakat";

const h = (id: number, tarih: string, tutar: number, aciklama = "") => ({ id, tarih, tutar, aciklama });

describe("POS temel hesaplar", () => {
  it("beklenen yatış %1,99 komisyon düşülür", () => {
    expect(posBeklenenYatis(10000)).toBe(9801);
  });
  it("tutar toleransı ±%0,5 veya ±5 TL", () => {
    expect(tutarTutarMi(9805, 9801)).toBe(true);    // 4 TL
    expect(tutarTutarMi(9850, 9801)).toBe(true);    // %0,5 = 49 TL
    expect(tutarTutarMi(9900, 9801)).toBe(false);
    expect(tutarTutarMi(104, 100)).toBe(true);      // küçük tutarda 5 TL geçerli
  });
});

describe("posMutabakati", () => {
  it("ertesi gün yatan tutarı eşleştirir, komisyonu hesaplar", () => {
    const s = posMutabakati([{ tarih: "2026-09-01", pos: 10000 }], [h(1, "2026-09-02", 9801)], "2026-09-10");
    expect(s.satirlar[0].durum).toBe("tuttu");
    expect(s.satirlar[0].fark).toBe(0);
    expect(s.toplamYatan).toBe(9801);
    expect(s.gerceklesenKomisyon).toBe(199);
    expect(s.hareketVar).toBe(true);
  });

  it("±2 gün toleransı: 3 gün sonra yatan eşleşir, 4 gün sonra eşleşmez", () => {
    const a = posMutabakati([{ tarih: "2026-09-01", pos: 10000 }], [h(1, "2026-09-04", 9801)], "2026-09-10");
    expect(a.satirlar[0].durum).toBe("tuttu");
    const b = posMutabakati([{ tarih: "2026-09-01", pos: 10000 }], [h(1, "2026-09-05", 9801)], "2026-09-10");
    expect(b.satirlar[0].durum).toBe("kayit_yok");
    expect(b.eslesmeyenHareketler).toHaveLength(1);
  });

  it("aynı yatışı iki güne vermez; tutarı en yakın günü seçer", () => {
    const s = posMutabakati(
      [{ tarih: "2026-09-01", pos: 10000 }, { tarih: "2026-09-02", pos: 5000 }],
      [h(1, "2026-09-02", 9801), h(2, "2026-09-03", posBeklenenYatis(5000))],
      "2026-09-10",
    );
    expect(s.satirlar.map(r => r.durum)).toEqual(["tuttu", "tuttu"]);
    expect(s.satirlar[1].hareketIdleri).toEqual([2]);
  });

  it("hafta sonu birikmesi: cuma+cumartesi+pazar tek kalemde pazartesi", () => {
    const gunler = [
      { tarih: "2026-09-04", pos: 1000 }, { tarih: "2026-09-05", pos: 2000 }, { tarih: "2026-09-06", pos: 3000 },
    ];
    const toplam = posBeklenenYatis(1000) + posBeklenenYatis(2000) + posBeklenenYatis(3000);
    const s = posMutabakati(gunler, [h(1, "2026-09-07", toplam)], "2026-09-20");
    expect(s.satirlar.every(r => r.durum === "tuttu" && r.birlesik)).toBe(true);
    expect(s.toplamYatan).toBeCloseTo(toplam, 1);
  });

  it("düşük yatış → Eksik, fark negatif", () => {
    const s = posMutabakati([{ tarih: "2026-09-01", pos: 10000 }], [h(1, "2026-09-02", 9000)], "2026-09-10");
    expect(s.satirlar[0].durum).toBe("eksik");
    expect(s.satirlar[0].fark).toBe(-801);
  });

  it("yatış yoksa: süre dolmadıysa Bekliyor, dolduysa Kayıt yok", () => {
    const gunler = [{ tarih: "2026-09-01", pos: 100 }, { tarih: "2026-09-08", pos: 100 }];
    const s = posMutabakati(gunler, [], "2026-09-09");
    expect(s.satirlar.map(r => r.durum)).toEqual(["kayit_yok", "bekliyor"]);
    expect(s.hareketVar).toBe(false);
    expect(s.sayac).toEqual({ tuttu: 0, eksik: 0, bekliyor: 1, kayit_yok: 1 });
  });

  it("POS satışı olmayan günler listelenmez", () => {
    const s = posMutabakati([{ tarih: "2026-09-01", pos: 0 }], [], "2026-09-09");
    expect(s.satirlar).toHaveLength(0);
  });
});

describe("yemek kartları", () => {
  it("açıklamadan kartı bulur (büyük/küçük harf, Sodexo→Pluxee)", () => {
    expect(yemekKartiBul("EDENRED ODEME 123")).toBe("Edenred");
    expect(yemekKartiBul("Sodexo Pass hakediş")).toBe("Pluxee");
    expect(yemekKartiBul("METROPOL CARD")).toBe("Metropol");
    expect(yemekKartiBul("EFT GELEN")).toBeNull();
  });

  it("ay anahtarı ve kaydırma yıl sınırını aşar", () => {
    expect(ayAnahtari("2026-12-15")).toBe("2026-12");
    expect(ayAnahtari("2027-01-05", -1)).toBe("2026-12");
    expect(ayAnahtari("2026-12-05", 1)).toBe("2027-01");
  });

  it("aylık satış vs yatan, %6 üstü uyarı", () => {
    const raporlar = [
      { tarih: "2026-09-01", kasa_edenred: 600, kasa_metropol: 1000 },
      { tarih: "2026-09-02", kasa_edenred: 400 },
    ];
    const s = yemekKartiMutabakati(raporlar, [
      h(1, "2026-09-20", 950, "EDENRED"),     // %5 kesinti → normal
      h(2, "2026-09-21", 900, "Metropol"),    // %10 kesinti → uyarı
      h(3, "2026-09-22", 50, "bilinmeyen"),
      h(4, "2026-10-02", 999, "Edenred"),     // başka ay → dışarıda
    ]);
    const eylul = s.aylar[0];
    const ed = eylul.kartlar.find(k => k.ad === "Edenred")!;
    const mp = eylul.kartlar.find(k => k.ad === "Metropol")!;
    expect(ed.satis).toBe(1000);
    expect(ed.yatan).toBe(950);
    expect(ed.komisyonOrani).toBeCloseTo(0.05);
    expect(ed.sinirAsimi).toBe(false);
    expect(mp.sinirAsimi).toBe(true);
    expect(eylul.belirsizYatan).toBe(50);
    expect(s.aylar).toHaveLength(1);
  });

  it("kaydırma=1: ertesi ay yatanlar önceki ayın satışına sayılır; yatış yoksa oran null", () => {
    const s = yemekKartiMutabakati([{ tarih: "2026-09-10", kasa_paye: 1000 }], [h(1, "2026-10-03", 960, "PAYE")], 1);
    expect(s.toplam.find(k => k.ad === "Paye")!.yatan).toBe(960);
    expect(s.toplam.find(k => k.ad === "Setcard")!.komisyonOrani).toBeNull();
  });
});
