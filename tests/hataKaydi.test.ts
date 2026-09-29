import { describe, it, expect, beforeEach } from "vitest";
import { mesajKisalt, yakinZamandaGonderildi, hataSinirlamasiniSifirla, MAKS_MESAJ } from "@/lib/hataKaydi";
import { islemOzeti, hassasMaskele, degisenAlanlar, zamanMetni, tabloAdi } from "@/lib/islemGecmisi";

describe("hata kaydı", () => {
  beforeEach(() => hataSinirlamasiniSifirla());

  it("mesaj 500 karakterle sınırlanır ve tek satıra iner", () => {
    const m = mesajKisalt("a\n  b " + "x".repeat(1000));
    expect(m.length).toBe(MAKS_MESAJ);
    expect(m.startsWith("a b x")).toBe(true);
    expect(mesajKisalt(new Error("patladı"))).toBe("patladı");
    expect(mesajKisalt("")).toBe("Bilinmeyen hata");
  });

  it("aynı mesaj 1 dakika içinde tekrar gönderilmez", () => {
    expect(yakinZamandaGonderildi("x", 1000)).toBe(false);
    expect(yakinZamandaGonderildi("x", 30_000)).toBe(true);
    expect(yakinZamandaGonderildi("y", 30_000)).toBe(false);
    expect(yakinZamandaGonderildi("x", 61_001)).toBe(false);
  });
});

describe("işlem geçmişi özeti", () => {
  it("güncellemede ilk 3 alan, hassas alanlar maskeli", () => {
    const o = islemOzeti("guncelleme",
      { isim: "Ali", tc_kimlik: "12345678901", iban: "TR1", maas: 100, departman: "Mutfak", updated_at: "a" },
      { isim: "Veli", tc_kimlik: "10987654321", iban: "TR2", maas: 200, departman: "Salon", updated_at: "b" });
    expect(o).toContain("isim: Ali → Veli");
    expect(o).toContain("tc_kimlik: **** → ****");
    expect(o).not.toContain("12345678901");
    expect(o).toContain("(+2 alan)");
  });
  it("değişen alan yoksa", () => {
    expect(islemOzeti("guncelleme", { a: 1 }, { a: 1 })).toBe("Değişiklik yok");
    expect(degisenAlanlar({ a: 1, b: null }, { a: 2 })).toEqual(["a"]);
  });
  it("ekleme/silme özeti", () => {
    expect(islemOzeti("ekleme", null, { unvan: "Metro", toplam_tutar: 500 })).toBe("Metro · Tutar: 500");
    expect(islemOzeti("silme", { isim: "Ayşe" }, null)).toBe("Ayşe");
  });
  it("tam JSON maskeleme", () => {
    expect(hassasMaskele({ iban: "TR12", alt: { tc_kimlik: "1" }, x: 1 })).toEqual({ iban: "****", alt: { tc_kimlik: "****" }, x: 1 });
  });
  it("zaman ve tablo adı", () => {
    expect(zamanMetni("2026-09-29T10:05:00Z")).toBe("29.09.2026 13:05");
    expect(tabloAdi("personel_hassas")).toBe("Personel kimlik/IBAN");
    expect(tabloAdi("bilinmeyen")).toBe("bilinmeyen");
  });
});
