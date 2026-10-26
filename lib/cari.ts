// ─── CARİ ÖDEME DÖNEMİ ──────────────────────────────────────────────────────
// Tedarikçi faturaları aylık dönemlerle ödenir:
//   dönem = önceki ayın 16'sı → bu ayın 15'i, ödeme günü = bu ayın 25'i
//   (25'i hafta sonu/tatil ise ilk iş günü).
// Ödeme günü geçtiyse "bu ay ödenecekler" artık bir sonraki dönemi gösterir.
import { bugun, yerelTarih } from "@/lib/tarih";

const SABIT_TATILLER = (y: number) => [
  `${y}-01-01`, `${y}-04-23`, `${y}-05-01`, `${y}-05-19`,
  `${y}-07-15`, `${y}-08-30`, `${y}-10-29`,
];
// Dini bayramlar her yıl değişir — 2027 tarihleri resmî takvim açıklanınca buraya eklenmeli.
const DINI_TATILLER = [
  "2025-03-30", "2025-03-31", "2025-04-01",
  "2025-06-06", "2025-06-07", "2025-06-08", "2025-06-09",
  "2026-03-19", "2026-03-20", "2026-03-21",
  "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29",
];

export function tatilMi(t: Date): boolean {
  const g = t.getDay();
  if (g === 0 || g === 6) return true;
  // toISOString UTC'ye çevirdiği için bir gün geriye kayıyordu; yerel tarih kullanılıyor.
  const s = yerelTarih(t);
  return SABIT_TATILLER(t.getFullYear()).includes(s) || DINI_TATILLER.includes(s);
}

export function ilkIsGunu(t: Date): Date {
  const d = new Date(t);
  while (tatilMi(d)) d.setDate(d.getDate() + 1);
  return d;
}

export interface OdemeDonemi {
  donemBas: string; donemBit: string; vade: Date; vadeStr: string;
}

function donemHesapla(yil: number, ay0: number): OdemeDonemi {
  const pad = (n: number) => String(n).padStart(2, "0");
  const oncekiYil = ay0 === 0 ? yil - 1 : yil;
  const oncekiAy0 = ay0 === 0 ? 11 : ay0 - 1;
  const vade = ilkIsGunu(new Date(yil, ay0, 25));
  return {
    donemBas: `${oncekiYil}-${pad(oncekiAy0 + 1)}-16`,
    donemBit: `${yil}-${pad(ay0 + 1)}-15`,
    vade,
    vadeStr: vade.toLocaleDateString("tr-TR", { day: "numeric", month: "long" }),
  };
}

/** Şu an ödenmesi gereken dönem. Bu ayın ödeme günü geçtiyse bir sonraki ayın dönemi. */
export function buAyinOdemeDonemi(bugunStr: string = bugun()): OdemeDonemi {
  const [y, m] = bugunStr.split("-").map(Number);
  const buAy = donemHesapla(y, m - 1);
  if (bugunStr > yerelTarih(buAy.vade)) {
    return m === 12 ? donemHesapla(y + 1, 0) : donemHesapla(y, m);
  }
  return buAy;
}

/** Faturanın ekranda görünen durumu: ödenmediyse ve dönemi geçtiyse "gecikti". */
export function faturaDurumHesapla(faturaTarihi: string, mevcutDurum: string, donem: OdemeDonemi = buAyinOdemeDonemi()): string {
  if (mevcutDurum === "odendi") return "odendi";
  if (faturaTarihi < donem.donemBas) return "gecikti";
  return "bekliyor";
}

/** Kasa & cari ödemelerinde seçilebilen hesaplar (Kasa sayfasındaki bakiyelerle aynı). */
export const ODEME_HESAPLARI = ["Nakit", "TEB", "VakıfBank", "Enpara"] as const;
export const HESAP_ETIKET: Record<string, string> = {
  Nakit: "Nakit Kasa", TEB: "TEB", VakıfBank: "VakıfBank", Enpara: "Enpara",
  "TEB Kredi Kartı": "TEB Kredi Kartı", "Enpara Kredi Kartı": "Enpara Kredi Kartı",
};
/** Kredi kartları (kredi_kartlari tablosundaki adlar). Karttan ödeme kartın borcunu artırır. */
export const KART_HESAPLARI = ["TEB Kredi Kartı", "Enpara Kredi Kartı"] as const;
/** Gider / ödeme yapılabilecek bütün hesaplar */
export const GIDER_HESAPLARI = [...ODEME_HESAPLARI, ...KART_HESAPLARI] as const;
export const kartMi = (h: string) => (KART_HESAPLARI as readonly string[]).includes(h);

