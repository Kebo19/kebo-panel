// ─── KEBO CİRO HESAPLARI ────────────────────────────────────────────────────
// Günlük rapor rakamlarının TEK kaynağı. Anasayfa, Kasa Raporu, Rapor Analiz,
// Kasa ve yazdırma/dışa aktarma çıktıları hep bu fonksiyonları kullanır.
//
// İş kuralları (Eylül 2026'da netleştirildi):
// • Platform tutarları (Yemeksepeti, Trendyol...) İNDİRİM ÖNCESİ girilir;
//   indirim net cirodan düşülür.
// • Kasa sayımı (nakit/POS/yemek kartı) günün nakit giderleri ödendikten SONRA
//   yapılır; bu yüzden gider brüt ciroya geri eklenir.
// • Kapıda ödeme:
//     - 13.08.2026 öncesi (kendi kuryelerimiz): kuryenin topladığı para gün sonu
//       kasa sayımına giriyordu → kasanın İÇİNDE, brüte ayrıca eklenmez.
//     - 13.08.2026 ve sonrası (Roadrunner): para Roadrunner'da kalır, haftalık
//       mutabakatla mahsup edilir → kasada YOK, brüte ayrıca eklenir.
// • Eski raporlar tek platform alanlarıyla (os_yemeksepeti...) girildi. Yeni
//   raporlarda marka bazlı alanlar (os_kebo_ys, os_cnf_ys...) var. Yeni yapıda
//   eski alanlar platform başına Kebo+CNF toplamıyla doldurulduğu için
//   os_chicknfride/ko_chicknfride ayrıca TOPLANMAZ (eskiden çift sayılıyordu).

export const ROADRUNNER_GECIS_GUNU = "2026-08-13";
/** Bu günden itibaren kapıda ödemeler kendi POS'umuz/kasamız üzerinden tahsil edilir (kasa sayımına girer). */
export const KENDI_POS_GECIS_GUNU = "2026-09-28";
export const ROADRUNNER_TAM_BASLANGIC = "2026-08-14";
export const KURYE_GARANTI_PAKET = 30;

export interface KuryeSatiri {
  id?: number; isim?: string; nakit?: string | number; pos?: string | number;
  paketSayisi?: string | number; uzakPaket?: string | number; paket9km?: string | number;
  tip?: "sabit" | "havuz" | "kendi";
}

/** Günlük rapor satırı — hesaplar için gereken alanlar (hepsi opsiyonel/0 olabilir). */
export interface RaporVerisi {
  tarih: string;
  toplam_ciro?: number | null;
  // Eski (tek platform) alanlar
  os_yemeksepeti?: number | null; os_getir?: number | null; os_trendyol?: number | null; os_migros?: number | null; os_chicknfride?: number | null;
  ko_yemeksepeti?: number | null; ko_getir?: number | null; ko_trendyol?: number | null; ko_migros?: number | null; ko_alo_paket?: number | null; ko_chicknfride?: number | null;
  // Marka bazlı alanlar
  os_kebo_ys?: number | null; os_kebo_trendyol?: number | null; os_kebo_migros?: number | null;
  os_cnf_ys?: number | null; os_cnf_trendyol?: number | null; os_cnf_migros_yemek?: number | null;
  ko_kebo_ys?: number | null; ko_kebo_trendyol?: number | null; ko_kebo_migros_yemek?: number | null; ko_kebo_alo?: number | null;
  ko_cnf_ys?: number | null; ko_cnf_trendyol?: number | null; ko_cnf_migros_yemek?: number | null; ko_cnf_alo?: number | null;
  // İndirimler
  os_kebo_ys_indirim?: number | null; os_kebo_trendyol_indirim?: number | null;
  os_cnf_ys_indirim?: number | null; os_cnf_trendyol_indirim?: number | null;
  os_kebo_migros_indirim?: number | null; os_cnf_migros_yemek_indirim?: number | null; os_kebo_alo_indirim?: number | null;
  os_kebo_alo?: number | null; os_kebo_alo_paket?: number | null;
  ko_kebo_ys_indirim?: number | null; ko_kebo_trendyol_indirim?: number | null;
  ko_cnf_ys_indirim?: number | null; ko_cnf_trendyol_indirim?: number | null;
  // Kasa, gider, iade
  kasa_nakit?: number | null; kasa_pos?: number | null; kasa_edenred?: number | null; kasa_metropol?: number | null;
  kasa_setcard?: number | null; kasa_pluxee?: number | null; kasa_paye?: number | null;
  gunluk_gider?: number | null; iade_tutar?: number | null;
  kurye_raporlari?: KuryeSatiri[] | null;
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};
const tamSayi = (v: unknown): number => {
  const x = parseInt(String(v ?? ""), 10);
  return Number.isFinite(x) ? x : 0;
};

