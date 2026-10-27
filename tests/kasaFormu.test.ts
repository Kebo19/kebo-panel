import { describe, it, expect } from "vitest";
import { grupUrunleri, listedeMi, kagitBelgesi } from "@/lib/kasaFormu";

const u = (id: string, p: string, sira: number, yer: string | null = null) =>
  ({ id, urun_adi: id.toUpperCase(), birim: "kg", kategori: null, sayim_periyodu: p, sira_no: sira, sayim_yeri: yer });

describe("sayım listeleri", () => {
  const liste = [u("doner", "gunluk", 1), u("sos", "haftalik", 2), u("kutu", "aylik", 3), u("pc", "envanter", 4), u("eski", "", 5)];

  it("listeler birikimli: haftalık = günlük + haftalık, aylık = üçü; envanter ayrı", () => {
    expect(grupUrunleri(liste, "gunluk").map(x => x.id)).toEqual(["doner", "eski"]);
    expect(grupUrunleri(liste, "haftalik").map(x => x.id)).toEqual(["doner", "sos", "eski"]);
    expect(grupUrunleri(liste, "aylik").map(x => x.id)).toEqual(["doner", "sos", "kutu", "eski"]);
    expect(grupUrunleri(liste, "envanter").map(x => x.id)).toEqual(["pc"]);
    expect(listedeMi("aylik", "envanter")).toBe(false);
  });

  it("sayım yeri girilmişse yere göre gruplanır, numaralar kağıttaki sırayla", () => {
    const l = [u("a", "gunluk", 1, "Dondurucu"), u("b", "gunluk", 2, "Kuru depo"), u("c", "gunluk", 3, "Dondurucu"), u("d", "gunluk", 4)];
    const g = grupUrunleri(l, "gunluk");
    expect(g.map(x => `${x.no}${x.id}`)).toEqual(["1a", "2c", "3b", "4d"]);
    const html = kagitBelgesi(g, "gunluk", false);
    expect(html.indexOf("Dondurucu")).toBeLessThan(html.indexOf("Kuru depo"));
    expect(html).toContain("Diğer");
  });

  it("envanter kağıdında sabah/akşam yerine 'Sayılan' sütunu var", () => {
    const html = kagitBelgesi(grupUrunleri(liste, "envanter"), "envanter", false);
    expect(html).toContain("Sayılan");
    expect(html).not.toContain("Sabah sayım");
  });
});
