import { describe, it, expect } from "vitest";
import {
  mpGunCoz, kanalBul, masaOdemeKalemi, paketOdemeTuru, gunuKarsilastir, magicpayGorebilirMi,
  mpIndirimAlanlari, indirimFarkliAlanlar,
  type PanelRaporu,
} from "@/lib/magicpay";
import { menuGorunurMu, MENU } from "@/lib/menu";

// 01.10.2026 Çorum, MagicPay /reports/turnover/daily cevabından (kısaltılmış)
const HAM = {
  day: "2026-10-01", turnover_total: "50005.29", gross_turnover: "56579.24", net_turnover: "50005.29",
  discount_amount: "6573.95", orders_total: 128, orders_masa: 65, orders_paket: 63,
  turnover_masa_total: "21924.74", turnover_paket_total: "28080.55", refund_total: "0", cancel_total: "0",
  payment_masa_breakdown: { cash: "6244.89", card: "15629.86", ticket_restaurant: "49.99" },
  payment_paket_breakdown: {
    YEMEKSEPETI_CARD: "8116.05", TRENDYOL_CARD: "12950.50", "kredi kartı": "826.00", "NAKİT": "1297.00",
    TRENDYOL_ON_DELIVERY: "758.00", TRENDYOL_EDENRED: "513.00", POS: "1941.00", "KREDİ KARTI": "1042.00",
    TRENDYOL_PLUXEE: "289.00", cash: "348.00",
  },
  online_source_breakdown: {
    a: { brand_name: "Çorum kebo yemeksepeti", platform_key: "yemeksepeti", integration_code: "YEMEKSEPETI", label: "Yemeksepeti / Çorum kebo yemeksepeti", orders: 13, gross_turnover: "7132.00", discount_amount: "1006.10", net_turnover: "6125.90" },
    b: { brand_name: "Çorum Chickn Yemeksepeti", platform_key: "yemeksepeti", integration_code: "YEMEKSEPETI", label: "Yemeksepeti / Çorum Chickn Yemeksepeti", orders: 5, gross_turnover: "2857.00", discount_amount: "866.85", net_turnover: "1990.15" },
    c: { brand_name: "CHİKN", platform_key: "trendyol", integration_code: "TRENDYOL_GO", label: "Trendyol / CHİKN", orders: 2, gross_turnover: "1496.00", discount_amount: "0.00", net_turnover: "1496.00" },
    d: { brand_name: null, platform_key: "local", integration_code: "LOCAL", label: "LOCAL / local-15", orders: 10, gross_turnover: "5454.00", discount_amount: "0.00", net_turnover: "5454.00" },
    e: { brand_name: "KEBO", platform_key: "trendyol", integration_code: "TRENDYOL_GO", label: "Trendyol / KEBO", orders: 33, gross_turnover: "17715.50", discount_amount: "4701.00", net_turnover: "13014.50" },
  },
};

const MP = mpGunCoz(HAM);

/** MagicPay ile birebir tutan bir kasa raporu */
const RAPOR: PanelRaporu = {
  tarih: "2026-10-01",
  os_kebo_ys: 7132, os_kebo_ys_paket: 13, os_kebo_ys_indirim: 1006.1,
  os_cnf_ys: 2857, os_cnf_ys_paket: 5, os_cnf_ys_indirim: 866.85,
  os_cnf_trendyol: 1496, os_cnf_trendyol_paket: 2,
  os_kebo_trendyol: 16957.5, os_kebo_trendyol_paket: 32, os_kebo_trendyol_indirim: 4701,
  ko_kebo_trendyol: 758, ko_kebo_trendyol_paket: 1,
  ko_kebo_alo: 5454, ko_kebo_alo_paket: 10,
  kasa_nakit: 5244.89, gunluk_gider: 1000, kasa_pos: 15629.86, kasa_edenred: 49.99,
  iade_tutar: 0,
  kurye_raporlari: [
    { isim: "Kurye 1", tip: "sabit", nakit: "1.645", pos: "3.809", paketSayisi: "10" },
  ],
};

const satirBul = (k: ReturnType<typeof gunuKarsilastir>, bolum: string, ad: string) =>
  k.bolumler.find(b => b.baslik.startsWith(bolum))!.satirlar.find(s => s.ad === ad)!;

