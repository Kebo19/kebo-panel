import { describe, it, expect } from "vitest";
import { fiyatKalemleri, aramaEslesir, kisaUnvan, mikroMesajiMi, yerImiKodu, parcala, type FiyatSatiri } from "@/lib/fiyatListesi";
import { sadelestir } from "@/lib/menu";

const satir = (p: Partial<FiyatSatiri>): FiyatSatiri => ({
  urun_adi: "DOMATES 1.", vkn: "4691253417", tedarikci: "İBOCAN SEBZE MEYVE GIDA İNŞAAT", birim: "KG",
  son_fiyat: "40", son_kdv: "1", son_tarih: "2026-09-29", son_fatura: "IBF2026000003159",
  onceki_fiyat: "32", onceki_tarih: "2026-09-25", en_dusuk: "25", en_yuksek: "45",
  alim_sayisi: 12, toplam_miktar: "180", ilk_tarih: "2026-01-03", ...p,
});

describe("fiyat listesi", () => {
  it("son fiyatı, KDV dahil fiyatı ve önceki alıma göre değişimi hesaplar", () => {
    const [k] = fiyatKalemleri([satir({})]);
    expect(k.fiyat).toBe(40);
    expect(k.fiyatKdvli).toBeCloseTo(40.4, 5);
    expect(k.degisim).toBeCloseTo(25, 5);
    expect(k.tedarikci).toBe("İbocan Sebze");
  });

  it("önceki alım yoksa değişim boş kalır", () => {
    const [k] = fiyatKalemleri([satir({ onceki_fiyat: null, onceki_tarih: null })]);
    expect(k.onceki).toBeNull();
    expect(k.degisim).toBeNull();
  });

  it("Türkçe karakter ve büyük/küçük harf farkını yok sayarak arar", () => {
    const [k] = fiyatKalemleri([satir({ urun_adi: "DOLPHIN ELDİVEN SİYAH ÇOK AMAÇLI LARGE (100 AD.)", tedarikci: "KADİR SUNEL" })]);
    expect(aramaEslesir(k, "eldiven", sadelestir)).toBe(true);
    expect(aramaEslesir(k, "eldıven sıyah", sadelestir)).toBe(true);
    expect(aramaEslesir(k, "kadir", sadelestir)).toBe(true);
    expect(aramaEslesir(k, "kola", sadelestir)).toBe(false);
    expect(aramaEslesir(k, "  ", sadelestir)).toBe(true);
  });

  it("tedarikçi unvanını kısaltır", () => {
    expect(kisaUnvan("KEBO RESTAURANT PAZARLAMA SANAYİ VE TİCARET ANONİM ŞİRKETİ")).toBe("Kebo Restaurant");
    expect(kisaUnvan("KADİR SUNEL")).toBe("Kadir Sunel");
    expect(kisaUnvan(null)).toBe("—");
  });

  it("sadece Mikro adresinden gelen aktarım mesajlarını kabul eder", () => {
    expect(mikroMesajiMi("https://eportal.mikrogrup.com", { kaynak: "kebo-aktar", tip: "hazir" })).toBe(true);
    expect(mikroMesajiMi("https://kotu.example.com", { kaynak: "kebo-aktar", tip: "hazir" })).toBe(false);
    expect(mikroMesajiMi("https://eportal.mikrogrup.com", { kaynak: "baska", tip: "hazir" })).toBe(false);
    expect(mikroMesajiMi("https://eportal.mikrogrup.com", null)).toBe(false);
  });

  it("yer imi panel adresini ve aktarma dosyasını içerir", () => {
    const kod = yerImiKodu("https://kebo-panel.vercel.app");
    expect(kod.startsWith("javascript:")).toBe(true);
    expect(kod).toContain('"https://kebo-panel.vercel.app/kebo-aktar.js"');
    expect(kod).toContain('window.KEBO_PANEL="https://kebo-panel.vercel.app"');
  });

  it("listeyi parçalara böler", () => {
    expect(parcala([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(parcala([], 40)).toEqual([]);
  });
});
