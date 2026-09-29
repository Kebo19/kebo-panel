import { describe, it, expect } from "vitest";
import {
  karZararHesapla, sabitGiderDurum, sonAylar, eksikRaporGunu, ayinGunSayisi, ayEtiketi,
  type KasaIslemiKZ,
} from "@/lib/karZarar";
import type { RaporVerisi } from "@/lib/hesap";

// Basit rapor: brüt = kasa 10.000 + gider 1.000 = 11.000; net = 11.000 − 1.000 − iade 200 = 9.800
const rapor = (tarih: string, ek: Partial<RaporVerisi> = {}): RaporVerisi => ({
  tarih, kasa_nakit: 6000, kasa_pos: 4000, gunluk_gider: 1000, iade_tutar: 200, ...ek,
});

const kasa = (tip: string, kategori: string, tutar: number, islem_tarihi = "2026-09-10", kaynak: string | null = null): KasaIslemiKZ =>
  ({ tip, kategori, tutar, islem_tarihi, kaynak });

describe("karZararHesapla", () => {
  const girdi = {
    ay: "2026-09",
    raporlar: [
      rapor("2026-09-01"),
      rapor("2026-09-02", {
        kurye_raporlari: [
          { tip: "sabit" as const, paketSayisi: "10" },               // garanti 30 → 3.000
          { tip: "havuz" as const, paketSayisi: "4", uzakPaket: "2" }, // 400 + 300 = 700
          { tip: "kendi" as const, paketSayisi: "50" },               // sayılmaz
        ],
      }),
      rapor("2026-08-31"), // başka ay
    ],
    faturalar: [
      { fatura_tarihi: "2026-09-05", toplam_tutar: 3000 },
      { fatura_tarihi: "2026-09-20", toplam_tutar: "1500.5" },
      { fatura_tarihi: "2026-08-25", toplam_tutar: 99999 },
    ],
    kasaIslemleri: [
      kasa("gider", "Personel Maaş", 2000),
      kasa("gider", "Personel Avans", 300),
      kasa("gider", "Personel Avans", 500, "2026-09-10", "avans"), // Personel sayfasından verilen avans — Personel'de sayılır
      kasa("gider", "SGK Primi", 700),
      kasa("gider", "Kira", 1000, "2026-09-01", "sabit_gider"),
      kasa("gider", "Elektrik", 400),
      kasa("gider", "Market / Malzeme", 250),
      kasa("gider", "Eski nakitten ödeme", 100, "2026-09-03", "rapor_nakit"),
      kasa("gider", "Banka Komisyonu", 50),
      kasa("gider", "POS Komisyonu", 80),
      kasa("gider", "Cari Ödeme", 2500, "2026-09-15", "cari_odeme"),
      kasa("gider", "Kredi Taksidi", 900),
      kasa("gelir", "Ortak Sermaye", 10000),
      kasa("gelir", "POS / Kart Tahsilatı", 3900),
      kasa("gelir", "Platform Hakedişi", 5000),
      kasa("gelir", "Yemek Kartı Tahsilatı", 700),
      kasa("gelir", "Diğer Gelir", 150),
      kasa("gelir", "Nakit kasa açılış", 4000),
      kasa("gider", "Kasa sayım farkı", 30),
      kasa("transfer", "VakıfBank → Enpara", 6000),
      kasa("gider", "Kira", 5555, "2026-08-01"), // başka ay
    ],
    krediTaksidiGider: false,
    bugun: "2026-09-29",
  };

  it("kalemleri doğru ayırır", () => {
    const s = karZararHesapla(girdi);
    expect(s.brut).toBe(22000);
    expect(s.gunlukGider).toBe(2000);
    expect(s.iade).toBe(400);
    expect(s.netCiro).toBe(19600);
    expect(s.malAlisi).toBe(4500.5);
    expect(s.faturaSayisi).toBe(2);
    expect(s.personel).toBe(3500);
    expect(s.personelDetay).toEqual({ "Personel Maaş": 2000, "Personel Avans": 800, "SGK Primi": 700 });
    expect(s.kurye).toBe(3700);
    expect(s.sabitIsletme).toBe(1750);
    expect(s.sabitIsletmeDetay["Diğer (eski nakitten ödeme)"]).toBe(100);
    expect(s.komisyon).toBe(130);
    expect(s.digerGelir).toBe(150);
    expect(s.kasaFarki).toBe(-30);
    expect(s.krediTaksidi).toBe(0);
    expect(s.raporCariOdeme).toBe(0);
    // 19.600 − 4.500,5 − 3.500 − 3.700 − 1.750 − 130 + 150 − 30
    expect(s.isletmeKari).toBe(6139.5);
    expect(s.karMarji).toBe(31.3);
  });

  it("nakit akışı kalemleri kâra girmez", () => {
    const s = karZararHesapla(girdi);
    expect(s.nakitAkisi).toEqual({
      ortakSermaye: 10000, krediGirisi: 0, krediTaksidi: 900, cariOdeme: 2500,
      transfer: 6000, tahsilat: 9600, kasaAcilis: 4000,
    });
  });

  it("kredi taksidi anahtarı açıkken gider sayılır", () => {
    const s = karZararHesapla({ ...girdi, krediTaksidiGider: true });
    expect(s.krediTaksidi).toBe(900);
    expect(s.isletmeKari).toBe(6139.5 - 900);
  });

  it("cari ödemeler tablosu verilirse oradan hesaplanır", () => {
    const s = karZararHesapla({ ...girdi, cariOdemeler: [{ tarih: "2026-09-02", tutar: 100 }, { tarih: "2026-10-01", tutar: 5 }] });
    expect(s.nakitAkisi.cariOdeme).toBe(100);
  });

  it("rapordan yapılan cari ödeme net ciroya geri eklenir (gunluk_gider + mal alışı çift sayımı)", () => {
    const s = karZararHesapla({ ...girdi, cariOdemeler: [
      { tarih: "2026-09-02", tutar: 400, rapor_id: "r1" },
      { tarih: "2026-09-03", tutar: 1000, rapor_id: null },
      { tarih: "2026-08-30", tutar: 77, rapor_id: "r0" },
    ] });
    expect(s.raporCariOdeme).toBe(400);
    expect(s.netCiro).toBe(19600 + 400);
    expect(s.isletmeKari).toBe(6139.5 + 400);
    expect(s.nakitAkisi.cariOdeme).toBe(1400);
  });

  it("eksik rapor günü", () => {
    const s = karZararHesapla(girdi);
    expect(s.raporGunSayisi).toBe(2);
    expect(s.eksikGun).toBe(27);
  });

  it("boş ay", () => {
    const s = karZararHesapla({ ay: "2026-07", raporlar: [], faturalar: [], kasaIslemleri: [], krediTaksidiGider: false });
    expect(s.isletmeKari).toBe(0);
    expect(s.karMarji).toBe(0);
    expect(s.eksikGun).toBe(31);
  });
});

