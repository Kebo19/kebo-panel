// ─── POS & YEMEK KARTI MUTABAKATI ────────────────────────────────────────────
// Günlük raporlardaki kart satışlarını (kasa_pos, kasa_edenred ...) bankaya yatan
// tutarlarla (kasa_manuel_islemler, banka ekstresinden içe aktarılır) karşılaştırır.
// Bu dosyadaki fonksiyonlar saf (yan etkisiz) — veritabanı erişimi bileşende yapılır.
//
// İş kuralları (kullanıcıdan):
// - POS satışı ERTESİ GÜN VakıfBank'a %1,99 komisyon düşülerek yatar. Hafta sonu/tatil
//   kuralı bilinmediğinden beklenen tarih = ertesi takvim günü, eşleştirmede ±2 gün tolerans.
//   Hafta sonu satışlarının pazartesi tek kalemde yatması ihtimaline karşı ardışık 2-3 günün
//   toplamı da tek yatışla eşleştirilebilir.
// - Yemek kartları (Edenred, Metropol, Setcard, Pluxee, Paye) hangi bankaya yattığı bilinmediği
//   için tüm hesaplara bakılır; komisyonun yasal üst sınırı %6.

import { gunEkle, gunFarki } from "@/lib/tarih";
import { YEMEK_KARTLARI } from "@/lib/hesap";

export const POS_KOMISYON_ORANI = 0.0199;
export const POS_BANKA_HESABI = "VakıfBank";
export const POS_KATEGORI = "POS / Kart Tahsilatı";
export const YEMEK_KARTI_KATEGORI = "Yemek Kartı Tahsilatı";
export const YEMEK_KARTI_YASAL_UST_SINIR = 0.06;
/** Beklenen yatış tarihinden en fazla bu kadar gün önce/sonra gelen yatış eşleşebilir. */
export const POS_TARIH_TOLERANS = 2;
/** Tutar toleransı: ±%0,5 veya ±5 TL (hangisi büyükse). */
export const TUTAR_TOLERANS_ORAN = 0.005;
export const TUTAR_TOLERANS_TL = 5;

const sayi = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const kurus = (v: number) => Math.round(v * 100) / 100;

/** Banka ekstresinden gelen bir tahsilat kaydı (kasa_manuel_islemler satırı). */
export interface BankaHareketi {
  id: string | number;
  tarih: string; // islem_tarihi (YYYY-AA-GG)
  tutar: number;
  hesap?: string | null;
  kategori?: string | null;
  aciklama?: string | null;
}

/** POS satışından bankaya yatması beklenen tutar (komisyon düşülmüş). */
export const posBeklenenYatis = (posSatis: number, oran = POS_KOMISYON_ORANI): number =>
  kurus(sayi(posSatis) * (1 - oran));

/** İki tutar tolerans içinde mi? (±%0,5 veya ±5 TL, hangisi büyükse) */
export function tutarTutarMi(gerceklesen: number, beklenen: number): boolean {
  const tol = Math.max(TUTAR_TOLERANS_TL, Math.abs(beklenen) * TUTAR_TOLERANS_ORAN);
  return Math.abs(gerceklesen - beklenen) <= tol;
}

// ─── POS ─────────────────────────────────────────────────────────────────────

export type PosDurum = "tuttu" | "eksik" | "bekliyor" | "kayit_yok";

export const POS_DURUM_ETIKET: Record<PosDurum, string> = {
  tuttu: "Tuttu",
  eksik: "Eksik",
  bekliyor: "Bekliyor",
  kayit_yok: "Kayıt yok",
};

export interface PosGunu { tarih: string; pos: number }

export interface PosSatiri {
  tarih: string;
  posSatis: number;
  beklenenTarih: string;
  beklenen: number;
  /** Bu güne düşen yatan tutar (birleşik yatışta beklenen oranında paylaştırılır). */
  gerceklesen: number | null;
  gerceklesenTarih: string | null;
  hareketIdleri: (string | number)[];
  /** gerceklesen − beklenen (eşleşme yoksa null) */
  fark: number | null;
  durum: PosDurum;
  /** Birden fazla günün tek kalemde yattığı durum. */
  birlesik: boolean;
}

