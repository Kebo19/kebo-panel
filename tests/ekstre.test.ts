import { describe, it, expect } from "vitest";
import {
  sayiCoz, tarihCoz, excelSeriTarih, normalize, kolonTahmin, baslikBul, satirlariCoz,
  csvCoz, kategoriTahmin, ekstreRef, ekstreRefleri, kayitEslesirMi, muhtemelEslesmeler,
} from "@/lib/ekstre";

describe("sayiCoz", () => {
  it("Türkçe biçimler", () => {
    expect(sayiCoz("1.234,56")).toBe(1234.56);
    expect(sayiCoz("-1.234,56")).toBe(-1234.56);
    expect(sayiCoz("1234,5")).toBe(1234.5);
    expect(sayiCoz("12.345.678,90")).toBe(12345678.9);
    expect(sayiCoz("1.234")).toBe(1234);
  });
  it("sayı, İngilizce biçim ve işaret varyantları", () => {
    expect(sayiCoz(-250.75)).toBe(-250.75);
    expect(sayiCoz("1,234.56")).toBe(1234.56);
    expect(sayiCoz("12.50")).toBe(12.5);
    expect(sayiCoz("(1.000,00)")).toBe(-1000);
    expect(sayiCoz("1.000,00-")).toBe(-1000);
    expect(sayiCoz("₺ 2.500,00 TL")).toBe(2500);
    expect(sayiCoz("+300,00")).toBe(300);
  });
  it("sayı olmayanlar null", () => {
    expect(sayiCoz("")).toBeNull();
    expect(sayiCoz("Toplam")).toBeNull();
    expect(sayiCoz(null)).toBeNull();
  });
});

describe("tarihCoz", () => {
  it("metin biçimleri", () => {
    expect(tarihCoz("29.09.2026")).toBe("2026-09-29");
    expect(tarihCoz("2026-09-29")).toBe("2026-09-29");
    expect(tarihCoz("29/09/2026")).toBe("2026-09-29");
    expect(tarihCoz("1.9.2026")).toBe("2026-09-01");
    expect(tarihCoz("29.09.26")).toBe("2026-09-29");
    expect(tarihCoz("29.09.2026 14:35:10")).toBe("2026-09-29");
    expect(tarihCoz("2026-09-29T10:00:00")).toBe("2026-09-29");
  });
  it("Excel seri numarası", () => {
    expect(excelSeriTarih(46294)).toBe("2026-09-29");
    expect(tarihCoz(46294)).toBe("2026-09-29");
    expect(tarihCoz(46294.6)).toBe("2026-09-29");
    expect(tarihCoz(12)).toBeNull();
  });
  it("geçersiz tarihler", () => {
    expect(tarihCoz("31.02.2026")).toBeNull();
    expect(tarihCoz("Açıklama")).toBeNull();
    expect(tarihCoz("")).toBeNull();
  });
});

describe("normalize", () => {
  it("Türkçe karakterleri katlar", () => {
    expect(normalize("Üye İşyeri  ödemesi")).toBe("UYE ISYERI ODEMESI");
    expect(normalize("iğdaş ÇIKIŞ")).toBe("IGDAS CIKIS");
  });
});

