import { describe, it, expect } from "vitest";
import { cariBorcu, tariheKadarOdenecek, odemeKaydiAlanlari } from "@/lib/cari";

describe("cari bakiye", () => {
  it("borç = faturalar − ödemeler", () => {
    expect(cariBorcu([{ toplam_tutar: 100 }, { toplam_tutar: "50.5" }], [{ tutar: 30 }, { tutar: -10 }])).toBe(130.5);
  });
  it("döneme kadar ödenecek: kısmi ödenmiş kısım en eski açık faturadan düşer", () => {
    const f = [
      { fatura_tarihi: "2026-01-01", toplam_tutar: 100, durum: "odendi" },
      { fatura_tarihi: "2026-01-10", toplam_tutar: 100, durum: "bekliyor" },
      { fatura_tarihi: "2026-01-20", toplam_tutar: 100, durum: "bekliyor" },
    ];
    expect(tariheKadarOdenecek(f, 150, "2026-01-15")).toBe(50);   // 10.01'in 50'si ödenmiş
    expect(tariheKadarOdenecek(f, 150, "2026-01-31")).toBe(150);
    expect(tariheKadarOdenecek(f, -20, "2026-01-31")).toBe(0);
  });
  it("ödeme yöntemi alanları", () => {
    expect(odemeKaydiAlanlari("Enpara")).toEqual({ odeme_yontemi: "Banka (Enpara)", hesap: "Enpara" });
    expect(odemeKaydiAlanlari("Hakedişten Mahsup")).toEqual({ odeme_yontemi: "Hakedişten Mahsup", hesap: null });
    expect(odemeKaydiAlanlari("Nakit")).toEqual({ odeme_yontemi: "Nakit", hesap: "Nakit" });
  });
});
