import { describe, it, expect } from "vitest";
import { kullanimAnalizi, ortalamaKullanim, stokDurumu, siparisPlani, cikisOzeti, haftaGunuOrtalamalari, type StokHareketi } from "@/lib/stok";

const h = (tarih: string, tip: string, miktar: number, extra: Partial<StokHareketi> = {}, saat = "09"): StokHareketi =>
  ({ urun_id: "tavuk", tarih, tip, miktar, created_at: `${tarih}T${saat}:00:00Z`, ...extra });

describe("kullanım — kullanıcının örneği", () => {
  // 20'si 100 kg, 21'i 80 kg, 22'si sayılmadı, 23'ü 50 kg
  const hareketler = [h("2026-09-20", "sayim", 100), h("2026-09-21", "sayim", 80), h("2026-09-23", "sayim", 50)];
  const a = kullanimAnalizi(hareketler, "tavuk");

  it("20'sinin kullanımı 20 kg", () => {
    expect(a.gunler.find(g => g.tarih === "2026-09-20")).toEqual({ tarih: "2026-09-20", kullanim: 20, tahmini: false });
  });
  it("21 ve 22 için günde 15 kg (tahmini)", () => {
    expect(a.gunler.filter(g => g.tarih === "2026-09-21" || g.tarih === "2026-09-22"))
      .toEqual([{ tarih: "2026-09-21", kullanim: 15, tahmini: true }, { tarih: "2026-09-22", kullanim: 15, tahmini: true }]);
  });
  it("son 7 günlük ortalama verisi olan günlerden", () => {
    const o = ortalamaKullanim(a, 7, "2026-09-24");
    expect(o.veriGunu).toBe(3);
    expect(o.ortalama).toBeCloseTo((20 + 15 + 15) / 3);
  });
});

describe("mal girişi ve fire", () => {
  const hareketler = [
    h("2026-09-20", "sayim", 100),
    h("2026-09-20", "giris", 50, {}, "12"),             // sayımdan sonra gelen mal
    h("2026-09-20", "cikis", 5, { neden: "skt" }, "13"), // SKT geçti, atıldı
    h("2026-09-21", "sayim", 120),
  ];
  it("gelen mal eklenir, fire kullanım sayılmaz", () => {
    // 100 + 50 − 5 − 120 = 25 kg kullanım
    expect(kullanimAnalizi(hareketler, "tavuk").gunler[0].kullanim).toBe(25);
  });
  it("fire ayrıca raporlanır", () => {
    const o = cikisOzeti(hareketler, "tavuk", "2026-09-01", "2026-09-30", 200);
    expect(o).toMatchObject({ fire: 5, iade: 0, fireTutar: 1000 });
  });
  it("sayım artmış ama giriş yoksa tutarsız aralık olarak işaretlenir, ortalamaya girmez", () => {
    const a = kullanimAnalizi([h("2026-09-20", "sayim", 50), h("2026-09-21", "sayim", 70)], "tavuk");
    expect(a.gunler).toHaveLength(0);
    expect(a.tutarsizAraliklar[0].fark).toBe(20);
  });
});

describe("tahmini stok ve sipariş", () => {
  const hareketler = [
    h("2026-09-20", "sayim", 100), h("2026-09-21", "sayim", 80), h("2026-09-23", "sayim", 50),
    h("2026-09-24", "giris", 40),
  ];
  const d = stokDurumu(hareketler, "tavuk", "2026-09-25");
  it("son sayım + giriş − ortalama × geçen gün", () => {
    // ort = 50/3 ≈ 16,67; 23'ünden bugüne 2 gün → 50 + 40 − 33,33 = 56,67
    expect(d.sonSayimTarih).toBe("2026-09-23");
    expect(d.tahminiMevcut).toBeCloseTo(50 + 40 - (50 / 3) * 2);
    expect(d.kalanGun).toBe(3);
  });
});

describe("sayım saati (sabah / akşam)", () => {
  it("20 akşam ile 21 sabah aynı an: arada kullanım yok, en son girilen geçerli", () => {
    const a = kullanimAnalizi([
      h("2026-09-20", "sayim", 100, { vakit: "sabah" }),
      h("2026-09-20", "sayim", 70, { vakit: "aksam" }, "22"),
      h("2026-09-21", "sayim", 68, { vakit: "sabah" }, "08"),
    ], "tavuk");
    // 20 sabah → 20 akşam = 1 gün (20'si) → 100 − 68 = 32 (akşam 70 yerine sabah 68 geçerli)
    expect(a.gunler).toEqual([{ tarih: "2026-09-20", kullanim: 32, tahmini: false }]);
  });
  it("akşam sayımından önce gelen mal o günün kullanımına girer", () => {
    const a = kullanimAnalizi([
      h("2026-09-20", "sayim", 100, { vakit: "sabah" }),
      h("2026-09-20", "giris", 40, {}, "23"),   // geç girilmiş olsa da gün içi sayılır
      h("2026-09-20", "sayim", 110, { vakit: "aksam" }, "22"),
    ], "tavuk");
    expect(a.gunler[0].kullanim).toBe(30);
  });
});

describe("haftanın günlerine göre tahmin ve sipariş", () => {
  // 4 hafta: hafta içi 10 kg, cumartesi 30 kg (her gün sabah sayım, her sabah 100'e tamamlanıyor)
  const hareketler: StokHareketi[] = [];
  for (let i = 0; i < 29; i++) {
    const gun = new Date(Date.UTC(2026, 7, 28 + i));                 // 28.08 → 25.09
    const t = gun.toISOString().slice(0, 10);
    hareketler.push(h(t, "sayim", 100, { vakit: "sabah" }, "06"));
    // Gün içinde o günün kullanımı kadar mal gelir → ertesi sabah yine 100
    if (i < 28) hareketler.push(h(t, "giris", gun.getUTCDay() === 6 ? 30 : 10, {}, "12"));
  }
  const a = kullanimAnalizi(hareketler, "tavuk");
  it("cumartesi ortalaması ayrı hesaplanır", () => {
    const g = haftaGunuOrtalamalari(a, "2026-09-25");
    expect(g[6]).toBe(30);
    expect(g[3]).toBe(10);
  });
  it("salı siparişi, 7 günde teslim: bir sonraki teslime kadar (14 gün) ihtiyaç", () => {
    const d = stokDurumu(hareketler, "tavuk", "2026-09-29", "gun"); // Salı
    const p = siparisPlani(d, { siparisGunu: 2, teslimGun: 7 }, 20, "2026-09-29");
    expect(p.siparisTarihi).toBe("2026-09-29");
    expect(p.varisTarihi).toBe("2026-10-06");
    expect(p.sonrakiVaris).toBe("2026-10-13");
    // 14 gün: 12 hafta içi/pazar günü × 10 + 2 cumartesi × 30 = 180
    expect(p.ihtiyac).toBeCloseTo(180);
    expect(p.oneri).toBeCloseTo(180 + 20 - d.tahminiMevcut);
  });
  it("yoldaki mal (irsaliye) öneriden düşülür", () => {
    const d = stokDurumu(hareketler, "tavuk", "2026-09-29", "gun");
    const p = siparisPlani(d, { siparisGunu: 2, teslimGun: 7 }, 20, "2026-09-29", [{ miktar: 50, beklenen_tarih: "2026-09-29" }]);
    expect(p.yolda).toBe(50);
    expect(p.oneri).toBeCloseTo(180 + 20 - d.tahminiMevcut - 50);
  });
});
