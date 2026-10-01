// ─── KASA: KREDİ KARTLARI VE YEMEK KARTI ALACAKLARI ────────────────────────
import { YEMEK_KARTLARI } from "./hesap";
import { YEMEK_KARTI_KATEGORI, yemekKartiBul } from "./mutabakat";

/** Nakit ve banka hesapları (bakiyesi pozitif varlık). */
export const BANKA_HESAPLARI = ["Nakit", "TEB", "VakıfBank", "Enpara"] as const;

/**
 * Kredi kartları kredi_kartlari tablosunda. Kartın adı kasa_manuel_islemler.hesap olarak kullanılır:
 *   gider (hesap = kart)               → borç artar
 *   transfer (hedef_hesap = kart)      → borç ödemesi, borç azalır
 *   gelir (hesap = kart)               → iade, borç azalır
 *   transfer (hesap = kart)            → karttan nakit avans / virman, borç artar
 */
export interface KrediKarti {
  id: string;
  ad: string;
  banka: string;
  kart_limiti: number;
  hesap_kesim_gunu: number | null;
  son_odeme_gunu: number | null;
  acilis_borcu: number;
  acilis_tarihi: string;
  aktif: boolean;
  sira: number;
}

/** Veritabanında kart tablosu yoksa (göç uygulanmadan) kullanılan varsayılanlar. */
export const VARSAYILAN_KARTLAR = ["TEB Kredi Kartı", "Enpara Kredi Kartı"];

export interface Hareket {
  tip: "gelir" | "gider" | "transfer";
  hesap: string;
  hedef_hesap?: string | null;
  tutar: number | string;
  islem_tarihi: string;
  kategori?: string | null;
  aciklama?: string | null;
}

