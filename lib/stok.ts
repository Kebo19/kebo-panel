// ─── STOK HESAPLARI ─────────────────────────────────────────────────────────
// Stok listesi ve ürün detay sayfası aynı hesapları kullanır.
//
// HAREKET TÜRLERİ
//   sayim : Elde ne kadar var. Sabah (gün başı) ya da akşam (gün sonu) yapılır.
//   giris : Tedarikçiden gelen mal (birim fiyatıyla)
//   cikis : Kullanım dışı çıkış — nedeni zorunlu: SKT geçti, bozuldu, tedarikçiye iade, diğer
//
// ZAMAN ÇİZELGESİ
//   Her gün üç ana ayrılır: sabah sayımı (gün başı) → gün içi (giriş/çıkış) → akşam sayımı (gün sonu).
//   Böylece "20'si akşam" ile "21'i sabah" aynı andır; arada kullanım olmaz.
//
// KULLANIM (mutfakta harcanan)
//   İki sayım arasında: önceki sayım + gelen mal − çıkışlar − sonraki sayım
//   Kullanım aradaki günlere EŞİT bölünür; sayılmayan günler "tahmini" işaretlenir:
//     20 sabah 100 kg, 21 sabah 80 kg          → 20'si: 20 kg
//     21 sabah 80 kg, 22 sayılmadı, 23 sabah 50 → 21'i ve 22'si: 15'er kg (tahmini)
//   Fire ve iade kullanımdan ayrı tutulur.
//
// TAHMİN
//   "gun"  : Haftanın günlerine göre — her gün için son 4 haftanın aynı günlerinin ortalaması
//            (o gün için veri yoksa son 7 günün ortalaması).
//   "ort7" : Her gün için son 7 günün ortalaması.
import { bugun, gunEkle, gunFarki } from "@/lib/tarih";

export type HareketTipi = "sayim" | "giris" | "cikis" | "duzeltme";
export type CikisNedeni = "skt" | "bozuk" | "iade" | "diger";
export type SayimVakti = "sabah" | "aksam";
export type TahminYontemi = "gun" | "ort7";

export const CIKIS_NEDENLERI: { v: CikisNedeni; l: string; fire: boolean }[] = [
  { v: "skt", l: "SKT geçti", fire: true },
  { v: "bozuk", l: "Bozuldu / hasarlı", fire: true },
  { v: "iade", l: "Tedarikçiye iade", fire: false },
  { v: "diger", l: "Diğer", fire: true },
];
export const nedenEtiketi = (n?: string | null) => CIKIS_NEDENLERI.find(x => x.v === n)?.l || "Çıkış";
export const GUN_ADLARI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export interface StokHareketi {
  urun_id: string; tarih: string; tip: HareketTipi | string;
  miktar: number; created_at?: string; neden?: string | null; birim_fiyat?: number | null;
  vakit?: string | null;
}

const EPOK = "2020-01-01";
/** Zaman çizelgesindeki konum (gün × 2): sabah sayımı = 2g, gün içi = 2g+1, akşam sayımı = 2g+2 */
export function konum(h: Pick<StokHareketi, "tarih" | "tip" | "vakit">): number {
  const g = gunFarki(EPOK, h.tarih) * 2;
  if (h.tip === "sayim") return h.vakit === "aksam" ? g + 2 : g;
  return g + 1;
}
const gunKonumu = (tarih: string) => gunFarki(EPOK, tarih) * 2;   // o günün sabahı
const konumdanTarih = (k: number) => gunEkle(EPOK, Math.floor(k / 2));

const sirala = (a: StokHareketi, b: StokHareketi) =>
  konum(a) - konum(b) || String(a.created_at || "").localeCompare(String(b.created_at || ""));

/** Sayım olmayan hareketin stok etkisi (+ giriş, − çıkış, ± düzeltme). */
const etki = (h: StokHareketi) =>
  h.tip === "giris" ? Number(h.miktar) : h.tip === "cikis" ? -Number(h.miktar) : h.tip === "duzeltme" ? Number(h.miktar) : 0;

const haftaGunu = (tarih: string) => new Date(tarih + "T12:00:00Z").getUTCDay();

export interface GunlukKullanim {
  tarih: string; kullanim: number;
  /** Bu gün tek başına sayılmadı; kullanım aradaki günlere bölünerek hesaplandı. */
  tahmini: boolean;
}

