import { describe, it, expect } from "vitest";
import { eksikGunler, gunAraligiYaz, raporUyarilari } from "@/lib/raporKontrol";
import { roadrunnerGunOzeti, type RaporVerisi } from "@/lib/hesap";

const r = (tarih: string, kasa: number, gider: number, paket: number) =>
  ({ tarih, kasa_nakit: kasa, kasa_pos: 0, gunluk_gider: gider, iade_tutar: 0,
     kurye_raporlari: paket ? [{ isim: "A", paketSayisi: String(paket), nakit: "", pos: "" }] : [] } as unknown as RaporVerisi);

describe("eksik günler", () => {
  it("bugüne kadar raporu olmayan günler, bugün hariç", () => {
    const e = eksikGunler(["2026-10-01", "2026-10-02", "2026-10-05"], "2026-10", "2026-10-07");
    expect(e).toEqual(["2026-10-03", "2026-10-04", "2026-10-06"]);
  });
  it("geçmiş ayda ayın sonuna kadar", () => {
    expect(eksikGunler([], "2026-09", "2026-10-31").length).toBe(30);
  });
  it("aralık yazımı", () => {
    expect(gunAraligiYaz(["2026-10-06", "2026-10-07", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-25"])).toBe("6-7, 17-19, 25");
  });
});

describe("rapor uyarıları", () => {
  it("kopya ve paketsiz raporu bulur", () => {
    const u = raporUyarilari([r("2026-10-08", 74471, 287, 76), r("2026-10-09", 74471, 287, 76), r("2026-10-13", 71000, 662, 0), r("2026-10-10", 91000, 0, 106)]);
    expect(u.get("2026-10-09")).toEqual(["08.10 raporunun kopyası görünüyor"]);
    expect(u.get("2026-10-13")).toEqual(["paket girilmemiş"]);
    expect(u.has("2026-10-08")).toBe(false);
    expect(u.has("2026-10-10")).toBe(false);
  });
});

describe("roadrunnerGunOzeti", () => {
  it("sabite 30 garanti, havuz olduğu gibi; havuz parası Roadrunner'da", () => {
    const o = roadrunnerGunOzeti({ tarih: "2026-10-29", kurye_raporlari: [
      { isim: "A", tip: "sabit", paketSayisi: "33", nakit: "1000", pos: "500" },
      { isim: "B", tip: "sabit", paketSayisi: "12", nakit: "200", pos: "" },
      { isim: "Havuz", tip: "havuz", paketSayisi: "40", nakit: "3000", pos: "700" },
      { isim: "", tip: "sabit", paketSayisi: "", nakit: "", pos: "" },
    ] as never });
    expect(o.odenecekPaket).toBe(33 + 30 + 40);
    expect(o.havuzNakit).toBe(3000);
    expect(o.havuzPos).toBe(700);
    expect(o.havuzTahsilat).toBe(3000 + 700 - 35);
  });
});