describe("MagicPay erişimi", () => {
  it("sadece Murat görebilir", () => {
    expect(magicpayGorebilirMi("c4d199e9-e0b7-4d33-8ad8-556f7d488bac")).toBe(true);
    expect(magicpayGorebilirMi("e75d458f-1c36-405a-bd56-3c590c28cd54")).toBe(true); // Bülent
    expect(magicpayGorebilirMi("08e2388a-f033-4255-aebc-f976d6eac338")).toBe(false); // Bekir (Tam Yetkili)
    expect(magicpayGorebilirMi("")).toBe(false);
    expect(magicpayGorebilirMi(null)).toBe(false);
  });
  it("menü öğesi Tam Yetkili'ye bile görünmez", () => {
    const oge = MENU.ust.find(m => m.href === "/magicpay")!;
    const tamYetkili = { tamYetkili: true, izin: () => true };
    expect(menuGorunurMu(oge, { ...tamYetkili, userId: "e75d458f-1c36-405a-bd56-3c590c28cd54" })).toBe(true); // Bülent
    expect(menuGorunurMu(oge, { ...tamYetkili, userId: "08e2388a-f033-4255-aebc-f976d6eac338" })).toBe(false); // Bekir
    expect(menuGorunurMu(oge, { ...tamYetkili, userId: "c4d199e9-e0b7-4d33-8ad8-556f7d488bac" })).toBe(true);
  });
  it("anasayfa kısayolları kaymadı", () => {
    expect([MENU.ust[1], MENU.finans[0], MENU.ust[2], MENU.ust[6]].map(m => m.href))
      .toEqual(["/raporlar", "/kasa", "/rapor-analiz", "/personel"]);
  });
});

describe("eşleştirme kuralları", () => {
  it("kanallar: marka adına göre Kebo/CNF, LOCAL = Alo Paket", () => {
    expect(kanalBul({ platform: "yemeksepeti", marka: "Çorum kebo yemeksepeti" })).toBe("kebo_ys");
    expect(kanalBul({ platform: "yemeksepeti", marka: "Çorum Chickn Yemeksepeti" })).toBe("cnf_ys");
    expect(kanalBul({ platform: "trendyol", marka: "CHİKN" })).toBe("cnf_trendyol");
    expect(kanalBul({ platform: "trendyol", marka: "KEBO" })).toBe("kebo_trendyol");
    expect(kanalBul({ platform: "migros", marka: "Çorum Migros" })).toBe("kebo_migros");
    expect(kanalBul({ platform: "local", marka: null })).toBe("alo");
    expect(kanalBul({ platform: "getir", marka: null })).toBe("diger");
  });
  it("masa ödemeleri", () => {
    expect(masaOdemeKalemi("cash")).toBe("nakit");
    expect(masaOdemeKalemi("card")).toBe("pos");
    expect(masaOdemeKalemi("ticket_restaurant")).toBe("kasa_edenred");
    expect(masaOdemeKalemi("metropol")).toBe("kasa_metropol");
    expect(masaOdemeKalemi("unknown_meal_card")).toBe("yemek_tanimsiz");
  });
  it("paket ödemeleri: personelin serbest yazdığı adlar", () => {
    for (const k of ["NAKİT", "naKİT", "cash", "KAPIDA NAKİT"]) expect(paketOdemeTuru(k)).toBe("kapida_nakit");
    for (const k of ["KREDİ KARTI", "kredi kartı", "KRDİ KART", "KREDİ", "kart", "KART", "POS", "Pos", "card"]) expect(paketOdemeTuru(k)).toBe("kapida_kart");
    for (const k of ["yemek kartı kapıda ödeme", "Ticket yemek kartı", "unknown_meal_card"]) expect(paketOdemeTuru(k)).toBe("kapida_yemek");
    for (const k of ["YEMEKSEPETI_CARD", "TRENDYOL_CARD", "TRENDYOL_EDENRED", "MIGROS_MONEY_PAY", "YEMEKSEPETI_PLUXEE"]) expect(paketOdemeTuru(k)).toBe("online");
    expect(paketOdemeTuru("TRENDYOL_ON_DELIVERY")).toBe("kapida_platform");
    expect(paketOdemeTuru("MIGROS_CREDIT_CARD_ON_DELIVERY")).toBe("kapida_platform");
    expect(paketOdemeTuru("unknown")).toBe("bilinmiyor");
  });
});