describe("yardımcılar", () => {
  it("sonAylar yıl geçişi", () => {
    expect(sonAylar("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("eksikRaporGunu gelecek ay/gün saymaz", () => {
    expect(eksikRaporGunu([], "2026-10", "2026-09-29")).toBe(0);
    expect(eksikRaporGunu(["2026-09-01", "2026-09-01", "2026-09-02"], "2026-09", "2026-09-05")).toBe(3);
    expect(eksikRaporGunu([], "2026-08", "2026-09-29")).toBe(31);
  });
  it("ayinGunSayisi ve etiket", () => {
    expect(ayinGunSayisi("2028-02")).toBe(29);
    expect(ayEtiketi("2026-09")).toBe("Eylül 2026");
  });
  it("sabitGiderDurum", () => {
    expect(sabitGiderDurum(5, "2026-09-29", "2026-09-04")).toBe("odendi");
    expect(sabitGiderDurum(5, "2026-09-29", "2026-08-04")).toBe("gecikti");
    expect(sabitGiderDurum(5, "2026-09-05")).toBe("bekliyor");
    expect(sabitGiderDurum(5, "2026-09-06")).toBe("gecikti");
    // 31'i olan gider 30 çeken ayda 30'unda vadesi dolar
    expect(sabitGiderDurum(31, "2026-09-30")).toBe("bekliyor");
    expect(sabitGiderDurum(31, "2026-02-28")).toBe("bekliyor");
  });
});