describe("kolon ve başlık bulma", () => {
  it("borç/alacak kolonlu ekstre", () => {
    const e = kolonTahmin(["İşlem Tarihi", "Valör", "Açıklama", "Borç", "Alacak", "Bakiye"]);
    expect(e).toEqual({ tarih: 0, aciklama: 2, tutar: -1, borc: 3, alacak: 4 });
  });
  it("tek tutar kolonlu ekstre, valör tarihi tercih edilmez", () => {
    const e = kolonTahmin(["Valör Tarihi", "Tarih", "İşlem Açıklaması", "İşlem Tutarı", "Bakiye"]);
    expect(e.tarih).toBe(1); expect(e.aciklama).toBe(2); expect(e.tutar).toBe(3);
  });
  it("borç ve alacak aynı kolona eşlenmez; tek 'Borç/Alacak' başlığı tutar kolonu olur", () => {
    const e = kolonTahmin(["Tarih", "Açıklama", "Borç/Alacak", "Bakiye"]);
    expect(e.borc).toBe(-1); expect(e.alacak).toBe(-1); expect(e.tutar).toBe(2);
    const e2 = kolonTahmin(["Tarih", "Açıklama", "Borç Alacak Tutarı", "Bakiye"]);
    expect(e2.borc).toBe(-1); expect(e2.alacak).toBe(-1); expect(e2.tutar).toBe(2);
    const satirlar: unknown[][] = [["Tarih", "Açıklama", "Borç/Alacak"], ["01.09.2026", "KIRA", "-5.000,00"], ["02.09.2026", "POS", "1.000,00"]];
    expect(satirlariCoz(satirlar, 0, kolonTahmin(satirlar[0])).map(x => x.tutar)).toEqual([-5000, 1000]);
  });
  it("ayrı borç/alacak kolonları farklı indekslere eşlenir", () => {
    const e = kolonTahmin(["Tarih", "Açıklama", "Borç Tutarı", "Alacak Tutarı"]);
    expect(e.borc).toBe(2); expect(e.alacak).toBe(3); expect(e.tutar).toBe(-1);
  });
  it("giriş/çıkış kolonları", () => {
    const e = kolonTahmin(["Tarih", "Açıklama", "Giriş", "Çıkış"]);
    expect(e.alacak).toBe(2); expect(e.borc).toBe(3);
  });
  it("başlık satırını üstteki bilgi satırlarını atlayarak bulur ve satırları çözer", () => {
    const satirlar: unknown[][] = [
      ["ENPARA HESAP HAREKETLERİ"],
      ["Müşteri", "KEBO GIDA"],
      [],
      ["Tarih", "Açıklama", "Borç", "Alacak", "Bakiye"],
      ["29.09.2026", "YEMEKSEPETI HAKEDIS", "", "12.500,00", "50.000,00"],
      [46294, "EFT UCRETI", "5,50", "", "49.994,50"],
      ["", "Toplam", "5,50", "12.500,00", ""],
    ];
    const b = baslikBul(satirlar)!;
    expect(b.satir).toBe(3);
    const s = satirlariCoz(satirlar, b.satir, b.eslesme);
    expect(s).toEqual([
      { tarih: "2026-09-29", aciklama: "YEMEKSEPETI HAKEDIS", tutar: 12500 },
      { tarih: "2026-09-29", aciklama: "EFT UCRETI", tutar: -5.5 },
    ]);
  });
  it("işaretli tek tutar kolonu", () => {
    const satirlar = [["Tarih", "Açıklama", "Tutar"], ["2026-09-01", "KIRA", "-40.000,00"]];
    expect(satirlariCoz(satirlar, 0, kolonTahmin(satirlar[0]))[0].tutar).toBe(-40000);
  });
});

