import { describe, it, expect } from "vitest";
import {
  faturaVadesi, haftaSonu, vadeGrubu, vadeTakvimi, cariEkstre,
  enYakinKdvOrani, faturaKdvAyristir, kdvOzeti, csvMetni,
} from "@/lib/cariEkstre";

describe("fatura vadesi", () => {
  it("vade_tarihi varsa o kullanılır", () => {
    expect(faturaVadesi({ fatura_tarihi: "2026-09-10", vade_tarihi: "2026-11-01" })).toBe("2026-11-01");
  });
  it("15'ine kadar kesilen fatura aynı ayın 25'inde", () => {
    expect(faturaVadesi({ fatura_tarihi: "2026-09-10" })).toBe("2026-09-25");
    expect(faturaVadesi({ fatura_tarihi: "2026-09-15" })).toBe("2026-09-25");
  });
  it("16'sından sonra sonraki ayın 25'i; hafta sonuysa ilk iş günü", () => {
    expect(faturaVadesi({ fatura_tarihi: "2026-09-16" })).toBe("2026-10-26"); // 25 Ekim Pazar
    expect(faturaVadesi({ fatura_tarihi: "2026-12-20" })).toBe("2027-01-25");
  });
  it("tarih yoksa null", () => {
    expect(faturaVadesi({ fatura_tarihi: null })).toBeNull();
  });
});

describe("vade grupları", () => {
  const bugun = "2026-09-29"; // Salı
  it("hafta sonu Pazar", () => {
    expect(haftaSonu(bugun)).toBe("2026-10-04");
    expect(haftaSonu("2026-10-04")).toBe("2026-10-04");
  });
  it("gruplar", () => {
    expect(vadeGrubu("2026-09-25", bugun)).toBe("gecikmis");
    expect(vadeGrubu(null, bugun)).toBe("gecikmis");
    expect(vadeGrubu("2026-09-29", bugun)).toBe("bu_hafta");
    expect(vadeGrubu("2026-10-04", bugun)).toBe("bu_hafta");
    expect(vadeGrubu("2026-10-11", bugun)).toBe("gelecek_hafta");
    expect(vadeGrubu("2026-10-12", bugun)).toBe("sonra");
    expect(vadeGrubu("2026-09-20", "2026-09-10")).toBe("gelecek_hafta");
    expect(vadeGrubu("2026-09-28", "2026-09-10")).toBe("bu_ay");
  });
  it("takvim: ödenmişler hariç, serbest ödeme en erken vadeden düşer", () => {
    const { gruplar, genelToplam } = vadeTakvimi([
      { id: "a", cari_id: "c1", cari_unvan: "Et A.Ş.", fatura_tarihi: "2026-08-10", toplam_tutar: 1000 }, // vade 25.08 → gecikmiş
      { id: "b", cari_id: "c1", cari_unvan: "Et A.Ş.", fatura_tarihi: "2026-09-20", toplam_tutar: 500 },  // vade 26.10 → sonra
      { id: "c", cari_id: "c2", cari_unvan: "Sebze", fatura_tarihi: "2026-09-01", vade_tarihi: "2026-10-02", toplam_tutar: 300 },
      { id: "d", cari_id: "c2", cari_unvan: "Sebze", fatura_tarihi: "2026-09-01", toplam_tutar: 999, durum: "odendi" },
    ], "2026-09-29", new Map([["c1", 400]]));
    const g = Object.fromEntries(gruplar.map(x => [x.anahtar, x]));
    expect(g.gecikmis.toplam).toBe(600);
    expect(g.bu_hafta.toplam).toBe(300);
    expect(g.sonra.toplam).toBe(500);
    expect(g.gecikmis.cariler[0].faturalar[0].kalan).toBe(600);
    expect(genelToplam).toBe(1400);
  });
  it("serbest ödeme faturayı tamamen kapatırsa listeden çıkar", () => {
    const { gruplar } = vadeTakvimi([
      { id: "a", cari_id: "c1", fatura_tarihi: "2026-08-10", toplam_tutar: 100 },
    ], "2026-09-29", new Map([["c1", 150]]));
    expect(gruplar.every(g => g.cariler.length === 0)).toBe(true);
  });
});

describe("cari ekstre", () => {
  it("devreden, kronoloji ve yürüyen bakiye", () => {
    const e = cariEkstre(
      [
        { fatura_no: "F0", fatura_tarihi: "2025-12-20", toplam_tutar: 1000 },
        { fatura_no: "F1", fatura_tarihi: "2026-01-10", toplam_tutar: 500 },
        { fatura_no: "F2", fatura_tarihi: "2026-02-05", toplam_tutar: 200 },
        { fatura_no: "F3", fatura_tarihi: "2027-01-01", toplam_tutar: 999 },
      ],
      [
        { tarih: "2025-12-30", tutar: 300 },
        { tarih: "2026-01-10", tutar: 700 },
      ],
      "2026-01-01", "2026-12-31",
    );
    expect(e.devreden).toBe(700);
    expect(e.satirlar.map(s => [s.tur, s.bakiye])).toEqual([["fatura", 1200], ["odeme", 500], ["fatura", 700]]);
    expect(e.toplamBorc).toBe(700);
    expect(e.toplamAlacak).toBe(700);
    expect(e.kapanis).toBe(700);
  });
});

