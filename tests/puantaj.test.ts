import { describe, it, expect } from "vitest";
import {
  ayinGunleri, aylikOzet, calismaAraligindaMi, durumGecerliMi, gunlukOzetMetni,
  personelToplami, puantajCsv, puantajHaritasi, csvHucre, type PuantajKaydi,
} from "@/lib/puantaj";

describe("puantaj", () => {
  it("ayın günleri (şubat, artık yıl değil)", () => {
    const g = ayinGunleri(2026, 2);
    expect(g.length).toBe(28);
    expect(g[0]).toBe("2026-02-01");
    expect(g[27]).toBe("2026-02-28");
    expect(ayinGunleri(2026, 9).length).toBe(30);
  });

  it("durum doğrulama", () => {
    expect(durumGecerliMi("calisti")).toBe(true);
    expect(durumGecerliMi("hafta_tatili")).toBe(true);
    expect(durumGecerliMi("yok")).toBe(false);
    expect(durumGecerliMi(undefined)).toBe(false);
  });

  it("çalışma aralığı (bozuk tarih yok sayılır)", () => {
    expect(calismaAraligindaMi("2026-09-05", "2026-09-10", null)).toBe(false);
    expect(calismaAraligindaMi("2026-09-10", "2026-09-10", null)).toBe(true);
    expect(calismaAraligindaMi("2026-09-20", null, "2026-09-15")).toBe(false);
    expect(calismaAraligindaMi("2026-09-20", null, "0026-07-06")).toBe(true);
  });

  it("aylık özet: sayımlar, fazla mesai, girilmemiş gün", () => {
    const gunler = ayinGunleri(2026, 9);
    const k: PuantajKaydi[] = [
      { personel_id: 1, tarih: "2026-09-01", durum: "calisti", fazla_mesai_saat: 2 },
      { personel_id: 1, tarih: "2026-09-02", durum: "calisti", fazla_mesai_saat: "1.5" },
      { personel_id: 1, tarih: "2026-09-03", durum: "izin" },
      { personel_id: 1, tarih: "2026-09-04", durum: "gelmedi" },
      { personel_id: 1, tarih: "2026-09-05", durum: "hafta_tatili" },
      { personel_id: 1, tarih: "2026-08-31", durum: "calisti", fazla_mesai_saat: 5 }, // başka ay
    ];
    const oz = aylikOzet(k, gunler, { sonGun: "2026-09-10" });
    expect(oz.calisti).toBe(2);
    expect(oz.izin).toBe(1);
    expect(oz.gelmedi).toBe(1);
    expect(oz.hafta_tatili).toBe(1);
    expect(oz.fazlaMesai).toBe(3.5);
    expect(oz.girilmemis).toBe(5); // 6-10 Eylül
  });

  it("aylık özet: işe giriş ve çıkış dışındaki günler girilmemiş sayılmaz", () => {
    const gunler = ayinGunleri(2026, 9);
    const oz = aylikOzet([], gunler, { giris: "2026-09-21", cikis: "2026-09-25" });
    expect(oz.girilmemis).toBe(5);
  });

  it("günlük özet metni", () => {
    expect(gunlukOzetMetni(["calisti", "calisti", "izin", "gelmedi"])).toBe("2 çalıştı · 1 izin · 1 gelmedi");
    expect(gunlukOzetMetni(["calisti", "ucretsiz_izin", "izin"])).toBe("1 çalıştı · 2 izin");
    expect(gunlukOzetMetni([])).toBe("Personel yok");
  });

  it("avans/kesinti toplamı: id ile, id yoksa isimle", () => {
    const kayit = [
      { personel_id: "5", personel_isim: "Ali", tutar: 100 },
      { personel_id: null, personel_isim: "Ali ", tutar: "50" },
      { personel_id: "6", personel_isim: "Ali", tutar: 999 }, // başka Ali
      { personel_id: "", personel_isim: "Veli", tutar: 10 },
    ];
    expect(personelToplami(kayit, { id: 5, isim: "Ali" })).toBe(150);
    expect(personelToplami(kayit, { id: 7, isim: "Veli" })).toBe(10);
  });

  it("CSV: BOM, ; ayraç, kısaltma ve toplamlar", () => {
    const gunler = ayinGunleri(2026, 2);
    const k: PuantajKaydi[] = [
      { personel_id: 1, tarih: "2026-02-01", durum: "calisti", fazla_mesai_saat: 1.5 },
      { personel_id: 1, tarih: "2026-02-02", durum: "rapor" },
    ];
    const harita = puantajHaritasi(k);
    const oz = { "1": aylikOzet(k, gunler) };
    const csv = puantajCsv([{ id: 1, isim: "Ayşe; Y", departman: "Mutfak" }], gunler, harita, oz, { "1": 250.5 }, {});
    expect(csv.startsWith("﻿")).toBe(true);
    const satir = csv.slice(1).split("\r\n")[1].split(";");
    // İsimdeki ; tırnaklanır → split'te iki parçaya bölünür; tırnaklamayı ayrı test ediyoruz.
    expect(csvHucre("Ayşe; Y")).toBe('"Ayşe; Y"');
    expect(satir).toContain("Ç+1,5");
    expect(satir).toContain("R");
    expect(satir).toContain("250,5");
  });
});