describe("gunuKarsilastir", () => {
  it("tutan rapor: hiç fark yok", () => {
    const k = gunuKarsilastir(MP, RAPOR);
    const farklar = k.bolumler.flatMap(b => b.satirlar.filter(s => s.durum === "fark").map(s => `${b.baslik} / ${s.ad}: ${s.fark}`));
    expect(farklar).toEqual([]);
    expect(satirBul(k, "Paket sayıları", "Toplam paket").panel).toBe(63);
    expect(satirBul(k, "Paket sayıları", "Alo Paket (LOCAL)").mp).toBe(10);
    expect(satirBul(k, "Kasa", "Nakit").mp).toBeCloseTo(6244.89);
    expect(satirBul(k, "Paket ödemeleri", "Kapıda nakit").mp).toBeCloseTo(1645);
    expect(satirBul(k, "Paket ödemeleri", "Kapıda kart / POS").mp).toBeCloseTo(3809);
  });

  it("eksik paket ve fazla nakit yakalanır", () => {
    const k = gunuKarsilastir(MP, { ...RAPOR, os_kebo_trendyol_paket: 30, kasa_nakit: 5400 });
    const ty = satirBul(k, "Paket sayıları", "Kebo · Trendyol");
    expect(ty.durum).toBe("fark");
    expect(ty.fark).toBe(-2);
    const nakit = satirBul(k, "Kasa", "Nakit");
    expect(nakit.durum).toBe("fark");
    expect(nakit.fark).toBeCloseTo(155.11);
    expect(k.farkSayisi).toBe(4); // kanal paketi + toplam paket + nakit + kasa toplamı
  });

  it("₺1'e kadar kuruş farkı yok sayılır", () => {
    const k = gunuKarsilastir(MP, { ...RAPOR, kasa_pos: 15630 });
    expect(satirBul(k, "Kasa", "POS / Kredi kartı").durum).toBe("ok");
  });

  it("rapor girilmemiş gün", () => {
    const k = gunuKarsilastir(MP, null);
    expect(k.raporVar).toBe(false);
    expect(k.farkSayisi).toBe(0);
    expect(satirBul(k, "Paket sayıları", "Kebo · Yemeksepeti").durum).toBe("yok");
  });

  it("kanalı olmayan paket siparişleri belirtilir", () => {
    const k = gunuKarsilastir({ ...MP, siparisPaket: 75 }, RAPOR);
    expect(satirBul(k, "Paket sayıları", "Toplam paket").aciklama).toContain("12 paket");
  });
});

describe("tanımsız yemek kartı", () => {
  it("kart kart fark yerine toplam denetlenir", () => {
    const mp = mpGunCoz({ ...HAM, payment_masa_breakdown: { ...HAM.payment_masa_breakdown, unknown_meal_card: "120" } });
    const k = gunuKarsilastir(mp, { ...RAPOR, kasa_edenred: 169.99 });
    expect(satirBul(k, "Kasa", "Edenred (Ticket)").durum).toBe("bilgi");
    expect(satirBul(k, "Kasa", "Yemek kartları toplamı").durum).toBe("ok");
    expect(k.farkSayisi).toBe(0);
  });
});

describe("MagicPay indirimleri → Kasa Raporu", () => {
  it("kanal indirimlerini panel alanlarına yazar", () => {
    const m = mpIndirimAlanlari(MP);
    expect(m.os_kebo_ys_indirim).toBe(1006.1);
    expect(m.os_cnf_ys_indirim).toBe(866.85);
    expect(m.os_kebo_trendyol_indirim).toBe(4701);
    expect(m.os_cnf_trendyol_indirim).toBe(0);
    expect(m.os_kebo_alo_indirim).toBe(0);
    expect(Object.keys(m)).toHaveLength(7);
  });
  it("veri yoksa hepsi 0", () => {
    expect(Object.values(mpIndirimAlanlari(null)).every(v => v === 0)).toBe(true);
  });
  it("elle değiştirilen alanları bulur, kuruş farkını yok sayar", () => {
    const m = mpIndirimAlanlari(MP);
    expect(indirimFarkliAlanlar(m, { ...m })).toEqual([]);
    expect(indirimFarkliAlanlar(m, { ...m, os_kebo_ys_indirim: 1006.105 })).toEqual([]);
    expect(indirimFarkliAlanlar(m, { ...m, os_kebo_ys_indirim: 900 })).toEqual(["os_kebo_ys_indirim"]);
    expect(indirimFarkliAlanlar(m, { ...m, ko_cnf_ys_indirim: 50 })).toEqual(["ko_cnf_ys_indirim"]);
  });
});
