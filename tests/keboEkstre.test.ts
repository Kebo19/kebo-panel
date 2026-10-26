import { describe, it, expect } from "vitest";
import { ekstreAyristir, mutabakatPlani, varsayilanOdemeBaslangici, trSayi, DUZELTME_ACIKLAMA, keboVade, sonrakiCuma, keboVadeOzeti, type PdfParca } from "@/lib/keboEkstre";

// Kebo PDF'indeki kolon düzenini taklit eden sahte sayfa: sayılar sağa yaslı (x + w = kolon sağ kenarı)
const BASLIK: PdfParca[] = [
  ["Tarih", 25, 17], ["Evrak No", 73, 31], ["Evrak Türü", 138, 37], ["Açıklama", 196, 33],
  ["Borç", 376, 16], ["Alacak", 427, 24], ["Bakiye", 486, 24], ["B/A", 515, 13], ["Vade Tarihi", 535, 39],
].map(([str, x, w]) => ({ str: str as string, x: x as number, y: 730, w: w as number }));
let y = 717;
function satir(tarih: string, no: string, tur: string, acik: string, borc: string, alacak: string, bakiye: string): PdfParca[] {
  y -= 12;
  const p: PdfParca[] = [{ str: tarih, x: 17, y, w: 37 }, { str: no, x: 69, y, w: 42 }, { str: tur, x: 138, y, w: 44 }];
  if (acik) p.push({ str: acik, x: 196, y, w: 60 });
  if (borc) p.push({ str: borc, x: 392 - 37, y, w: 37 });
  if (alacak) p.push({ str: alacak, x: 451 - 37, y, w: 37 });
  p.push({ str: bakiye, x: 510 - 37, y, w: 37 }, { str: "B", x: 519, y, w: 5 }, { str: tarih, x: 538, y, w: 37 });
  return p;
}
function sayfa() {
  y = 717;
  return [{ parcalar: [
    ...BASLIK,
    ...satir("01.01.2026", "0000000014", "Açılış Fişi", "2025 DEVREDEN", "100,00", "", "100,00"),
    ...satir("05.01.2026", "KBE2026000000016", "Satış Faturası", "", "1.000,00", "", "1.100,00"),
    ...satir("06.01.2026", "0000000001", "Gelen Havale", "", "", "600,00", "500,00"),
    ...satir("07.01.2026", "KBE2026000000020", "Satış Faturası", "ÇORUM", "300,00", "", "800,00"),
    ...satir("08.01.2026", "0000000238", "Cari Virman Fişi", "ÇORUM YEMEK SEPETİ", "", "50,00", "750,00"),
    { str: "Toplam Tutarlar :", x: 300, y: 100, w: 60 }, { str: "1.400,00", x: 355, y: 100, w: 37 },
    { str: "650,00", x: 414, y: 100, w: 37 }, { str: "750,00", x: 473, y: 100, w: 37 },
  ] }];
}

describe("Kebo ekstre ayrıştırma", () => {
  it("Türkçe sayıyı çevirir", () => expect(trSayi("1.234.567,89")).toBe(1234567.89));

  it("satırları kolonlara göre ayırır ve toplamları doğrular", () => {
    const r = ekstreAyristir(sayfa());
    expect(r.satirlar).toHaveLength(5);
    expect(r.uyarilar).toEqual([]);
    expect(r.sonBakiye).toBe(750);
    expect(r.satirlar.map(s => s.grup)).toEqual(["acilis", "fatura", "havale", "fatura", "virman"]);
    expect(r.satirlar[2]).toMatchObject({ borc: 0, alacak: 600, tarih: "2026-01-06" });
    expect(r.satirlar[3]).toMatchObject({ evrakNo: "KBE2026000000020", aciklama: "ÇORUM", borc: 300 });
  });

  it("evrak no ile türü tek parça gelirse ayırır", () => {
    const s = sayfa();
    const i = s[0].parcalar.findIndex(p => p.str === "0000000001");
    s[0].parcalar[i] = { ...s[0].parcalar[i], str: "0000000001 Kredi Kartı Tahsilatı" };
    s[0].parcalar = s[0].parcalar.filter(p => p.str !== "Gelen Havale");
    const r = ekstreAyristir(s);
    expect(r.satirlar[2]).toMatchObject({ evrakNo: "0000000001", evrakTuru: "Kredi Kartı Tahsilatı", grup: "kredi_karti" });
  });
});