describe("csvCoz", () => {
  it("noktalı virgül ve tırnak", () => {
    const m = "﻿Tarih;Açıklama;Tutar\r\n29.09.2026;\"POS; SATIS\";1.234,56\r\n";
    expect(csvCoz(m)).toEqual([["Tarih", "Açıklama", "Tutar"], ["29.09.2026", "POS; SATIS", "1.234,56"]]);
  });
  it("virgül ayraç", () => {
    expect(csvCoz("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });
});

describe("kategoriTahmin", () => {
  const k = (a: string, t: number) => kategoriTahmin(a, t);
  it("gelirler", () => {
    expect(k("ÜİY POS SATIŞ 123", 5000).kategori).toBe("POS / Kart Tahsilatı");
    expect(k("Üye İşyeri Ödemesi", 5000).kategori).toBe("POS / Kart Tahsilatı");
    expect(k("YEMEKSEPETI ELEKTRONIK ILETISIM HAKEDIS", 9000).kategori).toBe("Platform Hakedişi");
    expect(k("TRENDYOL GO ODEME", 9000).kategori).toBe("Platform Hakedişi");
    expect(k("EDENRED KART ODEME", 900)).toEqual({ tip: "gelir", kategori: "Yemek Kartı Tahsilatı", transfer: false });
    expect(k("MULTINET UP", 900).kategori).toBe("Yemek Kartı Tahsilatı");
    expect(k("AHMET YILMAZ EFT", 100).kategori).toBe("Diğer Gelir");
  });
  it("giderler", () => {
    expect(k("EFT MASRAFI", -5.5).kategori).toBe("Banka Komisyonu");
    expect(k("POS KOMISYONU", -120).kategori).toBe("POS Komisyonu");
    expect(k("SGK PRIM ODEMESI", -20000).kategori).toBe("SGK Primi");
    expect(k("EYLUL KIRA UCRETI", -40000).kategori).toBe("Kira");
    expect(k("ENERJISA FATURA", -3000).kategori).toBe("Elektrik");
    expect(k("İGDAŞ FATURA", -2000).kategori).toBe("Doğalgaz");
    expect(k("ISKI SU FATURASI", -800).kategori).toBe("Su");
    expect(k("PERSONEL MAAS ODEMESI", -25000).kategori).toBe("Personel Maaş");
    expect(k("EFT GIDEN ABC GIDA LTD", -10000)).toEqual({ tip: "gider", kategori: "Diğer Gider", transfer: false });
  });
  it("kısa kelimeler tam kelime eşleşir", () => {
    expect(k("SUPERMARKET ALISVERIS", -300).kategori).toBe("Diğer Gider");
    expect(k("POSTA GIDER", -50).kategori).toBe("Diğer Gider");
  });
  it("hesaplar arası transfer", () => {
    expect(k("VIRMAN VAKIFBANK", -10000).transfer).toBe(true);
    expect(k("FAST KEBO GIDA TEB HESABINA", 10000)).toEqual({ tip: "gelir", kategori: "Hesaplar arası transfer", transfer: true });
    expect(kategoriTahmin("EFT XYZ LTD", -100, ["XYZ"]).transfer).toBe(true);
  });
});

describe("ekstreRef", () => {
  it("biçim ve 60 karakter sınırı", () => {
    expect(ekstreRef("Enpara", "2026-09-29", -5.5, "eft  ücreti")).toBe("Enpara|2026-09-29|-5.50|EFT UCRETI");
    const uzun = "A".repeat(100);
    expect(ekstreRef("TEB", "2026-09-29", 10, uzun).split("|")[3]).toHaveLength(60);
  });
  it("aynı dosyadaki tekrar eden satırlar ayrışır, yeniden üretim aynıdır", () => {
    const s = [
      { tarih: "2026-09-29", aciklama: "EFT UCRETI", tutar: -5.5 },
      { tarih: "2026-09-29", aciklama: "EFT UCRETI", tutar: -5.5 },
      { tarih: "2026-09-29", aciklama: "POS", tutar: 100 },
    ];
    const r = ekstreRefleri("Enpara", s);
    expect(r[0]).toBe("Enpara|2026-09-29|-5.50|EFT UCRETI");
    expect(r[1]).toBe("Enpara|2026-09-29|-5.50|EFT UCRETI#2");
    expect(ekstreRefleri("Enpara", s)).toEqual(r);
  });
});

describe("elle girilmiş kayıtla eşleştirme", () => {
  const satir = (tarih: string, tutar: number) => ({ tarih, aciklama: "X", tutar });
  it("aynı hesap, aynı yön, ±1 TL, ±2 gün", () => {
    const k = { tip: "gider", hesap: "Enpara", tutar: 1000.5, islem_tarihi: "2026-09-10", kaynak: null };
    expect(kayitEslesirMi("Enpara", satir("2026-09-12", -1000), k)).toBe(true);
    expect(kayitEslesirMi("Enpara", satir("2026-09-13", -1000), k)).toBe(false); // 3 gün
    expect(kayitEslesirMi("Enpara", satir("2026-09-10", -1002), k)).toBe(false); // >1 TL
    expect(kayitEslesirMi("Enpara", satir("2026-09-10", 1000), k)).toBe(false); // yön farklı
    expect(kayitEslesirMi("TEB", satir("2026-09-10", -1000), k)).toBe(false); // hesap farklı
    expect(kayitEslesirMi("Enpara", satir("2026-09-10", -1000), { ...k, kaynak: "banka_ekstre" })).toBe(false);
    expect(kayitEslesirMi("Enpara", satir("2026-09-10", -1000), { ...k, kaynak: "cari_odeme" })).toBe(true);
  });
  it("gelir girişle eşleşir, gidere eşleşmez", () => {
    const k = { tip: "gelir", hesap: "VakıfBank", tutar: "500", islem_tarihi: "2026-09-01" };
    expect(kayitEslesirMi("VakıfBank", satir("2026-08-31", 500), k)).toBe(true);
    expect(kayitEslesirMi("VakıfBank", satir("2026-08-31", -500), k)).toBe(false);
  });
  it("transfer: çıkış kaynak hesapta (hesap), giriş hedef hesapta (hedef_hesap)", () => {
    const k = { tip: "transfer", hesap: "TEB", hedef_hesap: "Enpara", tutar: 2000, islem_tarihi: "2026-09-05" };
    expect(kayitEslesirMi("TEB", satir("2026-09-05", -2000), k)).toBe(true);
    expect(kayitEslesirMi("Enpara", satir("2026-09-05", 2000), k)).toBe(true);
    expect(kayitEslesirMi("TEB", satir("2026-09-05", 2000), k)).toBe(false);
    expect(kayitEslesirMi("Enpara", satir("2026-09-05", -2000), k)).toBe(false);
  });
  it("bir kayıt tek satırla eşleşir, en yakını seçilir", () => {
    const kayitlar = [
      { id: "a", tip: "gider", hesap: "Enpara", tutar: 100, islem_tarihi: "2026-09-10" },
    ];
    const s = [satir("2026-09-08", -100), satir("2026-09-10", -100), satir("2026-09-10", -300)];
    const r = muhtemelEslesmeler("Enpara", s, kayitlar);
    expect(r.map(x => x?.id ?? null)).toEqual([null, "a", null]);
  });
});
