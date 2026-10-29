import { describe, it, expect } from "vitest";
import { roketExcelOku, isGunu, roketKanali, kuryeKarsilastir, roketTahsilat, adEslesir, varsayilanAtama, slotToplami } from "@/lib/roket";

const B = ["Sipariş Tarihi", "İşletme Adı", "Alıcı Adı", "Kurye", "Durum", "Tutar", "Ödeme Yöntemi", "Telefon", "Mesafe", "İleri Tarih", "Yönlendiren"];
const s = (t: string, kurye: string, tutar: string, odeme: string, yon: string, durum = "Teslim Edildi", km = "1.50 Km") =>
  [t, "KEBO", "GİZLİ MÜŞTERİ", kurye, durum, tutar, odeme, "5550000000", km, "Yok", yon];

const satirlar = [
  B,
  s("16.10.2026 12:00", "MUSTAFA ÇETİN", "359,00", "Nakit", "LOCAL SIPARIS"),
  s("16.10.2026 12:10", "MUSTAFA ÇETİN", "500,00", "Online Ödeme", "Trendyol / KEBO"),
  s("16.10.2026 12:20", "MUSTAFA ÇETİN", "628,00", "Yemek Karti", "Trendyol / KEBO"),   // online, kurye almaz
  s("16.10.2026 12:30", "Furkan BİÇİCİ", "886,00", "Yemek Karti", "LOCAL SIPARIS"),     // kapıda yemek kartı
  s("16.10.2026 12:40", "Furkan BİÇİCİ", "1.014,00", "Pos", "LOCAL SIPARIS"),
  s("16.10.2026 13:00", "Semih  Akça", "564,00", "Paye Kod", "Trendyol / KEBO"),
  s("16.10.2026 13:10", "Yahya SEÇER", "668,00", "Nakit", "Trendyol / KEBO"),
  s("17.10.2026 01:30", "Yahya SEÇER", "100,00", "Bilinmeyen", "LOCAL SIPARIS"),       // gece → 16.10
  s("16.10.2026 14:00", "Kerim BAYRAK", "200,00", "Nakit", "Yemeksepeti / Çorum kebo yemeksepeti", "İptal Edildi"),
  ["", "", "", "İptal Paket: 1", "Toplam Nakit: 1.127,00₺", "", "Toplam Online: 500₺"],
];

