import { describe, it, expect } from "vitest";
import { brutCiro, netCiro, paketToplam, platformKirilimi, kapidaKasadaMi, roadrunnerKuryesiMi, roadrunnerKuryeUcreti, type RaporVerisi } from "@/lib/hesap";

// Veritabanındaki 01.06.2026 raporunun rakamları (eski, tek platform yapısı)
const eskiRapor: RaporVerisi = {
  tarih: "2026-06-01",
  os_yemeksepeti: 5468, os_trendyol: 3621, os_getir: 7719, os_migros: 0, os_chicknfride: 0,
  ko_yemeksepeti: 2824, ko_getir: 255, ko_alo_paket: 1425,
  kasa_nakit: 20000, kasa_pos: 12037, gunluk_gider: 2830, iade_tutar: 0,
  kurye_raporlari: [{ paketSayisi: "20" }, { paketSayisi: "15" }],
};

describe("brüt / net ciro", () => {
  it("13.08 öncesi: kapıda ödeme kasanın içinde, brüte ayrıca eklenmez", () => {
    expect(kapidaKasadaMi("2026-06-01")).toBe(true);
    // online 16.808 + kasa 32.037 + gider 2.830 = 51.675 (veritabanındaki toplam_ciro ile aynı)
    expect(brutCiro(eskiRapor)).toBe(51675);
  });

  it("13.08 ve sonrası: kapıda ödeme brüte eklenir", () => {
    const r: RaporVerisi = { tarih: "2026-09-01", os_kebo_ys: 1000, ko_kebo_ys: 500, kasa_nakit: 2000, gunluk_gider: 100 };
    expect(brutCiro(r)).toBe(1000 + 500 + 2000 + 100);
  });

  it("net = brüt − gider − iade − indirim", () => {
    const r: RaporVerisi = { tarih: "2026-09-01", os_kebo_ys: 1000, os_kebo_ys_indirim: 80, kasa_nakit: 2000, gunluk_gider: 100, iade_tutar: 50 };
    expect(netCiro(r)).toBe(1000 + 2000 + 100 - 100 - 50 - 80);
  });

  it("yeni yapıda Chick'N Fride iki kez sayılmaz", () => {
    // Formun kaydettiği şekil: eski alanlar platform başına Kebo+CNF toplamı, os_chicknfride = 0
    const r: RaporVerisi = {
      tarih: "2026-09-02",
      os_kebo_ys: 1000, os_cnf_ys: 400, os_yemeksepeti: 1400, os_chicknfride: 0,
      kasa_nakit: 500,
    };
    expect(brutCiro(r)).toBe(1900);
    const k = platformKirilimi(r);
    expect(k.online.Yemeksepeti).toBe(1400);
    expect(k.marka).toEqual({ kebo: 1000, cnf: 400, bilinmiyor: 0 });
  });

  it("eski yapıda os_chicknfride dolu olsa bile yeni alanlar önceliklidir", () => {
    // Eski kodun kaydettiği hatalı şekil: os_chicknfride = CNF toplamı ve os_yemeksepeti'nde de CNF var
    const r: RaporVerisi = { tarih: "2026-09-02", os_kebo_ys: 1000, os_cnf_ys: 400, os_yemeksepeti: 1400, os_chicknfride: 400 };
    expect(brutCiro(r)).toBe(1400);
  });
});

describe("paket", () => {
  it("uzak ve 9km üzeri paketler dahil", () => {
    expect(paketToplam({ tarih: "2026-09-01", kurye_raporlari: [{ paketSayisi: "25", uzakPaket: "3", paket9km: "2" }, { paketSayisi: 10 }] })).toBe(40);
  });
  it("eski raporlar (sadece paketSayisi)", () => {
    expect(paketToplam(eskiRapor)).toBe(35);
  });
});

describe("Roadrunner", () => {
  it("kendi kuryelerimiz ve 13.08 öncesi ücretlendirilmez", () => {
    expect(roadrunnerKuryesiMi("2026-06-01", { tip: "havuz" })).toBe(false);
    expect(roadrunnerKuryesiMi("2026-09-01", { tip: "kendi" })).toBe(false);
    expect(roadrunnerKuryesiMi("2026-09-01", {})).toBe(false);
    expect(roadrunnerKuryesiMi("2026-09-01", { tip: "sabit" })).toBe(true);
  });
  it("sabit kuryede 30 paket garantisi, uzak 1.5x, 9km 2x", () => {
    const u = roadrunnerKuryeUcreti({ tip: "sabit", paketSayisi: "20", uzakPaket: "2", paket9km: "1" });
    expect(u.gercek).toBe(23);
    expect(u.uygulanan).toBe(30);
    expect(u.ucret).toBe(20 * 100 + 2 * 150 + 1 * 200 + 7 * 100);
  });
});
