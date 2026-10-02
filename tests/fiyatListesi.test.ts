import { describe, it, expect } from "vitest";
import { fiyatKalemleri, aramaEslesir, kisaUnvan, mikroMesajiMi, yerImiKodu, parcala, paketIcerigi, birimFiyatlari, type FiyatSatiri } from "@/lib/fiyatListesi";
import { sadelestir } from "@/lib/menu";

const satir = (p: Partial<FiyatSatiri>): FiyatSatiri => ({
  urun_adi: "DOMATES 1.", vkn: "4691253417", tedarikci: "İBOCAN SEBZE MEYVE GIDA İNŞAAT", birim: "KG",
  liste_fiyat: "40", net_fiyat: "40", iskonto: "0", son_kdv: "1", son_tarih: "2026-09-29", son_fatura: "IBF2026000003159",
  onceki_net: "32", onceki_tarih: "2026-09-25", en_dusuk: "25", en_yuksek: "45",
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

  it("iskontolu net fiyatı ve kutu başı fiyatı verir", () => {
    const [k] = fiyatKalemleri([satir({ urun_adi: "COCA-COLA KUTU 330ML 1X24 DYS", birim: "KUTU", liste_fiyat: "1710.24", net_fiyat: "838.018", iskonto: "51", son_kdv: "10", onceki_net: null })]);
    expect(k.listeFiyat).toBe(1710.24);
    expect(k.fiyat).toBeCloseTo(838.018, 3);
    expect(k.iskonto).toBe(51);
    expect(k.birimFiyatlar.adet).toBeCloseTo(34.92, 2);
    expect(k.fiyatKdvli).toBeCloseTo(921.82, 2);
  });

  it("önceki alım yoksa değişim boş kalır", () => {
    const [k] = fiyatKalemleri([satir({ onceki_net: null, onceki_tarih: null })]);
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

describe("koli / paket içeriği", () => {
  const c = (ad: string, birim: string) => paketIcerigi(ad, birim);
  it("kola kolisi: 24 kutu, 7,92 litre", () => {
    expect(c("COCA-COLA KUTU 330ML 1X24 DYS", "KUTU")).toEqual({ adet: 24, kg: null, lt: expect.closeTo(7.92, 5) });
    expect(c("COCA-COLA KUTU 330ML1X24 FIFA26", "KUTU").adet).toBe(24);
    expect(c("DAMLA PET500MLX24 THD SPN", "KUTU")).toEqual({ adet: 24, kg: null, lt: 12 });
    expect(c("CC LSSGR P2,5L 1X6 DHDH UTC26", "KUTU")).toEqual({ adet: 6, kg: null, lt: 15 });
    expect(c("DAMLA MN.SADE OWB 200 4X6 YSDYS", "KUTU").adet).toBe(24);
  });
  it("paket içi adet ve gramaj", () => {
    expect(c("DOLPHIN ELDİVEN SİYAH ÇOK AMAÇLI LARGE (100 AD.)", "PAKET").adet).toBe(100);
    expect(c("COLORADO STİK KETÇAP 600 * 9 GR", "KUTU")).toEqual({ adet: 600, kg: expect.closeTo(5.4, 5), lt: null });
    expect(c("KİNGTOM STİK MAYONEZ 10 GR * 504", "KUTU").adet).toBe(504);
    expect(c("NİCE ÇÖP TORBASI JUMBO SİYAH 400 G.*20", "PAKET")).toEqual({ adet: 20, kg: 8, lt: null });
    expect(c("DESTİNY FOTOSELLİ KAĞIT HAVLU 20.5 CM. 5 KG*6", "KUTU")).toEqual({ adet: 6, kg: 30, lt: null });
    expect(c("PELİN KAĞIT PEÇETE 24*24 100LÜ*32 KUTULU", "KUTU").adet).toBe(3200);
    expect(c("FOCUS KAĞIT HAVLU DİSPENSER 200LÜ OPTIMIUM", "KUTU").adet).toBe(200);
  });
  it("adet ve kg ile satılanlarda bölme yapmaz, sadece ölçüyü kullanır", () => {
    expect(c("BALLI HARDAL SOS 120Lİ", "ADET")).toEqual({ adet: null, kg: null, lt: null });
    expect(c("SALATALIK 3 NO 9 KG KOVA", "ADET").kg).toBe(9);
    expect(c("AYRAN CAM ŞİŞE 200 ML", "ADET").lt).toBeCloseTo(0.2, 5);
    expect(c("ASPİLİÇ ŞİNİTZEL 1000 GR * 8", "ADET").kg).toBe(1);
    expect(c("TAVUK DÖNER", "KG").kg).toBe(1);
    expect(c("100 GR.LAVAŞ", "ADET").kg).toBeCloseTo(0.1, 5);
  });
  it("kolada %51 iskontolu net fiyattan kutu başına ~35 ₺", () => {
    const f = birimFiyatlari(838.018, "COCA-COLA KUTU 330ML 1X24 DYS", "KUTU");
    expect(f.adet).toBeCloseTo(34.92, 2);
    expect(f.adetSayisi).toBe(24);
  });
});