export interface PosMutabakatSonucu {
  satirlar: PosSatiri[];
  toplamSatis: number;
  toplamBeklenen: number;
  toplamYatan: number;
  /** Eşleşen günlerin satışı − yatan (gerçekleşen komisyon + kesintiler). */
  eslesenSatis: number;
  gerceklesenKomisyon: number;
  /** Tüm dönem satışı × %1,99 */
  beklenenKomisyon: number;
  sayac: Record<PosDurum, number>;
  /** Hiçbir güne bağlanamayan POS yatışları (fazla / eşleşmeyen). */
  eslesmeyenHareketler: BankaHareketi[];
  /** Hiç POS tahsilat kaydı var mı? (yoksa ekstre yüklenmemiş demektir) */
  hareketVar: boolean;
}

/**
 * POS satışlarını banka yatışlarıyla eşleştirir.
 * Sıra: (1) tek gün ↔ tek yatış, tutar tolerans içinde (en yakın tarih/tutar önce),
 * (2) ardışık 2-3 gün toplamı ↔ tek yatış, (3) kalan günlere tolerans dışı ama beklenenden
 * DÜŞÜK yatış (en yakın tarih) → "Eksik". Kalanlar: beklenen tarih + tolerans geçmediyse
 * "Bekliyor", geçtiyse "Kayıt yok".
 */
export function posMutabakati(gunler: PosGunu[], hareketler: BankaHareketi[], bugunTarih: string): PosMutabakatSonucu {
  const gunListesi = gunler
    .map(g => ({ tarih: g.tarih, pos: sayi(g.pos) }))
    .filter(g => g.pos > 0)
    .sort((a, b) => a.tarih.localeCompare(b.tarih));
  const hList = hareketler
    .map(h => ({ ...h, tutar: sayi(h.tutar) }))
    .filter(h => h.tutar > 0)
    .sort((a, b) => a.tarih.localeCompare(b.tarih));

  const satirlar: PosSatiri[] = gunListesi.map(g => ({
    tarih: g.tarih,
    posSatis: g.pos,
    beklenenTarih: gunEkle(g.tarih, 1),
    beklenen: posBeklenenYatis(g.pos),
    gerceklesen: null, gerceklesenTarih: null, hareketIdleri: [], fark: null,
    durum: "kayit_yok", birlesik: false,
  }));
  const kullanildi = new Set<number>(); // hList index
  const tarihUzak = (s: PosSatiri, h: BankaHareketi) => Math.abs(gunFarki(s.beklenenTarih, h.tarih));
  const tarihYakin = (s: PosSatiri, h: BankaHareketi) => tarihUzak(s, h) <= POS_TARIH_TOLERANS;

  const bagla = (idx: number[], hi: number, durum: PosDurum) => {
    const h = hList[hi];
    kullanildi.add(hi);
    const toplamBeklenen = idx.reduce((t, i) => t + satirlar[i].beklenen, 0);
    idx.forEach(i => {
      const s = satirlar[i];
      const pay = idx.length === 1 ? h.tutar : kurus(toplamBeklenen > 0 ? h.tutar * s.beklenen / toplamBeklenen : 0);
      s.gerceklesen = pay;
      s.gerceklesenTarih = h.tarih;
      s.hareketIdleri = [h.id];
      s.fark = kurus(pay - s.beklenen);
      s.durum = durum;
      s.birlesik = idx.length > 1;
    });
  };

  // (1) Tekli, tutarı tutan eşleşmeler — en iyi skordan başlayarak açgözlü.
  const adaylar: { si: number; hi: number; skor: number }[] = [];
  satirlar.forEach((s, si) => hList.forEach((h, hi) => {
    if (tarihYakin(s, h) && tutarTutarMi(h.tutar, s.beklenen)) {
      adaylar.push({ si, hi, skor: tarihUzak(s, h) * 1e6 + Math.abs(h.tutar - s.beklenen) });
    }
  }));
  adaylar.sort((a, b) => a.skor - b.skor);
  for (const a of adaylar) {
    if (kullanildi.has(a.hi) || satirlar[a.si].gerceklesen !== null) continue;
    bagla([a.si], a.hi, "tuttu");
  }

  // (2) Ardışık 2-3 eşleşmemiş günün toplamı tek yatışa denk mi? (hafta sonu birikmesi)
  hList.forEach((h, hi) => {
    if (kullanildi.has(hi)) return;
    for (let bas = 0; bas < satirlar.length && !kullanildi.has(hi); bas++) {
      for (let uz = 2; uz <= 3; uz++) {
        const idx = Array.from({ length: uz }, (_, k) => bas + k);
        if (idx[idx.length - 1] >= satirlar.length) break;
        const grup = idx.map(i => satirlar[i]);
        if (grup.some(s => s.gerceklesen !== null || !tarihYakin(s, h))) continue;
        // takvimde ardışık olmalı
        if (grup.some((s, k) => k > 0 && gunFarki(grup[k - 1].tarih, s.tarih) !== 1)) continue;
        const toplam = grup.reduce((t, s) => t + s.beklenen, 0);
        if (tutarTutarMi(h.tutar, toplam)) { bagla(idx, hi, "tuttu"); break; }
      }
    }
  });

  // (3) Kalan günler: tarihi yakın ama beklenenden düşük yatış → Eksik.
  satirlar.forEach((s, si) => {
    if (s.gerceklesen !== null) return;
    let enIyi = -1;
    hList.forEach((h, hi) => {
      if (kullanildi.has(hi) || !tarihYakin(s, h) || h.tutar >= s.beklenen) return;
      if (enIyi < 0 || tarihUzak(s, h) < tarihUzak(s, hList[enIyi])) enIyi = hi;
    });
    if (enIyi >= 0) bagla([si], enIyi, "eksik");
  });

  // Eşleşmeyenler: bekliyor / kayıt yok
  satirlar.forEach(s => {
    if (s.gerceklesen !== null) return;
    s.durum = gunFarki(bugunTarih, gunEkle(s.beklenenTarih, POS_TARIH_TOLERANS)) >= 0 ? "bekliyor" : "kayit_yok";
  });

  const sayac: Record<PosDurum, number> = { tuttu: 0, eksik: 0, bekliyor: 0, kayit_yok: 0 };
  let toplamSatis = 0, toplamBeklenen = 0, toplamYatan = 0, eslesenSatis = 0;
  satirlar.forEach(s => {
    sayac[s.durum]++;
    toplamSatis += s.posSatis;
    toplamBeklenen += s.beklenen;
    if (s.gerceklesen !== null) { toplamYatan += s.gerceklesen; eslesenSatis += s.posSatis; }
  });

  return {
    satirlar,
    toplamSatis: kurus(toplamSatis),
    toplamBeklenen: kurus(toplamBeklenen),
    toplamYatan: kurus(toplamYatan),
    eslesenSatis: kurus(eslesenSatis),
    gerceklesenKomisyon: kurus(eslesenSatis - toplamYatan),
    beklenenKomisyon: kurus(toplamSatis * POS_KOMISYON_ORANI),
    sayac,
    eslesmeyenHareketler: hList.filter((_, hi) => !kullanildi.has(hi)),
    hareketVar: hList.length > 0,
  };
}

