import { describe, it, expect } from "vitest";
import { roketExcelOku, isGunu, roketKanali, kuryeKarsilastir, roketTahsilat, adEslesir, varsayilanAtama, atamaBirlestir, slotToplami } from "@/lib/roket";

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
  it("Roket'e elle girilen siparişin ayrıntısını tutar (müşteri adı var, telefon yok)", () => {
    const d = roketExcelOku([B, s("16.10.2026 22:05", "Kerim BAYRAK", "358,00", "Nakit", "Fiş Tarandı"), s("17.10.2026 00:40", "Kerim BAYRAK", "100,00", "Pos", "Roket Adisyon")]).gunler[0];
    expect(d.digerPaket).toBe(2);
    expect(d.digerSiparisler?.map(x => x.saat)).toEqual(["22:05", "00:40"]); // gece sona
    expect(d.digerSiparisler?.slice(0, 1)).toEqual([{ saat: "22:05", kurye: "Kerim BAYRAK", tutar: 358, odeme: "Nakit", kaynak: "Fiş Tarandı", musteri: "GİZLİ MÜŞTERİ", isletme: "KEBO", km: 1.5 }]);
    expect(JSON.stringify(g)).not.toContain("GİZLİ MÜŞTERİ"); // platform siparişlerinde ad tutulmaz
    expect(JSON.stringify(d)).not.toContain("5550000000");
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
    const kur = (ad: string, paket: number) => ({ ...g.kuryeler[0], ad, paket, atama: "havuz" as const });
    const a = varsayilanAtama([kur("Mustafa", 33), kur("Yahya", 26), kur("Ali", 5)], { s1: ["Yahya"] });
    expect(a.find(k => k.ad === "Yahya")!.atama).toBe("s1");
    expect(a.find(k => k.ad === "Mustafa")!.atama).toBe("s2");
    // 31.10: dünkü sabit Nizam bugün 1 paket attı → sabit sayılmaz; en çok atan Mustafa ve Yahya sabit olur
    const b = varsayilanAtama([kur("Nizam", 1), kur("Mustafa", 33), kur("Yahya", 26), kur("Ali", 17)], { s1: ["Nizam"], s2: ["Yahya"] });
    expect(b.find(k => k.ad === "Nizam")!.atama).toBe("havuz");
    expect(b.find(k => k.ad === "Yahya")!.atama).toBe("s2");
    expect(b.find(k => k.ad === "Mustafa")!.atama).toBe("s1");
    expect(b.find(k => k.ad === "Ali")!.atama).toBe("havuz");
    // Gün içinde yeniden çekiş: sabahki otomatik seçim (Nizam 2 pk) korunmaz, elle seçim korunur
    const sabah = varsayilanAtama([kur("Nizam", 2), kur("Mustafa", 0)]);
    expect(sabah.find(k => k.ad === "Nizam")!.atama).toBe("s1");
    const aksam = atamaBirlestir([kur("Nizam", 2), kur("Mustafa", 33), kur("Yahya", 26)], { kuryeler: sabah });
    expect(aksam.find(k => k.ad === "Mustafa")!.atama).toBe("s1");
    expect(aksam.find(k => k.ad === "Yahya")!.atama).toBe("s2");
    expect(aksam.find(k => k.ad === "Nizam")!.atama).toBe("havuz");
    const elleli = atamaBirlestir([kur("Nizam", 2), kur("Mustafa", 33), kur("Yahya", 26)],
      { kuryeler: [{ ...kur("Nizam", 2), atama: "s2", elle: true }] });
    expect(elleli.find(k => k.ad === "Nizam")).toMatchObject({ atama: "s2", elle: true });
    expect(elleli.find(k => k.ad === "Mustafa")!.atama).toBe("s1");
    expect(elleli.find(k => k.ad === "Yahya")!.atama).toBe("havuz");
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
    // Fiş Tarandı'nın MagicPay'de karşılığı yok → eşleşmeyen 1
    const k = paketKontrolu(g, { kebo_ys: 10, alo: 5, kir_migros: 2 });
    expect(k).toMatchObject({ roket: 18, bizde: 17, kirMigros: 2, fark: 1, rokettenEk: 1, eslesmeyenFis: 1, fisEslesme: [] });
    expect(k.farkliKanallar).toEqual([]);
    // MagicPay'de Alo 1 fazla → Fiş Tarandı aslında Alo Paket siparişi; fark yok
    const k2 = paketKontrolu(g, { kebo_ys: 10, alo: 6, kir_migros: 2 });
    expect(k2).toMatchObject({ fark: 0, eslesmeyenFis: 0, fisEslesme: [{ kanal: "alo", adet: 1 }] });
    expect(k2.farkliKanallar).toEqual([]);
    // gerçek fark: kebo_ys eksik, kir_migros girilmemiş
    const k3 = paketKontrolu(g, { kebo_ys: 9, alo: 5 });
    expect(k3.fark).toBe(4);
    expect(k3.farkliKanallar.map(s => s.kanal)).toEqual(["kebo_ys", "kir_migros"]);
  });
});
