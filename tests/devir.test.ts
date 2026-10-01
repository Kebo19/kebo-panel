import { describe, it, expect } from "vitest";
import { ayDevri, kullanimdaMi, sonrakiAyBasi, KULLANIM_BASLANGIC } from "@/lib/devir";
import { karZararHesapla, type KasaIslemiKZ } from "@/lib/karZarar";

describe("ayDevri", () => {
  it("eski borç ödenince elde kalan kârdan düşer", () => {
    // 300 bin devraldı, ay 400 bin kâr etti; bu ayın 250 bin faturasını ve eski 300 bini ödedi
    const s = ayDevri({ devredenBorc: 300000, buAyFatura: 250000, buAyOdeme: 550000, isletmeKari: 400000 });
    expect(s.aySonuBorc).toBe(0);
    expect(s.borcAzalisi).toBe(300000);
    expect(s.eldeKalan).toBe(100000);
  });

  it("ödenmeyen fatura borcu artırır, elde kalan kârdan fazla olur", () => {
    const s = ayDevri({ devredenBorc: 300000, buAyFatura: 250000, buAyOdeme: 100000, isletmeKari: 400000 });
    expect(s.aySonuBorc).toBe(450000);
    expect(s.borcAzalisi).toBe(-150000);
    expect(s.eldeKalan).toBe(550000);
  });

  it("kuruşları yuvarlar, metin tutarları kabul eder", () => {
    const s = ayDevri({ devredenBorc: "526449.92" as unknown as number, buAyFatura: 0.1, buAyOdeme: 0.2, isletmeKari: 0 });
    expect(s.aySonuBorc).toBe(526449.82);
  });
});

describe("yardımcılar", () => {
  it("kullanım başlangıcı", () => {
    expect(KULLANIM_BASLANGIC).toBe("2026-10-01");
    expect(kullanimdaMi("2026-09")).toBe(false);
    expect(kullanimdaMi("2026-10")).toBe(true);
    expect(kullanimdaMi("2027-01")).toBe(true);
  });
  it("sonrakiAyBasi yıl geçişi", () => {
    expect(sonrakiAyBasi("2026-10")).toBe("2026-11-01");
    expect(sonrakiAyBasi("2026-12")).toBe("2027-01-01");
  });
});

describe("açılış bakiyesi kâr/zarara girmez", () => {
  const k = (tip: string, kategori: string, tutar: number): KasaIslemiKZ => ({ tip, kategori, tutar, islem_tarihi: "2026-10-01" });
  it("banka açılışı nakit akışında görünür", () => {
    const s = karZararHesapla({
      ay: "2026-10", raporlar: [], faturalar: [], krediTaksidiGider: false,
      kasaIslemleri: [k("gelir", "Açılış bakiyesi", 150000), k("gelir", "Nakit kasa açılış", 5000)],
    });
    expect(s.digerGelir).toBe(0);
    expect(s.isletmeKari).toBe(0);
    expect(s.nakitAkisi.kasaAcilis).toBe(155000);
  });
});
