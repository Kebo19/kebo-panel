import { describe, it, expect } from "vitest";
import { ekstreAyristir, mutabakatPlani, varsayilanOdemeBaslangici, trSayi, DUZELTME_ACIKLAMA, type PdfParca } from "@/lib/keboEkstre";

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

  it("eksik faturayı ve yeni tahsilatları bulur, bakiyeyi FIFO eşitler", () => {
    const p = mutabakatPlani(ekstre, faturalar, [], "0000-00-00");
    expect(p.yeniFaturalar.map(s => s.evrakNo)).toEqual(["KBE2026000000020"]);
    expect(p.yeniOdemeler.map(s => s.alacak)).toEqual([600, 50]);
    // Bakiye 750: en yeni fatura (300) + eski faturanın 450'si açık → eski fatura açık kalır, 550 düzeltme
    expect(p.acikKalacak).toEqual(["yeni:KBE2026000000020", "a"]);
    expect(p.duzeltme).toBe(550);
    expect(p.kapanacak).toEqual([]);
  });

  it("başlangıç tarihinden önceki tahsilatları atlar, ekstre kayıtlarını tekrar eklemez", () => {
    const odemeler = [
      { id: "o1", tarih: "2026-01-06", tutar: 999, aciklama: "Manuel ödeme", fatura_idleri: null },
      { id: "o2", tarih: "2026-01-08", tutar: 50, aciklama: "Kebo ekstre · Cari Virman Fişi · 2026-01-08|0000000238|50.00", fatura_idleri: null },
      { id: "o3", tarih: "2026-01-08", tutar: 550, aciklama: DUZELTME_ACIKLAMA, fatura_idleri: [] },
    ];
    expect(varsayilanOdemeBaslangici(odemeler)).toBe("2026-01-07");
    const p = mutabakatPlani(ekstre, faturalar, odemeler);
    expect(p.yeniOdemeler).toEqual([]);
    expect(p.atlananOdemeler.map(s => s.alacak)).toEqual([600]);
    expect(p.hedefBakiye).toBe(750); // önceki düzeltme serbest ödeme sayılmaz
  });
});