/** Rapor marka bazlı yeni yapıyla mı girilmiş? */
export function yeniYapiMi(r: RaporVerisi): boolean {
  return [
    r.os_kebo_ys, r.os_kebo_trendyol, r.os_kebo_migros, r.os_kebo_alo, r.os_cnf_ys, r.os_cnf_trendyol, r.os_cnf_migros_yemek,
    r.ko_kebo_ys, r.ko_kebo_trendyol, r.ko_kebo_migros_yemek, r.ko_kebo_alo,
    r.ko_cnf_ys, r.ko_cnf_trendyol, r.ko_cnf_migros_yemek, r.ko_cnf_alo,
  ].some(v => n(v) !== 0);
}

/**
 * Kapıda ödeme o gün kasa sayımının içinde mi?
 *   13.08.2026 öncesi: evet (kendi kuryelerimiz topluyordu)
 *   13.08–27.09.2026: hayır (Roadrunner'da kalıyordu, brüte ayrıca eklenir)
 *   28.09.2026 ve sonrası: evet (kendi POS'umuz; nakit ve kart kasaya girer)
 */
export const kapidaKasadaMi = (tarih: string): boolean =>
  !!tarih && (tarih < ROADRUNNER_GECIS_GUNU || tarih >= KENDI_POS_GECIS_GUNU);

export interface PlatformKirilimi {
  // platform → tutar
  online: Record<PlatformAdi, number>;
  kapida: Record<PlatformAdi, number>;
  marka: { kebo: number; cnf: number; bilinmiyor: number };
}
export type PlatformAdi = "Yemeksepeti" | "Trendyol" | "Migros" | "Getir" | "Alo Paket" | "Chick'N Fride";
export const PLATFORMLAR: PlatformAdi[] = ["Yemeksepeti", "Trendyol", "Migros", "Alo Paket", "Getir", "Chick'N Fride"];
export const PLATFORM_RENK: Record<PlatformAdi, string> = {
  Yemeksepeti: "#FF6B35", Trendyol: "#F97316", Migros: "#10B981", "Alo Paket": "#3B82F6", Getir: "#8B5CF6", "Chick'N Fride": "#EF4444",
};

const bosPlatform = (): Record<PlatformAdi, number> =>
  ({ Yemeksepeti: 0, Trendyol: 0, Migros: 0, Getir: 0, "Alo Paket": 0, "Chick'N Fride": 0 });

/**
 * Platform ve marka kırılımı. Eski raporlarda Chick'N Fride tek bir kalem
 * olarak girildiği için "Chick'N Fride" adıyla ayrı görünür; yeni raporlarda
 * CNF satışları gerçek platformlarına (Yemeksepeti, Trendyol...) dağıtılır.
 */
