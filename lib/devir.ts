// ─── AY DEVRİ ───────────────────────────────────────────────────────────────
// Program 1 Ekim 2026'da kullanıma alındı. Öncesinde günlük rapor (ciro) olmadığı
// için o ayların kâr/zararı anlamsızdır; faturalar ve cari ödemeler ise geçmişten
// beri işlendi. Bu yüzden:
// • Kâr/zarar ve ay devri sadece KULLANIM_BASLANGIC ve sonrası için gösterilir.
// • Tedarikçi borcu başlangıçta "açılış borcu" ile devralınır (devir_acilis tablosu,
//   veritabanında cari_borc_bakiyesi(tarih) fonksiyonu hesaplar).
//
// Ay devri:
//   Devreden borç + bu ayın faturaları − bu ay yapılan cari ödemeler = sonraki aya devreden borç
//   İşletme kârı − borçtaki azalma (devreden − ay sonu) = ay sonunda elde kalan
// Örnek: 300 bin borç devraldı, ay 400 bin kâr etti, bu ayın faturalarıyla birlikte eski
// 300 bini de ödedi → borç 0'a indi (300 bin azaldı) → elde kalan 400 − 300 = 100 bin.

export const KULLANIM_BASLANGIC = "2026-10-01";
export const BASLANGIC_AYI = KULLANIM_BASLANGIC.slice(0, 7);

/** "YYYY-AA" program kullanımdayken mi? (başlangıç ayı ve sonrası) */
export const kullanimdaMi = (ay: string): boolean => ay >= BASLANGIC_AYI;

/** "2026-10" → "2026-11-01" (sonraki ayın ilk günü) */
export function sonrakiAyBasi(ay: string): string {
  const [y, m] = ay.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const num = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};
const yuvarla = (v: number) => Math.round(v * 100) / 100;

export interface AyDevriGirdi {
  /** Ayın ilk günündeki tedarikçi borcu (cari_borc_bakiyesi(ay başı)) */
  devredenBorc: number;
  /** Bu ay tarihli faturaların toplamı (KDV dahil) */
  buAyFatura: number;
  /** Bu ay yapılan cari ödemelerin toplamı */
  buAyOdeme: number;
  /** Bu ayın işletme kârı (lib/karZarar) */
  isletmeKari: number;
}

export interface AyDevriSonuc extends AyDevriGirdi {
  /** Sonraki aya devreden borç */
  aySonuBorc: number;
  /** Devreden − ay sonu (pozitif: borç azaldı, negatif: borç arttı) */
  borcAzalisi: number;
  /** İşletme kârı − borç azalışı */
  eldeKalan: number;
}

export function ayDevri(g: AyDevriGirdi): AyDevriSonuc {
  const devredenBorc = yuvarla(num(g.devredenBorc));
  const buAyFatura = yuvarla(num(g.buAyFatura));
  const buAyOdeme = yuvarla(num(g.buAyOdeme));
  const isletmeKari = yuvarla(num(g.isletmeKari));
  const aySonuBorc = yuvarla(devredenBorc + buAyFatura - buAyOdeme);
  const borcAzalisi = yuvarla(devredenBorc - aySonuBorc);
  return { devredenBorc, buAyFatura, buAyOdeme, isletmeKari, aySonuBorc, borcAzalisi, eldeKalan: yuvarla(isletmeKari - borcAzalisi) };
}