// ─── CARİ ÖDEME YÖNTEMLERİ ──────────────────────────────────────────────────
// Hesaplardan (Nakit/TEB/VakıfBank/Enpara/kredi kartları) biri seçilirse ödeme Kasa'ya otomatik gider
// hareketi olarak yazılır (veritabanı trigger'ı; ödeme güncellenince/silinince kasa hareketi de güncellenir).
// Kasaya yansımadan fatura kapatma yöntemleri (hesap boş kaydedilir → kasa hareketi oluşmaz):
//  • Hakedişten Mahsup: Yemeksepeti / Getir / Migros / Trendyol gibi platform faturaları online hakedişten kesilir.
//  • Hatır Faturası: KDV için kesilen, karşılığında ödeme yapılmayan faturalar (kâr/zarara da girmez).
export const HAKEDIS_MAHSUP = "Hakedişten Mahsup";
export const HATIR_FATURASI = "Hatır Faturası (ödemesiz)";
export const KASASIZ_YONTEMLER = [HAKEDIS_MAHSUP, HATIR_FATURASI] as const;
export const kasasizMi = (y: string) => (KASASIZ_YONTEMLER as readonly string[]).includes(y);
export const ODEME_SECENEKLERI = [...GIDER_HESAPLARI, ...KASASIZ_YONTEMLER, "Çek", "Diğer"] as const;

/** Seçilen ödeme yönteminden cari_odemeler kaydının `odeme_yontemi` ve `hesap` alanları */
export function odemeKaydiAlanlari(yontem: string): { odeme_yontemi: string; hesap: string | null } {
  const hesap = !kasasizMi(yontem) && (GIDER_HESAPLARI as readonly string[]).includes(yontem) ? yontem : null;
  return {
    odeme_yontemi: hesap && kartMi(hesap) ? `Kredi Kartı (${hesap})` : hesap && hesap !== "Nakit" ? `Banka (${hesap})` : yontem,
    hesap,
  };
}

// ─── CARİ BAKİYE ────────────────────────────────────────────────────────────
// Borç = carinin tüm faturaları − tüm ödemeleri (cari hesap). Fatura durumları (ödendi/bekliyor) veritabanında
// bu bakiyeden otomatik hesaplanır (cari_durum_esitle): bir ödemeye bağlı faturalar ödendi, diğerlerinde
// ödemeler en eski faturayı kapatır. Açık faturaların toplamı borçtan fazlaysa fark, en eski açık faturanın
// ödenmiş kısmıdır.
export interface BakiyeFatura { fatura_tarihi: string; fatura_no?: string | null; toplam_tutar: number | string | null; durum: string }
const yuv = (n: number) => Math.round(n * 100) / 100;

export function cariBorcu(faturalar: { toplam_tutar: number | string | null }[], odemeler: { tutar: number | string | null }[]): number {
  return yuv(faturalar.reduce((t, f) => t + (Number(f.toplam_tutar) || 0), 0) - odemeler.reduce((t, o) => t + (Number(o.tutar) || 0), 0));
}

/** Verilen tarihe kadar kesilmiş açık faturalardan ödenmesi gereken (kısmi ödenmiş kısım en eskiden düşülür) */
export function tariheKadarOdenecek(faturalar: BakiyeFatura[], borc: number, sonTarih: string): number {
  const acik = faturalar.filter(f => f.durum !== "odendi")
    .sort((a, b) => a.fatura_tarihi.localeCompare(b.fatura_tarihi) || String(a.fatura_no || "").localeCompare(String(b.fatura_no || "")));
  let odenmis = Math.max(0, acik.reduce((t, f) => t + (Number(f.toplam_tutar) || 0), 0) - Math.max(0, borc));
  let toplam = 0;
  for (const f of acik) {
    let kalan = Number(f.toplam_tutar) || 0;
    const d = Math.min(kalan, odenmis); kalan -= d; odenmis -= d;
    if (f.fatura_tarihi <= sonTarih) toplam += kalan;
  }
  return yuv(Math.max(0, toplam));
}