export interface KullanimAnalizi {
  gunler: GunlukKullanim[];
  tutarsizAraliklar: { bas: string; bit: string; fark: number }[];
  sonSayim: StokHareketi | null;
}

/** Ürünün sayımlardan çıkan günlük kullanım serisi. */
export function kullanimAnalizi(hareketler: StokHareketi[], urunId: string): KullanimAnalizi {
  const h = hareketler.filter(x => x.urun_id === urunId).sort(sirala);
  // Aynı ana denk gelen sayımlardan (ör. 20 akşam + 21 sabah) en son girilen geçerli sayılır.
  const sayimlar: StokHareketi[] = [];
  h.filter(x => x.tip === "sayim").forEach(s => {
    const son = sayimlar[sayimlar.length - 1];
    if (son && konum(son) === konum(s)) sayimlar[sayimlar.length - 1] = s;
    else sayimlar.push(s);
  });

  const gunler: GunlukKullanim[] = [];
  const tutarsizAraliklar: KullanimAnalizi["tutarsizAraliklar"] = [];
  for (let i = 1; i < sayimlar.length; i++) {
    const a = sayimlar[i - 1], b = sayimlar[i];
    const ka = konum(a), kb = konum(b);
    const gunSayisi = (kb - ka) / 2;   // sayım konumları hep çift, fark tam gün
    if (gunSayisi <= 0) continue;
    const arada = h.filter(x => x.tip !== "sayim" && konum(x) > ka && konum(x) < kb);
    const kullanim = Number(a.miktar) + arada.reduce((s, x) => s + etki(x), 0) - Number(b.miktar);
    if (kullanim < 0) {
      // Stok arttı ama giriş yok: mal girişi unutulmuş ya da sayım hatalı. Ortalamaya katılmaz.
      tutarsizAraliklar.push({ bas: a.tarih, bit: b.tarih, fark: -kullanim });
      continue;
    }
    for (let d = 0; d < gunSayisi; d++) {
      gunler.push({ tarih: konumdanTarih(ka + d * 2), kullanim: kullanim / gunSayisi, tahmini: gunSayisi > 1 });
    }
  }
  return { gunler, tutarsizAraliklar, sonSayim: sayimlar[sayimlar.length - 1] ?? null };
}

export interface OrtalamaSonucu { ortalama: number; veriGunu: number; pencere: number; }

/** Son N günün ortalama günlük kullanımı. Son 7 günde veri yoksa son 30 güne bakılır. */
export function ortalamaKullanim(analiz: KullanimAnalizi, gun = 7, bugunStr: string = bugun()): OrtalamaSonucu {
  const hesapla = (p: number) => {
    const bas = gunEkle(bugunStr, -p);
    const g = analiz.gunler.filter(x => x.tarih >= bas && x.tarih < bugunStr);
    return { ortalama: g.length ? g.reduce((s, x) => s + x.kullanim, 0) / g.length : 0, veriGunu: g.length, pencere: p };
  };
  const kisa = hesapla(gun);
  if (kisa.veriGunu > 0 || gun >= 30) return kisa;
  return hesapla(30);
}

/** Haftanın her günü için son 4 haftanın ortalaması (veri yoksa null). */
export function haftaGunuOrtalamalari(analiz: KullanimAnalizi, bugunStr: string = bugun()): (number | null)[] {
  const bas = gunEkle(bugunStr, -28);
  const toplam = Array(7).fill(0), adet = Array(7).fill(0);
  analiz.gunler.filter(x => x.tarih >= bas && x.tarih < bugunStr).forEach(x => {
    const w = haftaGunu(x.tarih); toplam[w] += x.kullanim; adet[w]++;
  });
  return toplam.map((t, i) => adet[i] ? t / adet[i] : null);
}

export interface Tahminci {
  /** Verilen gün için beklenen kullanım */
  gunluk: (tarih: string) => number;
  /** [bas, bit) aralığındaki toplam beklenen kullanım */
  aralik: (bas: string, bit: string) => number;
  ort7: OrtalamaSonucu;
  haftaGunleri: (number | null)[];
}

export function tahminci(analiz: KullanimAnalizi, yontem: TahminYontemi, bugunStr: string = bugun()): Tahminci {
  const ort7 = ortalamaKullanim(analiz, 7, bugunStr);
  const haftaGunleri = haftaGunuOrtalamalari(analiz, bugunStr);
  const gunluk = (tarih: string) => yontem === "gun" ? (haftaGunleri[haftaGunu(tarih)] ?? ort7.ortalama) : ort7.ortalama;
  const aralik = (bas: string, bit: string) => {
    let s = 0;
    for (let t = bas; t < bit; t = gunEkle(t, 1)) s += gunluk(t);
    return s;
  };
  return { gunluk, aralik, ort7, haftaGunleri };
}

