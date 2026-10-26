import { describe, it, expect } from "vitest";
import { aramaKelimeleri, faturaEslesir } from "@/lib/faturaArama";

const f = {
  fatura_no: "KBE2026000008148", cari_unvan: "Kebo Restaurant Pazarlama", aciklama: "ÇORUM ÖZNİL",
  fatura_tarihi: "2026-10-12", vade_tarihi: "2026-10-27", toplam_tutar: 113790.04, tutar: 113790.04,
};
const ara = (q: string) => faturaEslesir(f, aramaKelimeleri(q));

describe("fatura arama", () => {
  it("boş arama her şeyi gösterir", () => expect(ara("  ")).toBe(true));
  it("fatura no ve ünvan, büyük/küçük ve Türkçe harf farkı yok", () => {
    expect(ara("kbe2026000008148")).toBe(true);
    expect(ara("8148")).toBe(true);
    expect(ara("kebo")).toBe(true);
    expect(ara("oznil")).toBe(true);
    expect(ara("corum")).toBe(true);
  });
  it("tutar her biçimde", () => {
    expect(ara("113.790,04")).toBe(true);
    expect(ara("113790,04")).toBe(true);
    expect(ara("113790")).toBe(true);
  });
  it("tarih", () => {
    expect(ara("12.10.2026")).toBe(true);
    expect(ara("12.10")).toBe(true);
    expect(ara("2026-10")).toBe(true);
    expect(ara("27.10")).toBe(true); // vade
  });
  it("birden fazla kelimenin hepsi eşleşmeli", () => {
    expect(ara("kebo 12.10")).toBe(true);
    expect(ara("kebo 13.10")).toBe(false);
    expect(ara("migros")).toBe(false);
  });
});
