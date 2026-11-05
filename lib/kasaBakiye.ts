// ─── KASA / BANKA BAKİYELERİ ────────────────────────────────────────────────
// Kasa & Finans ve Gelir Gider sayfası aynı hesabı kullanır.
// Nakit Kasa = 1 Kasım'dan itibaren raporlardaki nakit sayımları + sabit kuryelerin getirdiği nakit + hareketler.
// Bankalar = hareketler. VakıfBank'a ayrıca ekstrede henüz görünmeyen POS (ertesi gün, %2 komisyonla) eklenir.

import { kuryeTahsilati, type RaporVerisi } from "@/lib/hesap";
import { posMutabakati, POS_KATEGORI, POS_BANKA_HESABI } from "@/lib/mutabakat";
import { KASA_BASLANGIC } from "@/lib/devir";
import { gunEkle } from "@/lib/tarih";

export const KASA_HESAPLARI = ["Nakit", "TEB", "VakıfBank", "Enpara"] as const;
export type KasaHesabi = (typeof KASA_HESAPLARI)[number];
export type Bakiyeler = Record<KasaHesabi, number>;

export interface BakiyeRaporu extends Pick<RaporVerisi, "tarih" | "kurye_raporlari"> {
  kasa_nakit?: number | string | null;
  kasa_pos?: number | string | null;
}
export interface BakiyeHareketi {
  id: string; tip: "gelir" | "gider" | "transfer"; hesap: string; hedef_hesap?: string | null;
  kategori: string; tutar: number | string; islem_tarihi: string;
}

const s = (v: unknown) => Number(v) || 0;

/** Bankaya yatışı henüz görünmeyen POS'un beklenen toplamı (31 Ekim'in POS'u 1 Kasım'da yatar). */
export function posBekleyenHesapla(raporlar: BakiyeRaporu[], hareketler: BakiyeHareketi[], bugunTarih: string): { toplam: number; gun: number } {
  const ilk = gunEkle(KASA_BASLANGIC, -1);
  const m = posMutabakati(
    raporlar.filter(r => r.tarih >= ilk).map(r => ({ tarih: r.tarih, pos: s(r.kasa_pos) + kuryeTahsilati(r).pos })),
    hareketler.filter(i => i.tip === "gelir" && i.kategori === POS_KATEGORI && i.hesap === POS_BANKA_HESABI && i.islem_tarihi >= KASA_BASLANGIC)
      .map(i => ({ id: i.id, tarih: i.islem_tarihi, tutar: s(i.tutar), hesap: i.hesap, kategori: i.kategori })),
    bugunTarih,
  );
  const bekleyen = m.satirlar.filter(x => x.gerceklesen === null);
  // Tarihi/tutarı tutmadığı için eşleşmeyen POS yatışları da bekleyenden düşülür (çift sayılmasın).
  const eslesmeyenYatis = m.eslesmeyenHareketler.reduce((t, h) => t + h.tutar, 0);
  const toplam = Math.max(0, bekleyen.reduce((t, x) => t + x.beklenen, 0) - eslesmeyenYatis);
  return { toplam: Math.round(toplam * 100) / 100, gun: bekleyen.length };
}

/** Dört hesabın bugünkü bakiyesi. posBekleyen verilmezse hesaplanır. */
export function hesapBakiyeleri(raporlar: BakiyeRaporu[], hareketler: BakiyeHareketi[], posBekleyen: number): Bakiyeler {
  const b: Bakiyeler = { Nakit: 0, TEB: 0, VakıfBank: 0, Enpara: 0 };
  const var_ = (h?: string | null): h is KasaHesabi => !!h && h in b;
  raporlar.forEach(r => { if (r.tarih >= KASA_BASLANGIC) b.Nakit += s(r.kasa_nakit) + kuryeTahsilati(r).nakit; });
  b[POS_BANKA_HESABI as KasaHesabi] += posBekleyen;
  hareketler.forEach(i => {
    if (i.islem_tarihi < KASA_BASLANGIC) return;
    const m = s(i.tutar);
    if (i.tip === "gelir" && var_(i.hesap)) b[i.hesap] += m;
    else if (i.tip === "gider" && var_(i.hesap)) b[i.hesap] -= m;
    else if (i.tip === "transfer") {
      if (var_(i.hesap)) b[i.hesap] -= m;
      if (var_(i.hedef_hesap)) b[i.hedef_hesap] += m;
    }
  });
  return b;
}
