// ─── AYLIK KÂR / ZARAR ──────────────────────────────────────────────────────
// Kâr/zarar sayfasının (app/kar-zarar) ve kasa kategorilerinin TEK kaynağı.
//
// İşletme kârı = Net ciro − mal alışı − personel − kurye − sabit/işletme
//                − komisyonlar (− kredi taksidi, anahtar açıksa) + diğer gelir ± kasa farkı
//
// Çift saymamak için:
// • Net ciro (lib/hesap) kasadan gün içinde ödenen giderleri (gunluk_gider) zaten
//   düşmüş hâldedir. Rapordan verilen avanslar kasa kaydı oluşturmaz (gunluk_gider içinde);
//   kaynak='avans' kasa kayıtları Personel sayfasından nakit/bankadan verilen avanslardır →
//   Personel altında sayılır.
// • Rapordan yapılan cari ödemeler (cari_odemeler.rapor_id dolu) gunluk_gider içinde net
//   ciroyu düşürür; faturası da mal alışında sayılır → bu tutar net ciroya geri eklenir
//   ("Kasadan cari ödeme (mal alışında sayıldı)").
// • Mal alışı faturalardan gelir; "Cari Ödeme" (ve kaynak='cari_odeme') kayıtları
//   o faturaların ödemesidir → kâr/zarara girmez, nakit akışında gösterilir.
// • POS / yemek kartı / platform tahsilatları satıştır (zaten cirodadır) → gelir sayılmaz.
// • Ortak sermaye, kredi girişi, kredi taksidi, transferler, nakit kasa açılışı → nakit akışı.

import {
  donemOzeti, roadrunnerKuryesiMi, roadrunnerKuryeUcreti, type RaporVerisi,
} from "@/lib/hesap";

// ─── KASA KATEGORİLERİ ─────────────────────────────────────────────────────
export const KASA_GIDER_KATEGORILERI = [
  { grup: "Personel", items: ["Personel Maaş", "Personel Avans", "SGK Primi", "İkramiye"] },
  { grup: "Sabit Giderler", items: ["Kira", "Elektrik", "Su", "Doğalgaz", "İnternet / Telefon", "Muhasebe"] },
  { grup: "İşletme", items: ["Market / Malzeme", "Temizlik Malzemesi", "Ambalaj / Paket", "Bakım / Onarım"] },
  { grup: "Finans", items: ["Banka Komisyonu", "POS Komisyonu", "Kredi Taksidi"] },
  { grup: "Diğer", items: ["Yakıt / Ulaşım", "Pazarlama / Reklam", "Kargo / Kurye", "Diğer Gider"] },
];
export const TUM_KASA_GIDER_KATEGORILERI = KASA_GIDER_KATEGORILERI.flatMap(g => g.items);

/** "POS / Kart Tahsilatı", "Platform Hakedişi", "Yemek Kartı Tahsilatı": günlük rapordaki satışın bankaya geçmesi. */
export const KASA_GELIR_KATEGORILERI = [
  "POS / Kart Tahsilatı", "Platform Hakedişi", "Yemek Kartı Tahsilatı", "Ortak Sermaye", "Kredi", "Diğer Gelir",
];

export const TRANSFER_KATEGORISI = "Hesaplar arası transfer";

const PERSONEL_KATS = new Set(["Personel Maaş", "Personel Avans", "SGK Primi", "SGK / Sigorta", "İkramiye"]);
const KOMISYON_KATS = new Set(["Banka Komisyonu", "POS Komisyonu"]);
/** Satış tahsilatı — ciroda zaten var. */
export const TAHSILAT_KATS = new Set(["POS / Kart Tahsilatı", "Platform Hakedişi", "Yemek Kartı Tahsilatı"]);
/** Sabit/işletme bölümünde ayrı satır olarak gösterilen kategoriler (diğerleri kendi adıyla listelenir). */
export const SABIT_KATS = ["Kira", "Elektrik", "Doğalgaz", "Su", "İnternet / Telefon", "Muhasebe"];

// ─── TİPLER ────────────────────────────────────────────────────────────────
export interface KasaIslemiKZ {
  tip: "gelir" | "gider" | "transfer" | string;
  kategori: string | null;
  tutar: number | string | null;
  islem_tarihi: string;
  kaynak?: string | null;
}
export interface FaturaKZ { fatura_tarihi: string | null; toplam_tutar: number | string | null }
export interface CariOdemeKZ { tarih: string | null; tutar: number | string | null; rapor_id?: string | null }

export interface KarZararGirdi {
  raporlar: RaporVerisi[];
  faturalar: FaturaKZ[];
  kasaIslemleri: KasaIslemiKZ[];
  /** "YYYY-AA" */
  ay: string;
  krediTaksidiGider: boolean;
  /** Verilirse nakit akışındaki cari ödemeleri bu tablodan hesaplanır (yoksa kasa kayıtlarından). */
  cariOdemeler?: CariOdemeKZ[];
  /** Eksik rapor günü hesabı için "bugün" (YYYY-AA-GG). Verilmezse ayın tamamı sayılır. */
  bugun?: string;
}

