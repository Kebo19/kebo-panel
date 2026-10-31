// ─── RAPOR KONTROLLERİ (31.10.2026) ─────────────────────────────────────────
// Aylık toplamlar sadece girilen kasa raporlarından hesaplanır (kullanıcı kararı). Bu yüzden
// eksik günler ve şüpheli raporlar ekranda açıkça gösterilir:
//   • eksikGunler: ayın (bugüne kadarki) raporu olmayan günleri
//   • raporUyarilari: başka günün kopyası görünen rapor, paket girilmemiş rapor
import { raporOzeti, type RaporVerisi } from "@/lib/hesap";
import { gunEkle, aySonu } from "@/lib/tarih";

/** "YYYY-AA" ayında, `bugun`den önceki günlerden raporu olmayanlar (bugün henüz girilmemiş sayılmaz). */
export function eksikGunler(tarihler: string[], ay: string, bugun: string): string[] {
  const bas = `${ay}-01`;
  const son = aySonu(ay.slice(0, 4), ay.slice(5, 7));
  const bit = son < bugun ? son : gunEkle(bugun, -1);
  const var_ = new Set(tarihler);
  const out: string[] = [];
  for (let t = bas; t <= bit; t = gunEkle(t, 1)) if (!var_.has(t)) out.push(t);
  return out;
}

/** Ardışık günleri aralık yapar: [06,07,17,18,19] → "6-7, 17-19" */
export function gunAraligiYaz(tarihler: string[]): string {
  const gunler = [...tarihler].sort().map(t => Number(t.slice(8, 10)));
  const parcalar: string[] = [];
  for (let i = 0; i < gunler.length; i++) {
    let j = i;
    while (j + 1 < gunler.length && gunler[j + 1] === gunler[j] + 1) j++;
    parcalar.push(i === j ? `${gunler[i]}` : `${gunler[i]}-${gunler[j]}`);
    i = j;
  }
  return parcalar.join(", ");
}

const kisa = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`;

/** Rapor tarihi → uyarılar. Kopya: brüt, gider ve paket başka bir raporla birebir aynı. */
export function raporUyarilari(raporlar: RaporVerisi[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const ekle = (t: string, m: string) => { if (!out.has(t)) out.set(t, []); out.get(t)!.push(m); };
  const ozet = [...raporlar].sort((a, b) => a.tarih.localeCompare(b.tarih)).map(r => ({ tarih: r.tarih, o: raporOzeti(r), gider: Number(r.gunluk_gider) || 0 }));
  const ilk = new Map<string, string>();
  for (const x of ozet) {
    if (x.o.brut > 0 && x.o.paket === 0) ekle(x.tarih, "paket girilmemiş");
    if (x.o.brut <= 0) continue;
    const k = `${Math.round(x.o.brut)}|${Math.round(x.gider)}|${x.o.paket}`;
    const onceki = ilk.get(k);
    if (onceki) ekle(x.tarih, `${kisa(onceki)} raporunun kopyası görünüyor`);
    else ilk.set(k, x.tarih);
  }
  return out;
}