import { tarihteCalisiyorMu, puantajListesi, puantajFarklari } from "@/lib/puantaj";

describe("günlük rapor puantaj listesi", () => {
  it("işe giriş / çıkış sınırları, bozuk tarih yok sayılır", () => {
    expect(tarihteCalisiyorMu({ id: 1, durum: "aktif", ise_giris_tarihi: "2026-09-10" }, "2026-09-09")).toBe(false);
    expect(tarihteCalisiyorMu({ id: 1, durum: "aktif", ise_giris_tarihi: "2026-09-10" }, "2026-09-10")).toBe(true);
    expect(tarihteCalisiyorMu({ id: 1, durum: "ayrildi", isten_cikis_tarihi: "2026-06-03" }, "2026-06-03")).toBe(true);
    expect(tarihteCalisiyorMu({ id: 1, durum: "ayrildi", isten_cikis_tarihi: "2026-06-03" }, "2026-06-04")).toBe(false);
    expect(tarihteCalisiyorMu({ id: 1, durum: "aktif", ise_giris_tarihi: "0026-07-06" }, "2026-01-01")).toBe(true);
    expect(tarihteCalisiyorMu({ id: 1, durum: "aktif", isten_cikis_tarihi: "0026-07-06" }, "2026-09-01")).toBe(true);
    // ayrılmış ama çıkış tarihi bozuk/eksik → listeye girmez
    expect(tarihteCalisiyorMu({ id: 1, durum: "ayrildi", isten_cikis_tarihi: "0026-07-06" }, "2026-09-01")).toBe(false);
    expect(tarihteCalisiyorMu({ id: 1, durum: "aktif" }, "2026-09-01")).toBe(true);
  });

  it("kaydı olan personel her durumda listede kalır", () => {
    const p = [
      { id: 1, durum: "aktif", ise_giris_tarihi: "2026-01-01" },
      { id: 2, durum: "aktif", ise_giris_tarihi: "2026-10-01" },
      { id: 3, durum: "ayrildi", isten_cikis_tarihi: "2026-06-01" },
    ];
    expect(puantajListesi(p, "2026-09-01").map(x => x.id)).toEqual([1]);
    expect(puantajListesi(p, "2026-09-01", ["3"]).map(x => x.id)).toEqual([1, 3]);
  });
});

describe("talep puantaj farkları", () => {
  const isim = { "1": "Ali", "2": "Veli", "3": "Ayşe" };
  it("durum ve fazla mesai değişiklikleri", () => {
    const f = puantajFarklari(
      [{ personel_id: 1, durum: "calisti", fazla_mesai_saat: 0 }, { personel_id: 2, durum: "calisti", fazla_mesai_saat: 1 }],
      [{ personel_id: 1, durum: "izin", fazla_mesai_saat: 0 }, { personel_id: 2, durum: "calisti", fazla_mesai_saat: "1" }],
      isim,
    );
    expect(f).toEqual([{ alan: "Puantaj — Ali", eskiDeger: "Çalıştı", yeniDeger: "Yıllık izin" }]);
    const g = puantajFarklari([{ personel_id: 2, durum: "calisti", fazla_mesai_saat: 1 }], [{ personel_id: 2, durum: "calisti", fazla_mesai_saat: 2.5 }], isim);
    expect(g[0].eskiDeger).toBe("Çalıştı +1 sa");
    expect(g[0].yeniDeger).toBe("Çalıştı +2,5 sa");
  });
  it("yeni eklenen, silinecek ve ilk giriş", () => {
    const f = puantajFarklari(
      [{ personel_id: 1, durum: "calisti", rapor_id: "r1" }, { personel_id: 3, durum: "gelmedi", rapor_id: null }],
      [{ personel_id: 2, durum: "rapor" }],
      isim, "r1",
    );
    expect(f).toContainEqual({ alan: "Puantaj — Veli", eskiDeger: "—", yeniDeger: "Rapor" });
    expect(f).toContainEqual({ alan: "Puantaj — Ali", eskiDeger: "Çalıştı", yeniDeger: "Kayıt silinecek" });
    expect(f.find(x => x.alan.includes("Ayşe"))).toBeUndefined();
    expect(puantajFarklari([], [{ personel_id: 1, durum: "calisti" }, { personel_id: 2, durum: "izin" }], isim))
      .toEqual([{ alan: "Puantaj (ilk kez girilecek)", eskiDeger: "—", yeniDeger: "1 çalıştı · 1 izin" }]);
    expect(puantajFarklari([], [], isim)).toEqual([]);
  });
});