describe("Roket Paket Raporu", () => {
  const o = roketExcelOku(satirlar);
  const g = o.gunler[0];
  it("iş gününe göre gruplar (gece 05:00'e kadar önceki gün)", () => {
    expect(isGunu("17.10.2026 01:30")).toBe("2026-10-16");
    expect(isGunu("17.10.2026 09:00")).toBe("2026-10-17");
    expect(o.gunler.map(x => x.tarih)).toEqual(["2026-10-16"]);
  });
  it("teslim edilenleri sayar, iptali ayırır, toplam satırlarını atlar", () => {
    expect(g.toplamPaket).toBe(8);
    expect(g.iptal).toBe(1);
  });
  it("kuryenin kapıda topladığını ödeme türüne göre ayırır", () => {
    const m = g.kuryeler.find(k => k.ad === "MUSTAFA ÇETİN")!;
    expect(m).toMatchObject({ paket: 3, nakit: 359, pos: 0, yemek: 0 }); // platform yemek kartı online
    const f = g.kuryeler.find(k => k.ad === "Furkan BİÇİCİ")!;
    expect(f).toMatchObject({ yemek: 886, pos: 1014 });
    expect(roketTahsilat(f)).toBe(1900);
    expect(g.kuryeler.find(k => k.ad === "Semih Akça")!.paye).toBe(564);
    expect(g.kuryeler.find(k => k.ad === "Yahya SEÇER")).toMatchObject({ nakit: 668, bilinmeyen: 100 });
  });
  it("varsayılan: en çok paket atan iki kurye Sabit 1 ve 2", () => {
    expect(g.kuryeler.filter(k => k.atama === "s1").map(k => k.ad)).toEqual(["MUSTAFA ÇETİN"]);
    expect(g.kuryeler.filter(k => k.atama === "s2").map(k => k.ad)).toEqual(["Furkan BİÇİCİ"]);
  });
  it("önceki günün sabit kuryeleri gelirse aynı sabite atanır, yerine gelen elle eklenebilir", () => {
    const a = varsayilanAtama(g.kuryeler, { s1: ["Yahya SEÇER"] });
    expect(a.find(k => k.ad === "Yahya SEÇER")!.atama).toBe("s1");
    expect(a.find(k => k.ad === "MUSTAFA ÇETİN")!.atama).toBe("s2");
    // Mustafa 2 saat yok, yerine Semih geldi → ikisi de Sabit 1: toplanır
    const gun = { ...g, kuryeler: g.kuryeler.map(k => ({ ...k, atama: k.ad === "Semih Akça" ? "s1" as const : k.atama })) };
    const t = slotToplami(gun, "s1");
    expect(t.adlar).toEqual(["MUSTAFA ÇETİN", "Semih Akça"]);
    expect(t.paket).toBe(4);
    expect(t.paye).toBe(564);
  });
  it("platform kanallarını MagicPay adlarıyla eşler", () => {
    expect(roketKanali("Trendyol / KEBO")).toBe("kebo_trendyol");
    expect(roketKanali("Trendyol / CHİKN")).toBe("cnf_trendyol");
    expect(roketKanali("Trendyol / Kıraloğlu Döner")).toBe("kir_trendyol");
    expect(roketKanali("LOCAL SIPARIS")).toBe("alo");
    expect(roketKanali("Fiş Tarandı")).toBeNull();
    expect(g.kanallar).toMatchObject({ alo: 4, kebo_trendyol: 4 });
  });
  it("müşteri bilgisini özete taşımaz", () => {
    expect(JSON.stringify(o)).not.toContain("GİZLİ MÜŞTERİ");
    expect(JSON.stringify(o)).not.toContain("5550000000");
  });
  it("kasa raporu satırlarıyla karşılaştırır (1. sabit ↔ Sabit 1, havuz toplanır)", () => {
    expect(adEslesir("Mustafa", "MUSTAFA ÇETİN")).toBe(true);
    const k = kuryeKarsilastir(g, [
      { isim: "Mustafa", tip: "sabit", paketSayisi: "3", nakit: "359", pos: "0" },
      { isim: "Furkan", tip: "sabit", paketSayisi: "2", nakit: "0", pos: "1014", paye: "886" },
      { isim: "Havuz", tip: "havuz", paketSayisi: "2", nakit: "0", pos: "0" },
    ]);
    expect(k[0]).toMatchObject({ kuryeler: ["MUSTAFA ÇETİN"], roket: { paket: 3, nakit: 359 }, kasa: { paket: 3, nakit: 359 } });
    expect(k[1]).toMatchObject({ roket: { kart: 886, pos: 1014 }, kasa: { kart: 886, pos: 1014 } });
    expect(k[2].roket).toMatchObject({ paket: 3, nakit: 668, kart: 664 });
    expect(k[2].kasa).toMatchObject({ paket: 2, nakit: 0 });
  });
});

describe("paket kontrolü: Roket ↔ MagicPay + Kıraloğlu Migros", () => {
  it("Kıraloğlu Migros elle eklenir, farklı kanal ve Roket'in kendi girişleri gösterilir", async () => {
    const { paketKontrolu } = await import("../lib/roket");
    const g = { kanallar: { kebo_ys: 10, alo: 5, kir_migros: 2 }, digerPaket: 1, toplamPaket: 18 };
    const k = paketKontrolu(g, { kebo_ys: 10, alo: 5, kir_migros: 2 });
    expect(k).toMatchObject({ roket: 18, bizde: 17, kirMigros: 2, fark: 1, rokettenEk: 1 });
    expect(k.farkliKanallar).toEqual([]);
    const k2 = paketKontrolu(g, { kebo_ys: 9, alo: 5 });
    expect(k2.fark).toBe(4);
    expect(k2.farkliKanallar.map(s => s.kanal)).toEqual(["kebo_ys", "kir_migros"]);
  });
});