export function platformKirilimi(r: RaporVerisi): PlatformKirilimi {
  const online = bosPlatform(), kapida = bosPlatform();
  const marka = { kebo: 0, cnf: 0, bilinmiyor: 0 };
  if (yeniYapiMi(r)) {
    online.Yemeksepeti = n(r.os_kebo_ys) + n(r.os_cnf_ys);
    online.Trendyol = n(r.os_kebo_trendyol) + n(r.os_cnf_trendyol);
    online.Migros = n(r.os_kebo_migros) + n(r.os_cnf_migros_yemek);
    kapida.Yemeksepeti = n(r.ko_kebo_ys) + n(r.ko_cnf_ys);
    kapida.Trendyol = n(r.ko_kebo_trendyol) + n(r.ko_cnf_trendyol);
    kapida.Migros = n(r.ko_kebo_migros_yemek) + n(r.ko_cnf_migros_yemek);
    kapida["Alo Paket"] = n(r.ko_kebo_alo) + n(r.ko_cnf_alo);
    online["Alo Paket"] = n(r.os_kebo_alo);
    marka.kebo = n(r.os_kebo_ys) + n(r.os_kebo_trendyol) + n(r.os_kebo_migros) + n(r.os_kebo_alo)
      + n(r.ko_kebo_ys) + n(r.ko_kebo_trendyol) + n(r.ko_kebo_migros_yemek) + n(r.ko_kebo_alo);
    marka.cnf = n(r.os_cnf_ys) + n(r.os_cnf_trendyol) + n(r.os_cnf_migros_yemek)
      + n(r.ko_cnf_ys) + n(r.ko_cnf_trendyol) + n(r.ko_cnf_migros_yemek) + n(r.ko_cnf_alo);
  } else {
    online.Yemeksepeti = n(r.os_yemeksepeti); online.Trendyol = n(r.os_trendyol);
    online.Migros = n(r.os_migros); online.Getir = n(r.os_getir); online["Chick'N Fride"] = n(r.os_chicknfride);
    kapida.Yemeksepeti = n(r.ko_yemeksepeti); kapida.Trendyol = n(r.ko_trendyol);
    kapida.Migros = n(r.ko_migros); kapida.Getir = n(r.ko_getir); kapida["Alo Paket"] = n(r.ko_alo_paket);
    kapida["Chick'N Fride"] = n(r.ko_chicknfride);
    marka.cnf = n(r.os_chicknfride) + n(r.ko_chicknfride);
    const toplam = Object.values(online).reduce((a, b) => a + b, 0) + Object.values(kapida).reduce((a, b) => a + b, 0);
    marka.kebo = toplam - marka.cnf;
  }
  return { online, kapida, marka };
}

const topla = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export const onlineToplam = (r: RaporVerisi): number => topla(platformKirilimi(r).online);
export const kapidaToplam = (r: RaporVerisi): number => topla(platformKirilimi(r).kapida);
/** Kasaya giren yemek kartları (veritabanı kolonu → görünen ad). Yeni kart eklemek için buraya + kolona ekleyin. */
export const YEMEK_KARTLARI = [
  { alan: "kasa_edenred", ad: "Edenred" },
  { alan: "kasa_metropol", ad: "Metropol" },
  { alan: "kasa_setcard", ad: "Setcard" },
  { alan: "kasa_pluxee", ad: "Pluxee" },
  { alan: "kasa_paye", ad: "Paye" },
] as const;
export type YemekKartiAlani = typeof YEMEK_KARTLARI[number]["alan"];

export const yemekKartiToplam = (r: Partial<Record<YemekKartiAlani, unknown>>): number =>
  YEMEK_KARTLARI.reduce((t, k) => t + n(r[k.alan]), 0);
export const kasaToplam = (r: RaporVerisi): number =>
  n(r.kasa_nakit) + n(r.kasa_pos) + yemekKartiToplam(r);
export const giderToplam = (r: RaporVerisi): number => n(r.gunluk_gider);
export const iadeToplam = (r: RaporVerisi): number => n(r.iade_tutar);
export const indirimToplam = (r: RaporVerisi): number =>
  n(r.os_kebo_ys_indirim) + n(r.os_kebo_trendyol_indirim) + n(r.os_cnf_ys_indirim) + n(r.os_cnf_trendyol_indirim)
  + n(r.os_kebo_migros_indirim) + n(r.os_cnf_migros_yemek_indirim) + n(r.os_kebo_alo_indirim)
  + n(r.ko_kebo_ys_indirim) + n(r.ko_kebo_trendyol_indirim) + n(r.ko_cnf_ys_indirim) + n(r.ko_cnf_trendyol_indirim);

/**
 * BRÜT CİRO = Online + Kasa + Gider (+ Kapıda, eğer kapıda parası kasaya girmiyorsa)
 * Bu değer rapor kaydedilirken `toplam_ciro` alanına da yazılır.
 */
export function brutCiro(r: RaporVerisi): number {
  const kapida = kapidaKasadaMi(r.tarih) ? 0 : kapidaToplam(r);
  return onlineToplam(r) + kapida + kasaToplam(r) + giderToplam(r);
}

/** NET CİRO = Brüt − Gider − İade − Platform indirimleri */
export function netCiro(r: RaporVerisi): number {
  return brutCiro(r) - giderToplam(r) - iadeToplam(r) - indirimToplam(r);
}

