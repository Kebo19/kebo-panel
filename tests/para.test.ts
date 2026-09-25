import { describe, it, expect } from "vitest";
import { tv, paraGirdisi, paraYaz } from "@/lib/para";

describe("para girişi", () => {
  it("kuruş girilebilir", () => {
    expect(paraGirdisi("1234")).toBe("1.234");
    expect(paraGirdisi("1234,")).toBe("1.234,");
    expect(paraGirdisi("1234,5")).toBe("1.234,5");
    expect(paraGirdisi("1234,567")).toBe("1.234,56");
    expect(paraGirdisi("1.234,50")).toBe("1.234,50");
    expect(paraGirdisi(",5")).toBe("0,5");
    expect(paraGirdisi("")).toBe("");
  });
  it("metin → sayı", () => {
    expect(tv("1.234,50")).toBe(1234.5);
    expect(tv("12")).toBe(12);
    expect(tv("")).toBe(0);
    expect(tv(15.25)).toBe(15.25);
  });
  it("kayıtlı değer kuruşu kaybetmeden forma yüklenir", () => {
    expect(paraYaz(1234.5)).toBe("1.234,5");
    expect(tv(paraYaz(1234.56))).toBe(1234.56);
    expect(paraYaz(0)).toBe("");
  });
});
