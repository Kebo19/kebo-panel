import { describe, it, expect } from "vitest";
import { mpRaporDoldurma, type MpGun } from "@/lib/magicpay";

// 16.10.2026 MagicPay verisi (gerçek gün, sadeleştirilmiş)
const gun: MpGun = {
  tarih: "2026-10-16", brut: 0, net: 0, indirim: 0, iade: 0, iptal: 0, siparisMasa: 0, siparisPaket: 0, masaCiro: 0, paketCiro: 0,
  masaOdeme: { cash: 8107.86, card: 25933.83, paye: 114, unknown_meal_card: 50 },
  paketOdeme: {
    TRENDYOL_CARD: 20038.49, YEMEKSEPETI_CARD: 12554.91, kart: 687, TRENDYOL_PLUXEE: 1246, unknown: 687.98,
    MIGROS_MONEY_PAY: 335, NAKİT: 733, POS: 1014, TRENDYOL_ON_DELIVERY: 668, MIGROS_CARD: 1700,
  },
  kaynaklar: [
    { platform: "local", marka: "Yerel Siparis Credential", etiket: "", siparis: 6, brut: 3121.98, indirim: 0, net: 0 },
    { platform: "migros", marka: "Çorum Migros", etiket: "", siparis: 5, brut: 2845, indirim: 810, net: 0 },
    { platform: "trendyol", marka: "Kıraloğlu Döner", etiket: "", siparis: 2, brut: 1051, indirim: 400, net: 0 },
    { platform: "trendyol", marka: "CHİKN", etiket: "", siparis: 5, brut: 3023, indirim: 805.01, net: 0 },
    { platform: "trendyol", marka: "KEBO", etiket: "", siparis: 43, brut: 27336, indirim: 7385.5, net: 0 },
    { platform: "yemeksepeti", marka: "Çorum kebo yemeksepeti", etiket: "", siparis: 22, brut: 13517, indirim: 1904.81, net: 0 },
    { platform: "yemeksepeti", marka: "Çorum Chickn Yemeksepeti", etiket: "", siparis: 2, brut: 1077, indirim: 134.28, net: 0 },
  ],
};

describe("MagicPay → Kasa Raporu doldurma", () => {
  const d = mpRaporDoldurma(gun);
  it("platform satırlarını marka ve platforma göre doldurur", () => {
    expect(d.platform.os_kebo_ys).toEqual({ tutar: 13517, paket: 22 });
    expect(d.platform.os_cnf_trendyol).toEqual({ tutar: 3023, paket: 5 });
    expect(d.platform.os_kir_trendyol).toEqual({ tutar: 1051, paket: 2 });
    expect(d.platform.os_kebo_migros).toEqual({ tutar: 2845, paket: 5 });
  });
  it("Kıraloğlu Migros'a dokunmaz (MagicPay'de yok)", () => {
    expect(d.platform.os_kir_migros_yemek).toBeUndefined();
  });
  it("Trendyol kapıda ödemeyi Kebo kapıdaya taşır, online'dan düşer", () => {
    expect(d.kapidaKebo.trendyol).toBe(668);
    expect(d.platform.os_kebo_trendyol.tutar).toBe(27336 - 668);
  });
  it("Alo Paket nakit / POS'u ayırır, toplam brüte eşit kalır", () => {
    expect(d.alo.pos).toBe(1701);
    expect(d.alo.nakit).toBeCloseTo(733 + 687.98, 2);
    expect(d.alo.nakit + d.alo.pos).toBeCloseTo(3121.98, 2);
    expect(d.alo.paket).toBe(6);
  });
  it("kasada POS ve yemek kartlarını doldurur, nakdi sadece ipucu verir", () => {
    expect(d.kasa.pos).toBe(25933.83);
    expect(d.kasa.kartlar).toEqual({ kasa_paye: 114 });
    expect(d.kasa.nakit).toBe(8107.86);
    expect(d.kasa.tanimsizKart).toBe(50);
  });
  it("indirimleri de verir ve belirsizlikleri uyarır", () => {
    expect(d.indirimler.os_kebo_trendyol_indirim).toBe(7385.5);
    expect(d.uyarilar.some(u => u.includes("Trendyol kapıda"))).toBe(true);
    expect(d.uyarilar.some(u => u.includes("Alo Paket"))).toBe(true);
    expect(d.uyarilar.some(u => u.includes("yemek kartının türü"))).toBe(true);
  });
});
