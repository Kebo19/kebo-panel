import { describe, it, expect } from "vitest";
import { kuryeKartTahsilati, kuryeTahsilati, roadrunnerTahsilati, yemekKartiSatislari } from "@/lib/hesap";
import { yemekKartiAlacaklari } from "@/lib/kasaHesaplari";
import { yemekKartiBul, yemekKartiMutabakati } from "@/lib/mutabakat";

// 28.10.2026: kurye kapıda Token Flex / Paye Kart ile tahsilat yapabiliyor; bu tutar
// yemek kartı alacağıdır — kasa beklentisine ve Roadrunner mahsubuna girmez.
const rapor = {
  tarih: "2026-10-28",
  kasa_paye: 100,
  kasa_tokenflex: 20,
  kurye_raporlari: [
    { tip: "sabit" as const, nakit: "500", pos: "300", tokenflex: "120", paye: "80" },
    { tip: "havuz" as const, nakit: "200", pos: "0", tokenflex: "30", paye: "" },
  ],
};

describe("kurye yemek kartı tahsilatı", () => {
  it("sabit ve havuz kuryelerin kart tutarlarını toplar", () => {
    expect(kuryeKartTahsilati(rapor)).toEqual({ tokenflex: 150, paye: 80 });
  });
  it("kasaya teslim ve Roadrunner hesabını değiştirmez", () => {
    expect(kuryeTahsilati(rapor)).toEqual({ nakit: 500, pos: 300 });
    expect(roadrunnerTahsilati(rapor)).toEqual({ nakit: 200, pos: 0 });
  });
  it("yemek kartı satışlarına eklenir (Paye = kasa + kurye, Token Flex ayrı kart)", () => {
    const s = yemekKartiSatislari(rapor);
    expect(s.Paye).toBe(180);
    expect(s["Token Flex"]).toBe(170); // dükkân 20 + kurye 150
    expect(s.Edenred).toBe(0);
  });
  it("Kasa'daki yemek kartı alacaklarında görünür", () => {
    const a = yemekKartiAlacaklari([rapor], [
      { tip: "gelir", kategori: "Yemek Kartı Tahsilatı", islem_tarihi: "2026-10-30", tutar: 140, aciklama: "TOKEN FLEX ODEME" },
    ] as never, "2026-10-01", "2026-10");
    const tf = a.kartlar.find(k => k.ad === "Token Flex")!;
    expect(tf).toMatchObject({ satis: 170, yatan: 140, bekleyen: 30 });
    expect(a.kartlar.find(k => k.ad === "Paye")!.satis).toBe(180);
  });
  it("MagicPay'de Token masa ödemesi Token Flex kasasına eşlenir", async () => {
    const { masaOdemeKalemi } = await import("@/lib/magicpay");
    expect(masaOdemeKalemi("token_flex")).toBe("kasa_tokenflex");
  });
  it("banka açıklamasından Token Flex'i tanır", () => {
    expect(yemekKartiBul("Token Finansal Teknolojiler Flex hakediş")).toBe("Token Flex");
    expect(yemekKartiBul("PAYE KART ODEMESI")).toBe("Paye");
  });
  it("POS & kart mutabakatında Token Flex satırı olur", () => {
    const m = yemekKartiMutabakati([rapor], []);
    expect(m.toplam.find(k => k.ad === "Token Flex")!.satis).toBe(170);
  });
});