export interface KarZararSonuc {
  ay: string;
  brut: number; indirim: number; iade: number; gunlukGider: number;
  /** Rapordan (gün içi kasadan) yapılan cari ödemeler: gunluk_gider'de düşülmüş, faturası mal alışında → net ciroya geri eklenir */
  raporCariOdeme: number;
  netCiro: number;
  malAlisi: number; faturaSayisi: number;
  personel: number; personelDetay: Record<string, number>;
  kurye: number; kuryePaket: number;
  sabitIsletme: number; sabitIsletmeDetay: Record<string, number>;
  komisyon: number; komisyonDetay: Record<string, number>;
  krediTaksidi: number; // kâra dahil edilen (anahtar kapalıysa 0)
  digerGelir: number; digerGelirDetay: Record<string, number>;
  kasaFarki: number;
  toplamGider: number;
  isletmeKari: number;
  karMarji: number; // net ciroya oranı, %
  nakitAkisi: {
    ortakSermaye: number; krediGirisi: number; krediTaksidi: number; cariOdeme: number;
    transfer: number; tahsilat: number; kasaAcilis: number;
  };
  raporGunSayisi: number;
  ayGunSayisi: number;
  /** Rapor girilmesi beklenen (geçmiş) ama girilmemiş gün sayısı */
  eksikGun: number;
}

const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};
const ekle = (m: Record<string, number>, k: string, v: number) => { m[k] = (m[k] || 0) + v; };
const yuvarla = (v: number) => Math.round(v * 100) / 100;

