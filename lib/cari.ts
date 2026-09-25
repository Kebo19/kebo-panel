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
export const HESAP_ETIKET: Record<string, string> = { Nakit: "Nakit Kasa", TEB: "TEB", VakıfBank: "VakıfBank", Enpara: "Enpara" };