/** Bir kurye satırının gerçek teslim ettiği paket (normal + uzak + 9km üzeri). */
export function kuryeGercekPaket(k: KuryeSatiri): number {
  return tamSayi(k.paketSayisi) + tamSayi(k.uzakPaket) + tamSayi(k.paket9km);
}

/** Günün toplam teslim edilen paket sayısı (tüm kuryeler, tüm mesafeler). */
export function paketToplam(r: RaporVerisi): number {
  return (r.kurye_raporlari || []).reduce((s, k) => s + kuryeGercekPaket(k), 0);
}

/** Paket başı ortalama sepet = platform satışı (online + kapıda) / paket */
export function sepetOrtalamasi(platformCiro: number, paket: number): number {
  return paket > 0 ? platformCiro / paket : 0;
}

export interface RaporOzeti {
  online: number; kapida: number; kasa: number; gider: number; iade: number; indirim: number;
  brut: number; net: number; paket: number; platformCiro: number;
}

/** Tek raporun tüm özet rakamları. */
export function raporOzeti(r: RaporVerisi): RaporOzeti {
  const online = onlineToplam(r), kapida = kapidaToplam(r);
  return {
    online, kapida, kasa: kasaToplam(r), gider: giderToplam(r), iade: iadeToplam(r), indirim: indirimToplam(r),
    brut: brutCiro(r), net: netCiro(r), paket: paketToplam(r), platformCiro: online + kapida,
  };
}

/** Birden çok raporun toplamı. */
export function donemOzeti(raporlar: RaporVerisi[]): RaporOzeti & { gunSayisi: number; enYuksekBrut: number; enYuksekTarih: string | null } {
  const t: RaporOzeti = { online: 0, kapida: 0, kasa: 0, gider: 0, iade: 0, indirim: 0, brut: 0, net: 0, paket: 0, platformCiro: 0 };
  let enYuksekBrut = 0; let enYuksekTarih: string | null = null;
  for (const r of raporlar) {
    const o = raporOzeti(r);
    (Object.keys(t) as (keyof RaporOzeti)[]).forEach(k => { t[k] += o[k]; });
    if (o.brut > enYuksekBrut) { enYuksekBrut = o.brut; enYuksekTarih = r.tarih; }
  }
  return { ...t, gunSayisi: raporlar.length, enYuksekBrut, enYuksekTarih };
}

// ─── ROADRUNNER ─────────────────────────────────────────────────────────────
export const RR_PAKET_UCRETI = 100;      // ₺ / normal (1x) paket
export const RR_UZAK_KATSAYI = 1.5;      // uzak paketler
export const RR_KM9_KATSAYI = 2;         // 9km üzeri paketler
export const RR_POS_KOMISYON_ORANI = 0.05;

/**
 * Bir kurye satırı Roadrunner'a ücretlendirilir mi?
 * Sadece 13.08.2026 ve sonrasındaki "sabit" ve "havuz" kuryeler. Kendi
 * personel kuryelerimiz ("kendi" ya da tipi olmayan eski satırlar) hariç.
 */
export function roadrunnerKuryesiMi(tarih: string, k: KuryeSatiri): boolean {
  return tarih >= ROADRUNNER_GECIS_GUNU && (k.tip === "sabit" || k.tip === "havuz");
}

export function roadrunnerKuryeUcreti(k: KuryeSatiri) {
  const sabit = k.tip === "sabit";
  const normal = tamSayi(k.paketSayisi), uzak = tamSayi(k.uzakPaket), km9 = tamSayi(k.paket9km);
  const gercek = normal + uzak + km9;
  const uygulanan = sabit ? Math.max(gercek, KURYE_GARANTI_PAKET) : gercek;
  const garantiFarki = uygulanan - gercek;
  const ucret = normal * RR_PAKET_UCRETI + uzak * RR_PAKET_UCRETI * RR_UZAK_KATSAYI
    + km9 * RR_PAKET_UCRETI * RR_KM9_KATSAYI + garantiFarki * RR_PAKET_UCRETI;
  return { sabit, normal, uzak, km9, gercek, uygulanan, garantiFarki, ucret, nakit: n(k.nakit), pos: n(k.pos) };
}