const sayi = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Ayın son gününü aşmayacak şekilde o ayın `gun`'ü. */
function ayinGunu(yil: number, ay0: number, gun: number): string {
  const son = new Date(Date.UTC(yil, ay0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(yil, ay0, Math.min(gun, son))).toISOString().slice(0, 10);
}

/** Bugünden önceki (veya bugünkü) en son hesap kesim tarihi. */
export function sonKesimTarihi(bugun: string, kesimGunu: number): string {
  const y = Number(bugun.slice(0, 4)), m = Number(bugun.slice(5, 7)) - 1;
  const buAy = ayinGunu(y, m, kesimGunu);
  return buAy <= bugun ? buAy : ayinGunu(y, m - 1, kesimGunu);
}

/** Son kesimden sonraki son ödeme tarihi (kesim gününden sonraki ilk `odemeGunu`). */
export function sonOdemeTarihi(kesim: string, odemeGunu: number): string {
  const y = Number(kesim.slice(0, 4)), m = Number(kesim.slice(5, 7)) - 1;
  const ayni = ayinGunu(y, m, odemeGunu);
  return ayni > kesim ? ayni : ayinGunu(y, m + 1, odemeGunu);
}

export const gunFarki = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

export interface KartDurumu {
  kart: KrediKarti;
  borc: number;
  kullanilabilir: number;
  /** 0–1 arası; limit girilmemişse null */
  kullanimOrani: number | null;
  /** Açılıştan bu yana net harcama (iadeler düşülmüş) */
  harcama: number;
  /** Açılıştan bu yana bankadan yapılan ödemeler */
  odeme: number;
  /** Son hesap kesiminden bu yana yapılan harcama (bir sonraki ekstreye girecek) */
  donemHarcama: number;
  /** Son kesimdeki borç (son ödeme tarihine kadar ödenmesi gereken), ödemeler düşülmüş */
  ekstreBorcu: number | null;
  sonKesim: string | null;
  sonOdeme: string | null;
  sonrakiKesim: string | null;
  /** Son ödeme tarihine kalan gün (geçtiyse negatif) */
  odemeyeKalan: number | null;
}

export function krediKartiDurumu(kart: KrediKarti, hareketler: Hareket[], bugun: string): KartDurumu {
  let harcama = 0, odeme = 0, kesimeKadarHarcama = 0, kesimSonrasiOdeme = 0, kesimSonrasiHarcama = 0;
  const sonKesim = kart.hesap_kesim_gunu ? sonKesimTarihi(bugun, kart.hesap_kesim_gunu) : null;
  for (const h of hareketler) {
    if (!h.islem_tarihi || h.islem_tarihi < kart.acilis_tarihi) continue;
    const t = sayi(h.tutar);
    // artış: harcama / nakit avans; iade: karta gelen iade; ödeme: bankadan karta transfer
    let artis = 0, iade = 0, odemeT = 0;
    if (h.hesap === kart.ad && (h.tip === "gider" || h.tip === "transfer")) artis = t;
    else if (h.hesap === kart.ad && h.tip === "gelir") iade = t;
    else if (h.tip === "transfer" && h.hedef_hesap === kart.ad) odemeT = t;
    harcama += artis - iade; odeme += odemeT;
    if (sonKesim) {
      if (h.islem_tarihi <= sonKesim) kesimeKadarHarcama += artis - iade - odemeT;
      // Kesimden sonraki iade bir sonraki ekstreye yansır; ekstre borcunu yalnızca ödemeler azaltır
      else { kesimSonrasiOdeme += odemeT; kesimSonrasiHarcama += artis - iade; }
    }
  }
  const borc = sayi(kart.acilis_borcu) + harcama - odeme;
  const limit = sayi(kart.kart_limiti);
  const sonOdeme = sonKesim && kart.son_odeme_gunu ? sonOdemeTarihi(sonKesim, kart.son_odeme_gunu) : null;
  const ekstreBorcu = sonKesim
    ? Math.max(0, (kart.acilis_tarihi <= sonKesim ? sayi(kart.acilis_borcu) : 0) + kesimeKadarHarcama - kesimSonrasiOdeme)
    : null;
  return {
    kart, borc, harcama, odeme,
    kullanilabilir: limit - borc,
    kullanimOrani: limit > 0 ? Math.max(0, borc) / limit : null,
    donemHarcama: sonKesim ? kesimSonrasiHarcama : harcama,
    ekstreBorcu,
    sonKesim,
    sonOdeme,
    sonrakiKesim: sonKesim && kart.hesap_kesim_gunu
      ? ayinGunu(Number(sonKesim.slice(0, 4)), Number(sonKesim.slice(5, 7)), kart.hesap_kesim_gunu)
      : null,
    odemeyeKalan: sonOdeme ? gunFarki(bugun, sonOdeme) : null,
  };
}

// ─── YEMEK KARTI ALACAKLARI ─────────────────────────────────────────────────

export interface YemekKartiAlacagi {
  ad: string;
  alan: string;
  /** Başlangıçtan bu yana raporlara girilen satış */
  satis: number;
  /** Bankaya yatan (kategori "Yemek Kartı Tahsilatı", açıklamadan karta eşlenen) */
  yatan: number;
  /** satış − yatan: henüz yatmamış tutar (komisyon kesintisi de bunun içinde kalır) */
  bekleyen: number;
  /** Bu ayki satış */
  buAySatis: number;
}

/**
 * Her yemek kartı için açılıştan bu yana satış, yatan ve bekleyen tutar.
 * Kart, tahsilatın açıklamasından bulunur (POS & Kart mutabakatıyla aynı kural).
 */
export function yemekKartiAlacaklari(
  raporlar: { tarih: string }[],
  hareketler: Hareket[],
  baslangic: string,
  buAy: string,
): { kartlar: YemekKartiAlacagi[]; belirsizYatan: number; toplamBekleyen: number } {
  const kartlar: YemekKartiAlacagi[] = YEMEK_KARTLARI.map(k => ({ ad: k.ad, alan: k.alan, satis: 0, yatan: 0, bekleyen: 0, buAySatis: 0 }));
  const bul = (ad: string) => kartlar.find(k => k.ad === ad);
  for (const r of raporlar) {
    if (!r.tarih || r.tarih < baslangic) continue;
    for (const k of kartlar) {
      const v = sayi((r as Record<string, unknown>)[k.alan]);
      k.satis += v;
      if (r.tarih.slice(0, 7) === buAy) k.buAySatis += v;
    }
  }
  let belirsizYatan = 0;
  for (const h of hareketler) {
    if (h.tip !== "gelir" || h.kategori !== YEMEK_KARTI_KATEGORI || !h.islem_tarihi || h.islem_tarihi < baslangic) continue;
    const kart = yemekKartiBul(h.aciklama);
    const k = kart ? bul(kart) : undefined;
    if (k) k.yatan += sayi(h.tutar); else belirsizYatan += sayi(h.tutar);
  }
  for (const k of kartlar) k.bekleyen = k.satis - k.yatan;
  const toplamBekleyen = kartlar.reduce((t, k) => t + k.bekleyen, 0) - belirsizYatan;
  return { kartlar, belirsizYatan, toplamBekleyen };
}
