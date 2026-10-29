import { describe, it, expect } from "vitest";
import { esitPaylas, bankoCalisanlari } from "../lib/kasaAcigi";

describe("kasa açığı kesintisi", () => {
  it("eşit paylaştırır, kuruş kaybolmaz", () => {
    expect(esitPaylas(396, 2)).toEqual([198, 198]);
    expect(esitPaylas(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(esitPaylas(100, 3).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(esitPaylas(50, 0)).toEqual([]);
  });
  it("sadece bugün çalışan banko personeli", () => {
    const p = [{ id: "1", isim: "Ayşe", departman: "Banko" }, { id: "2", isim: "Ali", departman: "Mutfak" }, { id: "3", isim: "Can", departman: "banko" }];
    const durum = (id: string) => (id === "3" ? "izin" : "calisti");
    expect(bankoCalisanlari(p, durum).map(x => x.isim)).toEqual(["Ayşe"]);
  });
});
