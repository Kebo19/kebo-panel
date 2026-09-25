import { describe, it, expect } from "vitest";
import { istanbulTarihi, gunEkle, gunFarki, aySonu } from "@/lib/tarih";
import { buAyinOdemeDonemi } from "@/lib/cari";

describe("tarih", () => {
  it("İstanbul'da gece 01:00 hâlâ aynı gün (UTC bir önceki gün)", () => {
    // 2026-09-25 01:00 İstanbul = 2026-09-24 22:00 UTC
    expect(istanbulTarihi(new Date("2026-09-24T22:00:00Z"))).toBe("2026-09-25");
  });
  it("gün ekleme / fark / ay sonu", () => {
    expect(gunEkle("2026-02-28", 1)).toBe("2026-03-01");
    expect(gunFarki("2026-08-13", "2026-08-20")).toBe(7);
    expect(aySonu("2026", "02")).toBe("2026-02-28");
  });
});

describe("cari ödeme dönemi", () => {
  it("25'inden önce: bu ayın dönemi", () => {
    const d = buAyinOdemeDonemi("2026-09-10");
    expect([d.donemBas, d.donemBit]).toEqual(["2026-08-16", "2026-09-15"]);
  });
  it("ödeme günü geçtiyse bir sonraki dönem", () => {
    const d = buAyinOdemeDonemi("2026-09-28");
    expect([d.donemBas, d.donemBit]).toEqual(["2026-09-16", "2026-10-15"]);
  });
  it("aralık → ocak geçişi", () => {
    const d = buAyinOdemeDonemi("2026-12-30");
    expect([d.donemBas, d.donemBit]).toEqual(["2026-12-16", "2027-01-15"]);
  });
});