export interface StokDurumu {
  sonSayimMiktar: number | null; sonSayimTarih: string | null; sonSayimVakti: SayimVakti | null;
  sonSayimdanBeriGun: number | null;
  sonrakiGiris: number; sonrakiCikis: number;
  /** Son sayım + sonraki girişler − çıkışlar − (son sayımdan bu sabaha kadar beklenen kullanım) */
  tahminiMevcut: number;
  ort7: OrtalamaSonucu;
  /** Seçilen yönteme göre bugünkü beklenen kullanım */
  bugunkuTahmin: number;
  kalanGun: number | null;
  tahmin: Tahminci;
}

/** Ürünün güncel tahmini durumu (bu sabah itibarıyla). */
export function stokDurumu(hareketler: StokHareketi[], urunId: string, bugunStr: string = bugun(), yontem: TahminYontemi = "gun"): StokDurumu {
  const analiz = kullanimAnalizi(hareketler, urunId);
  const t = tahminci(analiz, yontem, bugunStr);
  const son = analiz.sonSayim;
  const simdi = gunKonumu(bugunStr);
  let tahminiMevcut: number, sonrakiGiris = 0, sonrakiCikis = 0;
  if (!son) {
    tahminiMevcut = Math.max(hareketler.filter(x => x.urun_id === urunId).reduce((s, x) => s + etki(x), 0), 0);
  } else {
    const ks = konum(son);
    const sonra = hareketler.filter(x => x.urun_id === urunId && x.tip !== "sayim" && konum(x) > ks);
    sonrakiGiris = sonra.filter(x => x.tip === "giris").reduce((s, x) => s + Number(x.miktar), 0);
    sonrakiCikis = sonra.filter(x => x.tip === "cikis").reduce((s, x) => s + Number(x.miktar), 0);
    const duzeltme = sonra.filter(x => x.tip === "duzeltme").reduce((s, x) => s + Number(x.miktar), 0);
    // Son sayımdan bu sabaha kadar geçen günlerin beklenen kullanımı
    const gecenKullanim = ks < simdi ? t.aralik(konumdanTarih(ks), bugunStr) : 0;
    tahminiMevcut = Math.max(Number(son.miktar) + sonrakiGiris - sonrakiCikis + duzeltme - gecenKullanim, 0);
  }
  // Kaç gün yeter: bugünden ileriye gün gün düş
  let kalanGun: number | null = null;
  if (t.ort7.ortalama > 0 || t.haftaGunleri.some(x => x)) {
    // En fazla 120 güne kadar bakılır (120 = "120+ gün").
    let stok = tahminiMevcut, g = 0;
    while (g < 120) {
      const k = t.gunluk(gunEkle(bugunStr, g));
      if (stok < k) break;
      stok -= k; g++;
    }
    kalanGun = g;
  }
  return {
    sonSayimMiktar: son ? Number(son.miktar) : null, sonSayimTarih: son?.tarih ?? null,
    sonSayimVakti: son ? (son.vakit === "aksam" ? "aksam" : "sabah") : null,
    sonSayimdanBeriGun: son ? Math.max(gunFarki(son.tarih, bugunStr), 0) : null,
    sonrakiGiris, sonrakiCikis, tahminiMevcut, ort7: t.ort7,
    bugunkuTahmin: t.gunluk(bugunStr), kalanGun, tahmin: t,
  };
}

// ─── SİPARİŞ ────────────────────────────────────────────────────────────────
export interface SiparisAyari { siparisGunu: number; /** 0=Pazar … 2=Salı */ teslimGun: number; }
export const VARSAYILAN_SIPARIS: SiparisAyari = { siparisGunu: 2, teslimGun: 7 };

export interface SiparisPlani {
  siparisTarihi: string; varisTarihi: string; sonrakiVaris: string;
  /** Bugünden sonraki siparişin gelişine kadar beklenen kullanım */
  ihtiyac: number;
  oneri: number;
  /** Bu sipariş gelene kadar stok yetiyor mu? */
  varisaKadarYeter: boolean;
  varisaKadarKullanim: number;
  /** Bu dönemde gelecek, irsaliyesi girilmiş mal */
  yolda: number;
}