describe("KDV", () => {
  it("en yakın oran", () => {
    expect(enYakinKdvOrani(19.97)).toBe(20);
    expect(enYakinKdvOrani(9.8)).toBe(10);
    expect(enYakinKdvOrani(1.2)).toBe(1);
    expect(enYakinKdvOrani(0.3)).toBe(0);
  });
  it("kdv tutarından ayrıştırma", () => {
    expect(faturaKdvAyristir({ tutar: 1000, kdv: 200, toplam_tutar: 1200 })).toMatchObject({ matrah: 1000, kdv: 200, oran: 20, kaynak: "fatura" });
    expect(faturaKdvAyristir({ tutar: 1000, kdv: 0, toplam_tutar: 1100 })).toMatchObject({ kdv: 100, oran: 10 });
  });
  it("kdv sütununa oran yazılmış eski kayıt", () => {
    expect(faturaKdvAyristir({ tutar: 1000, kdv: 20, toplam_tutar: 1200 })).toMatchObject({ kdv: 200, oran: 20 });
  });
  it("bilgi yoksa carinin varsayılanıyla tahmin", () => {
    expect(faturaKdvAyristir({ tutar: 1100, kdv: 0, toplam_tutar: 1100 }, 10)).toMatchObject({ matrah: 1000, kdv: 100, oran: 10, kaynak: "cari_varsayilan" });
    expect(faturaKdvAyristir({ tutar: 1100, kdv: 0, toplam_tutar: 1100 })).toMatchObject({ matrah: 1100, kdv: 0, kaynak: "bilinmiyor" });
  });
  it("özet: oran ve cari kırılımı", () => {
    const o = kdvOzeti([
      { cari_id: "a", cari_unvan: "A", tutar: 1000, kdv: 200, toplam_tutar: 1200 },
      { cari_id: "a", cari_unvan: "A", tutar: 100, kdv: 1, toplam_tutar: 101 },
      { cari_id: "b", cari_unvan: "B", tutar: 110, kdv: 0, toplam_tutar: 110 },
    ], new Map([["b", 10]]));
    expect(o.toplam).toBe(1411);
    expect(o.kdv).toBe(211);
    expect(o.oranlar.map(x => x.oran)).toEqual([1, 10, 20]);
    expect(o.cariler[0]).toMatchObject({ cari_unvan: "A", toplam: 1301, adet: 2 });
    expect(o.tahminiAdet).toBe(1);
    expect(o.tanimsiz.adet).toBe(0);
  });
  it("carinin KDV oranı tanımsızsa tahmin edilmez, ayrı satırda toplanır", () => {
    const o = kdvOzeti([
      { cari_id: "a", cari_unvan: "A", tutar: 1000, kdv: 200, toplam_tutar: 1200 },
      { cari_id: "b", cari_unvan: "B", tutar: 110, kdv: 0, toplam_tutar: 110 },
      { cari_id: "c", cari_unvan: "C", tutar: 50, kdv: 0, toplam_tutar: 50 },
      { cari_id: "c", cari_unvan: "C", tutar: 25, kdv: 0, toplam_tutar: 25 },
    ], new Map<string, number | null>([["b", null], ["c", null]]));
    expect(o.toplam).toBe(1200);
    expect(o.kdv).toBe(200);
    expect(o.oranlar.map(x => x.oran)).toEqual([20]);
    expect(o.tanimsiz).toEqual({ matrah: 0, kdv: 0, toplam: 185, adet: 3 });
    expect(o.bilinmeyenAdet).toBe(3);
    expect(o.tanimsizCariler).toEqual(["B", "C"]);
    expect(o.tahminiAdet).toBe(0);
    // KDV'si faturada girilmiş fatura, carinin oranı tanımsız olsa da bilinir
    expect(faturaKdvAyristir({ tutar: 100, kdv: 10, toplam_tutar: 110 }, null)).toMatchObject({ oran: 10, kaynak: "fatura" });
  });
});

describe("CSV", () => {
  it("BOM, ; ayraç, virgüllü ondalık, tırnak kaçışı", () => {
    expect(csvMetni([["Ad", "Tutar"], ['A;"B"', 1234.5]])).toBe('﻿Ad;Tutar\r\n"A;""B""";1234,50');
  });
});
