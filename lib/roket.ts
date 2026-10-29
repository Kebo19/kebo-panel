// ─── ROKET (Roadrunner kurye sistemi) PAKET RAPORU ──────────────────────────
// Roket Adisyon → Raporlama → Paket Raporu → "Excel olarak indir" dosyası.
// Roket'in sunucusu robot korumalı olduğu için veri otomatik çekilemiyor; dosya
// Kurye Kontrol sayfasına yüklenir, burada GÜNLÜK ÖZETE çevrilir ve sadece özet
// kaydedilir. Müşteri adı, telefon ve adres hiçbir yere yazılmaz.
//
// Kuryenin kapıda topladığı para: Nakit, Pos, Paye Kod, Bilinmeyen ve sadece
// Alo Paket (LOCAL) siparişlerindeki "Yemek Karti". Trendyol / Yemeksepeti / Migros
// siparişinde "Yemek Karti" platformda online ödenmiştir (MagicPay'de TRENDYOL_PLUXEE
// vb.), kurye para almaz. "Online Ödeme" de kurye tahsilatı değildir.

import { kanalBul, type Kanal } from "@/lib/magicpay";

export interface RoketKurye {
  ad: string;
  paket: number;
  /** kapıda nakit */
  nakit: number;
  /** kapıda POS / kredi kartı */
  pos: number;
  /** kapıda Paye Kod */
  paye: number;
  /** Alo Paket'te kapıda yemek kartı */
  yemek: number;
  /** ödeme türü "Bilinmeyen" (kapıda alındı ama türü seçilmemiş) */
  bilinmeyen: number;
  km: number;
  /** Kasa raporundaki hangi satıra sayılır: Sabit 1, Sabit 2 (garantili) ya da havuz.
   *  Sabit kurye izinliyken / birkaç saatliğine yerine gelen kurye de o sabit satıra yazılır
   *  (aynı sabite birden çok kurye atanabilir, paketleri ve paraları toplanır). Kurye Kontrol'den seçilir. */
  atama: RoketAtama;
  /** eski kayıtlar için (atama yoksa): true = sabit */
  sabit?: boolean;
}

export type RoketAtama = "s1" | "s2" | "havuz";
export const ATAMA_ADI: Record<RoketAtama, string> = { s1: "Sabit 1", s2: "Sabit 2", havuz: "Havuz" };

/** Kuryenin ataması (eski kayıtlarda sabit:true olanlar sırayla s1, s2). */
export function atamaBul(g: Pick<RoketGun, "kuryeler">, k: RoketKurye): RoketAtama {
  if (k.atama) return k.atama;
  if (!k.sabit) return "havuz";
  const sabitler = g.kuryeler.filter(x => !x.atama && x.sabit);
  return sabitler.indexOf(k) === 0 ? "s1" : "s2";
}

/**
 * Varsayılan atama: bir önceki günün sabit kuryeleri bu gün de geldiyse aynı sabite; boş kalan
 * sabite o günün en çok paket atan (henüz atanmamış) kuryesi. Kalanlar havuz.
 */
export function varsayilanAtama(kuryeler: RoketKurye[], oncekiSabit: Partial<Record<"s1" | "s2", string[]>> = {}): RoketKurye[] {
  const sonuc = kuryeler.map(k => ({ ...k, atama: "havuz" as RoketAtama }));
  for (const slot of ["s1", "s2"] as const) {
    const adlar = (oncekiSabit[slot] || []).map(a => sade(a).toLocaleLowerCase("tr-TR"));
    sonuc.forEach(k => { if (k.atama === "havuz" && adlar.includes(sade(k.ad).toLocaleLowerCase("tr-TR"))) k.atama = slot; });
  }
  for (const slot of ["s1", "s2"] as const) {
    if (sonuc.some(k => k.atama === slot)) continue;
    const aday = sonuc.filter(k => k.atama === "havuz").sort((a, b) => b.paket - a.paket)[0];
    if (aday) aday.atama = slot;
  }
  return sonuc;
}