/**
 * Haftalık sipariş: siparişGünü'nde verilen sipariş teslimGun sonra gelir. Bu sipariş,
 * bir sonraki haftanın siparişi gelene kadar yetmeli:
 *   öneri = kullanım(bugün → sonraki varış) + min stok − tahmini stok
 * Not: Sipariş gününden önce o gün gelen malın girişi yapılmış olmalı.
 */
export interface YoldakiMal { miktar: number; beklenen_tarih: string | null; }

export function siparisPlani(d: StokDurumu, ayar: SiparisAyari, minStok: number, bugunStr: string = bugun(), yolda: YoldakiMal[] = []): SiparisPlani {
  const fark = (ayar.siparisGunu - haftaGunu(bugunStr) + 7) % 7;
  const siparisTarihi = gunEkle(bugunStr, fark);
  const varisTarihi = gunEkle(siparisTarihi, ayar.teslimGun);
  const sonrakiVaris = gunEkle(varisTarihi, 7);
  const varisaKadarKullanim = d.tahmin.aralik(bugunStr, varisTarihi);
  const ihtiyac = d.tahmin.aralik(bugunStr, sonrakiVaris);
  // Yoldaki mal (irsaliyesi girilmiş, henüz teslim alınmamış): bu dönemde gelecekse öneriden düşülür.
  // Tarihi belli değilse bu siparişin varışından önce geleceği varsayılır.
  const yoldaDonemde = yolda.filter(y => !y.beklenen_tarih || y.beklenen_tarih < sonrakiVaris).reduce((s, y) => s + y.miktar, 0);
  const yoldaVarisaKadar = yolda.filter(y => !y.beklenen_tarih || y.beklenen_tarih <= varisTarihi).reduce((s, y) => s + y.miktar, 0);
  return {
    siparisTarihi, varisTarihi, sonrakiVaris, ihtiyac, varisaKadarKullanim, yolda: yoldaDonemde,
    oneri: Math.max(ihtiyac + minStok - d.tahminiMevcut - yoldaDonemde, 0),
    varisaKadarYeter: d.tahminiMevcut + yoldaVarisaKadar >= varisaKadarKullanim,
  };
}

/** Sayım periyoduna göre sayım gecikmiş mi? */
export function sayimGecikti(periyot: string | null | undefined, sonSayimdanBeriGun: number | null): boolean {
  if (sonSayimdanBeriGun === null) return true;
  const sinir = periyot === "aylik" ? 31 : periyot === "haftalik" ? 7 : 1;
  return sonSayimdanBeriGun > sinir;
}

export interface CikisOzeti { toplam: number; fire: number; iade: number; fireTutar: number; nedenler: Record<string, number>; }

/** [bas, bit] aralığındaki çıkışlar; tutar kayıttaki ya da son alış fiyatıyla hesaplanır. */
export function cikisOzeti(hareketler: StokHareketi[], urunId: string, bas: string, bit: string, sonFiyat?: number | null): CikisOzeti {
  const c = hareketler.filter(x => x.urun_id === urunId && x.tip === "cikis" && x.tarih >= bas && x.tarih <= bit);
  const o: CikisOzeti = { toplam: 0, fire: 0, iade: 0, fireTutar: 0, nedenler: {} };
  c.forEach(x => {
    const m = Number(x.miktar);
    o.toplam += m;
    o.nedenler[x.neden || "diger"] = (o.nedenler[x.neden || "diger"] || 0) + m;
    if (x.neden === "iade") o.iade += m;
    else { o.fire += m; o.fireTutar += m * Number(x.birim_fiyat || sonFiyat || 0); }
  });
  return o;
}

/** Aralıktaki toplam kullanım (tahmini günler dahil). */
export function donemKullanimi(analiz: KullanimAnalizi, bas: string, bit: string) {
  const g = analiz.gunler.filter(x => x.tarih >= bas && x.tarih <= bit);
  return { toplam: g.reduce((s, x) => s + x.kullanim, 0), gun: g.length, tahminiGun: g.filter(x => x.tahmini).length };
}

/** "1.234,5" veya "1234.5" → sayı (miktar kutuları için). */
export const miktarOku = (s: string): number => {
  const t = (s || "").trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

/** Varsayılan sayım saati: sabah (akşam sayımında elle seçilir). */
export function varsayilanVakit(): SayimVakti {
  return "sabah";
}