// ─── YEMEK KARTLARI ──────────────────────────────────────────────────────────

export type YemekKartiAdi = typeof YEMEK_KARTLARI[number]["ad"];

/** Açıklamada geçen anahtar kelimeler → kart. (Pluxee eski adı Sodexo; Edenred ürünü Ticket.) */
const KART_ANAHTARLARI: { ad: YemekKartiAdi; kelimeler: string[] }[] = [
  { ad: "Edenred", kelimeler: ["edenred", "ticket"] },
  { ad: "Metropol", kelimeler: ["metropol"] },
  { ad: "Setcard", kelimeler: ["setcard", "set card"] },
  { ad: "Pluxee", kelimeler: ["pluxee", "sodexo"] },
  { ad: "Paye", kelimeler: ["paye"] },
  { ad: "Multinet", kelimeler: ["multinet"] },
];

const kucult = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");

/** Banka açıklamasından yemek kartını bulur; bulamazsa null. */
export function yemekKartiBul(aciklama?: string | null): YemekKartiAdi | null {
  if (!aciklama) return null;
  const a = kucult(aciklama);
  for (const k of KART_ANAHTARLARI) if (k.kelimeler.some(w => a.includes(w))) return k.ad;
  return null;
}

/** "YYYY-AA-GG" → "YYYY-AA" ay anahtarı, n ay kaydırarak. */
export function ayAnahtari(tarih: string, kaydir = 0): string {
  const y = Number(tarih.slice(0, 4)), m = Number(tarih.slice(5, 7)) - 1 + kaydir;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

export interface YemekKartiSatiri {
  ad: YemekKartiAdi;
  satis: number;
  yatan: number;
  /** yatan − satış (negatif = kesinti) */
  fark: number;
  /** (satış − yatan) / satış; yatış yoksa null */
  komisyonOrani: number | null;
  /** Zımni komisyon yasal üst sınırı (%6) aşıyor mu? */
  sinirAsimi: boolean;
}

export interface YemekKartiAyi {
  ay: string; // YYYY-AA
  kartlar: YemekKartiSatiri[];
  /** Açıklamasından kartı anlaşılamayan yatışlar */
  belirsizYatan: number;
  toplamSatis: number;
  toplamYatan: number;
}

export interface YemekKartiMutabakatSonucu {
  aylar: YemekKartiAyi[];
  toplam: YemekKartiSatiri[];
  belirsizYatan: number;
  hareketVar: boolean;
}

const kartSatiri = (ad: YemekKartiAdi, satis: number, yatan: number): YemekKartiSatiri => {
  const komisyonOrani = yatan > 0 && satis > 0 ? (satis - yatan) / satis : null;
  return {
    ad, satis: kurus(satis), yatan: kurus(yatan), fark: kurus(yatan - satis), komisyonOrani,
    sinirAsimi: komisyonOrani !== null && komisyonOrani > YEMEK_KARTI_YASAL_UST_SINIR + 1e-9,
  };
};

/**
 * Yemek kartı satışlarını (aylık) bankaya yatanlarla karşılaştırır.
 * `kaydirmaAy` = 1 ise bir ayın satışı bir sonraki ay yatan tutarlarla eşleştirilir
 * (kartlar genelde ertesi ay öder).
 */
export function yemekKartiMutabakati<T extends { tarih: string }>(
  raporlar: T[],
  hareketler: BankaHareketi[],
  kaydirmaAy = 0,
): YemekKartiMutabakatSonucu {
  const aylar = new Map<string, { satis: Record<string, number>; yatan: Record<string, number>; belirsiz: number }>();
  const ayAl = (ay: string) => {
    if (!aylar.has(ay)) aylar.set(ay, { satis: {}, yatan: {}, belirsiz: 0 });
    return aylar.get(ay)!;
  };
  raporlar.forEach(r => {
    const a = ayAl(ayAnahtari(r.tarih));
    YEMEK_KARTLARI.forEach(k => { a.satis[k.ad] = (a.satis[k.ad] || 0) + sayi((r as Record<string, unknown>)[k.alan]); });
  });

  let belirsizToplam = 0;
  const hGecerli = hareketler.filter(h => sayi(h.tutar) > 0);
  hGecerli.forEach(h => {
    const ay = ayAnahtari(h.tarih, -kaydirmaAy);
    const a = aylar.get(ay);
    if (!a) return; // seçili dönemin satışlarıyla ilgisi olmayan ay
    const kart = yemekKartiBul(h.aciklama);
    if (kart) a.yatan[kart] = (a.yatan[kart] || 0) + sayi(h.tutar);
    else { a.belirsiz += sayi(h.tutar); belirsizToplam += sayi(h.tutar); }
  });

  const toplamSatis: Record<string, number> = {}, toplamYatan: Record<string, number> = {};
  const ayListesi: YemekKartiAyi[] = [...aylar.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ay, a]) => {
      const kartlar = YEMEK_KARTLARI.map(k => {
        const s = a.satis[k.ad] || 0, y = a.yatan[k.ad] || 0;
        toplamSatis[k.ad] = (toplamSatis[k.ad] || 0) + s;
        toplamYatan[k.ad] = (toplamYatan[k.ad] || 0) + y;
        return kartSatiri(k.ad, s, y);
      });
      return {
        ay, kartlar, belirsizYatan: kurus(a.belirsiz),
        toplamSatis: kurus(kartlar.reduce((t, k) => t + k.satis, 0)),
        toplamYatan: kurus(kartlar.reduce((t, k) => t + k.yatan, 0) + a.belirsiz),
      };
    });

  return {
    aylar: ayListesi,
    toplam: YEMEK_KARTLARI.map(k => kartSatiri(k.ad, toplamSatis[k.ad] || 0, toplamYatan[k.ad] || 0)),
    belirsizYatan: kurus(belirsizToplam),
    hareketVar: hGecerli.length > 0,
  };
}