export interface RoketGun {
  tarih: string; // YYYY-AA-GG
  kuryeler: RoketKurye[];
  /** MagicPay kanalına göre teslim edilen paket sayısı (alo = LOCAL SIPARIS) */
  kanallar: Partial<Record<Kanal, number>>;
  /** Roket'in kendi girişleri (Fiş Tarandı, Roket Adisyon) */
  digerPaket: number;
  iptal: number;
  toplamPaket: number;
}

const tl = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
};
const kurus = (x: number) => Math.round(x * 100) / 100;
const sade = (s: string) => s.replace(/\s+/g, " ").trim();

/** "16.10.2026 23:36" → iş günü "2026-10-16" (gece 05:00'ten önceki sipariş bir önceki güne yazılır). */
export function isGunu(sipTarihi: unknown): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/.exec(String(sipTarihi ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (+m[4] < 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "Trendyol / KEBO" → MagicPay kanalı; LOCAL SIPARIS → alo; Roket'in kendi girişleri → null */
export function roketKanali(yonlendiren: unknown): Kanal | null {
  const y = sade(String(yonlendiren ?? ""));
  if (!y) return null;
  if (/^local/i.test(y)) return "alo";
  const [platform, ...marka] = y.split(" / ");
  if (!marka.length) return null; // "Fiş Tarandı", "Roket Adisyon"
  const k = kanalBul({ platform, marka: marka.join(" / ") });
  return k === "diger" ? null : k;
}

export interface RoketOkuma { gunler: RoketGun[]; satir: number; hatali: number; uyari: string[] }

/** Excel'in satırları (ilk satır başlık). Toplam satırları ve teslim edilmeyenler ayıklanır. */
export function roketExcelOku(satirlar: unknown[][]): RoketOkuma {
  const uyari: string[] = [];
  if (!satirlar.length) return { gunler: [], satir: 0, hatali: 0, uyari: ["Dosya boş."] };
  const baslik = satirlar[0].map(h => sade(String(h ?? "")).toLocaleLowerCase("tr-TR"));
  const sutun = (ad: string) => baslik.indexOf(ad.toLocaleLowerCase("tr-TR"));
  const iTarih = sutun("Sipariş Tarihi"), iKurye = sutun("Kurye"), iDurum = sutun("Durum"), iTutar = sutun("Tutar"),
    iOdeme = sutun("Ödeme Yöntemi"), iMesafe = sutun("Mesafe"), iYon = sutun("Yönlendiren");
  if ([iTarih, iKurye, iDurum, iTutar, iOdeme].some(i => i < 0)) {
    return { gunler: [], satir: 0, hatali: 0, uyari: ["Bu dosya Roket Paket Raporu'na benzemiyor (Sipariş Tarihi / Kurye / Durum / Tutar / Ödeme Yöntemi sütunları bulunamadı)."] };
  }
  const gunler = new Map<string, { kurye: Map<string, RoketKurye>; kanallar: Partial<Record<Kanal, number>>; diger: number; iptal: number }>();
  let satir = 0, hatali = 0;
  for (const r of satirlar.slice(1)) {
    const tarih = isGunu(r[iTarih]);
    if (!tarih) continue; // toplam / özet satırları
    satir++;
    const g = gunler.get(tarih) ?? { kurye: new Map<string, RoketKurye>(), kanallar: {} as Partial<Record<Kanal, number>>, diger: 0, iptal: 0 };
    gunler.set(tarih, g);
    const durum = sade(String(r[iDurum] ?? "")).toLocaleLowerCase("tr-TR");
    if (/iptal/.test(durum)) { g.iptal++; continue; }
    if (!/teslim/.test(durum)) continue;
    const ad = sade(String(r[iKurye] ?? ""));
    if (!ad || /kurye (yok|planland)/i.test(ad.toLocaleLowerCase("tr-TR"))) { hatali++; continue; }
    const k = g.kurye.get(ad) ?? { ad, paket: 0, nakit: 0, pos: 0, paye: 0, yemek: 0, bilinmeyen: 0, km: 0, atama: "havuz" as RoketAtama };
    g.kurye.set(ad, k);
    k.paket++;
    k.km += tl(String(r[iMesafe] ?? "").replace(/km/i, "").replace(".", ","));
    const kanal = iYon >= 0 ? roketKanali(r[iYon]) : null;
    if (kanal) g.kanallar[kanal] = (g.kanallar[kanal] || 0) + 1; else g.diger++;
    const tutar = tl(r[iTutar]);
    const odeme = sade(String(r[iOdeme] ?? "")).toLocaleLowerCase("tr-TR");
    if (/nakit/.test(odeme)) k.nakit += tutar;
    else if (/^pos|kredi|kart[ıi]? ?ile/.test(odeme)) k.pos += tutar;
    else if (/paye/.test(odeme)) k.paye += tutar;
    else if (/yemek/.test(odeme)) { if (kanal === "alo" || !kanal) k.yemek += tutar; }
    else if (/bilinmeyen/.test(odeme)) k.bilinmeyen += tutar;
    // "online ödeme" → kurye tahsilatı değil
  }
  const sonuc: RoketGun[] = [...gunler.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([tarih, g]) => {
    const kuryeler: RoketKurye[] = [...g.kurye.values()].map(k => ({
      ...k, nakit: kurus(k.nakit), pos: kurus(k.pos), paye: kurus(k.paye), yemek: kurus(k.yemek), bilinmeyen: kurus(k.bilinmeyen), km: kurus(k.km),
    })).sort((a, b) => b.paket - a.paket || a.ad.localeCompare(b.ad, "tr"));
    return { tarih, kuryeler: varsayilanAtama(kuryeler), kanallar: g.kanallar, digerPaket: g.diger, iptal: g.iptal, toplamPaket: kuryeler.reduce((t, k) => t + k.paket, 0) };
  });
  if (hatali) uyari.push(`${hatali} teslim edilmiş paketin kuryesi belli değil (Kurye Yok / Planlandı); hesaba katılmadı.`);
  return { gunler: sonuc, satir, hatali, uyari };
}

/** Kapıda toplanan toplam (nakit + POS + Paye + Alo yemek kartı + bilinmeyen). */
export const roketTahsilat = (k: Pick<RoketKurye, "nakit" | "pos" | "paye" | "yemek" | "bilinmeyen">) =>
  kurus(k.nakit + k.pos + k.paye + k.yemek + k.bilinmeyen);

/** Kasa raporu kurye satırını Roket kuryesiyle eşleştirmek için ad karşılaştırması ("Mustafa" ↔ "MUSTAFA ÇETİN"). */
export function adEslesir(kasaAdi: string, roketAdi: string): boolean {
  const k = sade(kasaAdi).toLocaleLowerCase("tr-TR"), r = sade(roketAdi).toLocaleLowerCase("tr-TR");
  if (!k || !r) return false;
  return r === k || r.split(" ")[0] === k.split(" ")[0];
}

export interface KuryeKarsilastirma {
  /** satır adı: "Sabit 1", "Sabit 2", "Havuz" */
  ad: string;
  /** o satıra sayılan Roket kuryeleri */
  kuryeler: string[];
  sabit: boolean;
  roket: { paket: number; nakit: number; pos: number; kart: number } | null;
  kasa: { paket: number; nakit: number; pos: number; kart: number } | null;
}

interface KasaKuryeSatiri { isim?: string; tip?: string; paketSayisi?: unknown; uzakPaket?: unknown; paket9km?: unknown; nakit?: unknown; pos?: unknown; tokenflex?: unknown; paye?: unknown }

type Ozet = { paket: number; nakit: number; pos: number; kart: number; paye: number; yemek: number; bilinmeyen: number };
const BOS_OZET: Ozet = { paket: 0, nakit: 0, pos: 0, kart: 0, paye: 0, yemek: 0, bilinmeyen: 0 };

/** Bir slottaki (Sabit 1 / Sabit 2 / Havuz) kuryelerin toplamı. kart = Paye + Alo yemek kartı + bilinmeyen. */
export function slotToplami(g: Pick<RoketGun, "kuryeler">, slot: RoketAtama): Ozet & { adlar: string[] } {
  const l = g.kuryeler.filter(k => atamaBul(g, k) === slot);
  const t = l.reduce<Ozet>((a, k) => ({
    paket: a.paket + k.paket, nakit: kurus(a.nakit + k.nakit), pos: kurus(a.pos + k.pos),
    kart: kurus(a.kart + k.paye + k.yemek + k.bilinmeyen), paye: kurus(a.paye + k.paye), yemek: kurus(a.yemek + k.yemek), bilinmeyen: kurus(a.bilinmeyen + k.bilinmeyen),
  }), { ...BOS_OZET });
  return { ...t, adlar: l.map(k => k.ad) };
}

/**
 * Roket gününü kasa raporunun kurye satırlarıyla karşılaştırır: kasa raporundaki 1. sabit satır ↔ Sabit 1,
 * 2. sabit satır ↔ Sabit 2, havuz satırlarının toplamı ↔ Havuz.
 */
export function kuryeKarsilastir(gun: RoketGun, kasaKuryeleri: KasaKuryeSatiri[] | null): KuryeKarsilastirma[] {
  const tam = (v: unknown) => parseInt(String(v ?? ""), 10) || 0;
  const kasaOzet = (l: KasaKuryeSatiri[]) => l.reduce<{ paket: number; nakit: number; pos: number; kart: number }>((t, k) => ({
    paket: t.paket + tam(k.paketSayisi) + tam(k.uzakPaket) + tam(k.paket9km), nakit: kurus(t.nakit + tl(k.nakit)),
    pos: kurus(t.pos + tl(k.pos)), kart: kurus(t.kart + tl(k.tokenflex) + tl(k.paye)),
  }), { paket: 0, nakit: 0, pos: 0, kart: 0 });
  const kasaSabit = (kasaKuryeleri || []).filter(k => k.tip !== "havuz");
  const kasaHavuz = (kasaKuryeleri || []).filter(k => k.tip === "havuz");
  // Sabit satırlar önce adla eşlenir ("Mustafa" ↔ MUSTAFA ÇETİN), eşleşmezse sırayla (1. sabit satır ↔ Sabit 1).
  const kullanilan = new Set<number>();
  const kasaIndeksi: Record<"s1" | "s2", number> = { s1: -1, s2: -1 };
  for (const slot of ["s1", "s2"] as const) {
    const adlar = slotToplami(gun, slot).adlar;
    const j = kasaSabit.findIndex((k, idx) => !kullanilan.has(idx) && adlar.some(a => adEslesir(k.isim || "", a)));
    if (j >= 0) { kasaIndeksi[slot] = j; kullanilan.add(j); }
  }
  for (const [i, slot] of (["s1", "s2"] as const).entries()) {
    if (kasaIndeksi[slot] >= 0) continue;
    const j = [i, 0, 1].find(idx => idx < kasaSabit.length && !kullanilan.has(idx));
    if (j !== undefined) { kasaIndeksi[slot] = j; kullanilan.add(j); }
  }
  return (["s1", "s2", "havuz"] as const).map((slot) => {
    const r = slotToplami(gun, slot);
    const i = slot === "havuz" ? -1 : kasaIndeksi[slot];
    const kasaSatir = slot === "havuz" ? kasaHavuz : i >= 0 ? [kasaSabit[i]] : [];
    const roketVar = r.adlar.length > 0;
    return {
      ad: ATAMA_ADI[slot] + (slot !== "havuz" && i >= 0 && kasaSabit[i]?.isim ? ` (kasa: ${kasaSabit[i].isim})` : ""),
      kuryeler: r.adlar, sabit: slot !== "havuz",
      roket: roketVar ? { paket: r.paket, nakit: r.nakit, pos: r.pos, kart: r.kart } : null,
      kasa: kasaKuryeleri ? kasaOzet(kasaSatir) : null,
    };
  }).filter(s => s.roket || (s.kasa && (s.kasa.paket || s.kasa.nakit || s.kasa.pos || s.kasa.kart)));
}