describe("Kebo mutabakat planı", () => {
  const ekstre = ekstreAyristir(sayfa());
  const faturalar = [
    { id: "a", fatura_no: "KBE2026000000016", fatura_tarihi: "2026-01-05", toplam_tutar: 1000, durum: "bekliyor" },
  ];

  it("eksik faturayı ve yeni tahsilatları bulur, borcu ekstre bakiyesine eşitleyen düzeltmeyi hesaplar", () => {
    const p = mutabakatPlani(ekstre, faturalar, [], "0000-00-00");
    expect(p.yeniFaturalar.map(s => s.evrakNo)).toEqual(["KBE2026000000020"]);
    expect(p.yeniOdemeler.map(s => s.alacak)).toEqual([600, 50]);
    // Sistem: 1000 fatura. Eklemelerle 1000 + 300 − 650 = 650; ekstre 750 (açılış 100 sistemde yok) → düzeltme −100
    expect(p.mevcutBorc).toBe(1000);
    expect(p.eklemeSonrasiBorc).toBe(650);
    expect(p.duzeltme).toBe(-100);
  });
  it("aynı ekstre tekrar yüklenince değişiklik çıkmaz (önceki düzeltme hesaba katılır)", () => {
    const odemeler = [
      { id: "1", tarih: "2026-01-06", tutar: 600, aciklama: "Kebo ekstre · Gelen Havale · 2026-01-06|0000000001|600.00", fatura_idleri: null },
      { id: "2", tarih: "2026-01-08", tutar: 50, aciklama: "Kebo ekstre · Cari Virman Fişi · 2026-01-08|0000000238|50.00", fatura_idleri: null },
      { id: "3", tarih: "2026-01-08", tutar: -100, aciklama: DUZELTME_ACIKLAMA, fatura_idleri: [] },
    ];
    const f2 = [...faturalar, { id: "b", fatura_no: "KBE2026000000020", fatura_tarihi: "2026-01-07", toplam_tutar: 300, durum: "bekliyor" }];
    const p = mutabakatPlani(ekstre, f2, odemeler);
    expect(p.yeniFaturalar).toEqual([]); expect(p.yeniOdemeler).toEqual([]);
    expect(p.mevcutBorc).toBe(750); expect(p.duzeltme).toBe(-100);
  });

  it("başlangıç tarihinden önceki tahsilatları atlar, ekstre kayıtlarını tekrar eklemez", () => {
    const odemeler = [
      { id: "o1", tarih: "2026-01-06", tutar: 999, aciklama: "Manuel ödeme", fatura_idleri: null },
      { id: "o2", tarih: "2026-01-08", tutar: 50, aciklama: "Kebo ekstre · Cari Virman Fişi · 2026-01-08|0000000238|50.00", fatura_idleri: null },
      { id: "o3", tarih: "2026-01-08", tutar: 550, aciklama: DUZELTME_ACIKLAMA, fatura_idleri: [] },
    ];
    expect(varsayilanOdemeBaslangici(odemeler)).toBe("2026-01-08"); // ekstreden gelen ilk tahsilat → sabit başlangıç
    expect(varsayilanOdemeBaslangici([odemeler[0]])).toBe("2026-01-07");
    const p = mutabakatPlani(ekstre, faturalar, odemeler);
    expect(p.yeniOdemeler).toEqual([]);
    expect(p.atlananOdemeler.map(s => s.alacak)).toEqual([600]);
    expect(p.hedefBakiye).toBe(750);
  });
});

describe("Kebo vade", () => {
  it("vade yoksa fatura tarihi + 15 gün", () => {
    expect(keboVade({ fatura_tarihi: "2026-10-12" })).toBe("2026-10-27");
    expect(keboVade({ fatura_tarihi: "2026-10-12", vade_tarihi: "2026-10-20" })).toBe("2026-10-20");
  });
  it("sonraki cuma", () => {
    expect(sonrakiCuma("2026-10-26")).toBe("2026-10-30");
    expect(sonrakiCuma("2026-10-30")).toBe("2026-10-30");
    expect(sonrakiCuma("2026-10-31")).toBe("2026-11-06");
  });
  it("açık faturalar borçtan fazlaysa farkı en eski açık faturadan düşer ve vadesi gelenleri toplar", () => {
    const f = [
      { id: "1", fatura_no: "A", fatura_tarihi: "2026-10-12", toplam_tutar: 1000, durum: "bekliyor" },
      { id: "2", fatura_no: "B", fatura_tarihi: "2026-10-14", toplam_tutar: 500, durum: "bekliyor" },
      { id: "3", fatura_no: "C", fatura_tarihi: "2026-10-16", toplam_tutar: 300, durum: "bekliyor" },
      { id: "4", fatura_no: "D", fatura_tarihi: "2026-10-01", toplam_tutar: 900, durum: "odendi" },
    ];
    const v = keboVadeOzeti(f, 1600, "2026-10-30", "2026-10-28"); // açık 1800, borç 1600 → A'nın 200'ü ödenmiş
    expect(v.kalemler.map(k => [k.fatura_no, k.kalan])).toEqual([["A", 800], ["B", 500]]);
    expect(v.toplam).toBe(1300);
    expect(v.gecikmis).toBe(800); // A'nın vadesi 27.10
    expect(v.sonraki).toBe(300);
  });
});