export function ayinGunSayisi(ay: string): number {
  const [y, m] = ay.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-09", 6 → ["2026-04", ..., "2026-09"] */
export function sonAylar(ay: string, adet: number): string[] {
  const [y, m] = ay.split("-").map(Number);
  const sonuc: string[] = [];
  for (let i = adet - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    sonuc.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return sonuc;
}

/** O ay rapor girilmesi gereken ama girilmemiş gün sayısı (gelecek günler sayılmaz). */
export function eksikRaporGunu(raporTarihleri: string[], ay: string, bugun?: string): number {
  const toplam = ayinGunSayisi(ay);
  let beklenen = toplam;
  if (bugun) {
    const bAy = bugun.slice(0, 7);
    if (bAy < ay) beklenen = 0;
    else if (bAy === ay) beklenen = Number(bugun.slice(8, 10));
  }
  const girilen = new Set(raporTarihleri.filter(t => t?.slice(0, 7) === ay && (!bugun || t <= bugun))).size;
  return Math.max(0, beklenen - girilen);
}

export function karZararHesapla(g: KarZararGirdi): KarZararSonuc {
  const { ay, krediTaksidiGider } = g;
  const buAy = (t: string | null | undefined) => !!t && t.slice(0, 7) === ay;

  // Ciro
  const raporlar = g.raporlar.filter(r => buAy(r.tarih));
  const o = donemOzeti(raporlar);

  // Kurye (Roadrunner)
  let kurye = 0, kuryePaket = 0;
  for (const r of raporlar) {
    for (const k of r.kurye_raporlari || []) {
      if (!roadrunnerKuryesiMi(r.tarih, k)) continue;
      const u = roadrunnerKuryeUcreti(k);
      kurye += u.ucret; kuryePaket += u.gercek;
    }
  }

  // Mal alışı
  const faturalar = g.faturalar.filter(f => buAy(f.fatura_tarihi));
  const malAlisi = faturalar.reduce((s, f) => s + num(f.toplam_tutar), 0);

  // Kasa hareketleri
  const personelDetay: Record<string, number> = {};
  const sabitIsletmeDetay: Record<string, number> = {};
  const komisyonDetay: Record<string, number> = {};
  const digerGelirDetay: Record<string, number> = {};
  const na = { ortakSermaye: 0, krediGirisi: 0, krediTaksidi: 0, cariOdeme: 0, transfer: 0, tahsilat: 0, kasaAcilis: 0 };
  let kasaFarki = 0;

  for (const i of g.kasaIslemleri) {
    if (!buAy(i.islem_tarihi)) continue;
    const t = num(i.tutar);
    const kat = (i.kategori || "").trim();
    const kaynak = i.kaynak || "";

    if (i.tip === "transfer" || kat === TRANSFER_KATEGORISI) { na.transfer += t; continue; }
    if (kat === "Nakit kasa açılış") { na.kasaAcilis += i.tip === "gider" ? -t : t; continue; }
    if (kat === "Kasa sayım farkı") { kasaFarki += i.tip === "gider" ? -t : t; continue; }

    if (i.tip === "gider") {
      if (kaynak === "avans") { ekle(personelDetay, "Personel Avans", t); continue; } // Personel sayfasından nakit/bankadan verilen avans
      if (kaynak === "cari_odeme" || kat === "Cari Ödeme") { na.cariOdeme += t; continue; }
      if (kat === "Kredi Taksidi") { na.krediTaksidi += t; continue; }
      if (PERSONEL_KATS.has(kat)) { ekle(personelDetay, kat === "SGK / Sigorta" ? "SGK Primi" : kat, t); continue; }
      if (KOMISYON_KATS.has(kat)) { ekle(komisyonDetay, kat, t); continue; }
      const anahtar = kaynak === "rapor_nakit" ? "Diğer (eski nakitten ödeme)" : (kat || "Diğer Gider");
      ekle(sabitIsletmeDetay, anahtar, t);
    } else if (i.tip === "gelir") {
      if (kaynak === "avans" || kaynak === "cari_odeme") continue;
      if (kat === "Ortak Sermaye") { na.ortakSermaye += t; continue; }
      if (kat === "Kredi") { na.krediGirisi += t; continue; }
      if (TAHSILAT_KATS.has(kat)) { na.tahsilat += t; continue; }
      ekle(digerGelirDetay, kat || "Diğer Gelir", t);
    }
  }

  // Gerçekten ödenen cari tutarı: cari_odemeler tablosu verildiyse oradan (hesapsız ödemeler de dahil)
  if (g.cariOdemeler) na.cariOdeme =g.cariOdemeler.filter(c => buAy(c.tarih)).reduce((s, c) => s + num(c.tutar), 0);

  // Rapordan yapılan cari ödemeler gunluk_gider içinde net ciroyu düşürdü; faturası mal alışında → geri ekle
  const raporCariOdeme = (g.cariOdemeler || []).filter(c => buAy(c.tarih) && c.rapor_id).reduce((s, c) => s + num(c.tutar), 0);
  const netCiro = o.net + raporCariOdeme;

  const topla = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  const personel = topla(personelDetay);
  const sabitIsletme = topla(sabitIsletmeDetay);
  const komisyon = topla(komisyonDetay);
  const digerGelir = topla(digerGelirDetay);
  const krediTaksidi = krediTaksidiGider ? na.krediTaksidi : 0;

  const toplamGider = malAlisi + personel + kurye + sabitIsletme + komisyon + krediTaksidi;
  const isletmeKari = netCiro - toplamGider + digerGelir + kasaFarki;

  const r2 = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, yuvarla(v)]));
  return {
    ay,
    brut: yuvarla(o.brut), indirim: yuvarla(o.indirim), iade: yuvarla(o.iade), gunlukGider: yuvarla(o.gider),
    raporCariOdeme: yuvarla(raporCariOdeme), netCiro: yuvarla(netCiro),
    malAlisi: yuvarla(malAlisi), faturaSayisi: faturalar.length,
    personel: yuvarla(personel), personelDetay: r2(personelDetay),
    kurye: yuvarla(kurye), kuryePaket,
    sabitIsletme: yuvarla(sabitIsletme), sabitIsletmeDetay: r2(sabitIsletmeDetay),
    komisyon: yuvarla(komisyon), komisyonDetay: r2(komisyonDetay),
    krediTaksidi: yuvarla(krediTaksidi),
    digerGelir: yuvarla(digerGelir), digerGelirDetay: r2(digerGelirDetay),
    kasaFarki: yuvarla(kasaFarki),
    toplamGider: yuvarla(toplamGider),
    isletmeKari: yuvarla(isletmeKari),
    karMarji: netCiro > 0 ? Math.round((isletmeKari / netCiro) * 1000) / 10 : 0,
    nakitAkisi: {
      ortakSermaye: yuvarla(na.ortakSermaye), krediGirisi: yuvarla(na.krediGirisi), krediTaksidi: yuvarla(na.krediTaksidi),
      cariOdeme: yuvarla(na.cariOdeme), transfer: yuvarla(na.transfer), tahsilat: yuvarla(na.tahsilat), kasaAcilis: yuvarla(na.kasaAcilis),
    },
    raporGunSayisi: new Set(raporlar.map(r => r.tarih)).size,
    ayGunSayisi: ayinGunSayisi(ay),
    eksikGun: eksikRaporGunu(raporlar.map(r => r.tarih), ay, g.bugun),
  };
}

// ─── SABİT GİDER DURUMU ────────────────────────────────────────────────────
export type SabitGiderDurum = "odendi" | "bekliyor" | "gecikti";

/**
 * Bu ayki durum: bu ay içinde ödeme kaydı varsa "odendi"; yoksa ödeme günü
 * (ay 30 çekiyorsa 31 → 30'a kısalır) geçtiyse "gecikti", değilse "bekliyor".
 */
export function sabitGiderDurum(gun: number, bugun: string, odemeTarihi?: string | null): SabitGiderDurum {
  if (odemeTarihi && odemeTarihi.slice(0, 7) === bugun.slice(0, 7)) return "odendi";
  const vadeGunu = Math.min(Math.max(1, Math.round(gun) || 1), ayinGunSayisi(bugun.slice(0, 7)));
  return Number(bugun.slice(8, 10)) > vadeGunu ? "gecikti" : "bekliyor";
}

export const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
/** "2026-09" → "Eylül 2026" */
export const ayEtiketi = (ay: string): string => `${AY_ADLARI[Number(ay.slice(5, 7)) - 1] ?? ay} ${ay.slice(0, 4)}`;
