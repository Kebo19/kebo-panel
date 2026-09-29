// ─── CARİ EKSTRE, VADE TAKVİMİ, KDV ÖZETİ ───────────────────────────────────
// Saf hesap fonksiyonları (veritabanı/DOM yok) — tests/cariEkstre.test.ts ile sınanır.
// Sadece csvIndir() tarayıcıya dosya indirtir.
import { ilkIsGunu } from "@/lib/cari";
import { gunEkle, aySonu, yerelTarih } from "@/lib/tarih";

const sayi = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const yuvarla = (n: number) => Math.round(n * 100) / 100;

// ── VADE ──────────────────────────────────────────────────────────────────────

/**
 * Faturanın ödeme günü (YYYY-AA-GG). vade_tarihi girilmişse odur; yoksa cari dönem kuralı:
 * önceki ayın 16'sı – bu ayın 15'i arasında kesilen fatura bu ayın 25'inde (tatilse ilk iş
 * günü) ödenir (lib/cari buAyinOdemeDonemi ile aynı kural). Tarih yoksa null.
 */
export function faturaVadesi(f: { fatura_tarihi?: string | null; vade_tarihi?: string | null }): string | null {
  if (f.vade_tarihi) return f.vade_tarihi.slice(0, 10);
  if (!f.fatura_tarihi) return null;
  const [y, m, d] = f.fatura_tarihi.slice(0, 10).split("-").map(Number);
  const ay0 = d <= 15 ? m - 1 : m; // Date taşmayı (ay0=12 → sonraki yıl Ocak) kendisi çözer
  return yerelTarih(ilkIsGunu(new Date(y, ay0, 25)));
}

export type VadeGrubu = "gecikmis" | "bu_hafta" | "gelecek_hafta" | "bu_ay" | "sonra";
export const VADE_GRUPLARI: { anahtar: VadeGrubu; etiket: string }[] = [
  { anahtar: "gecikmis", etiket: "Gecikmiş" },
  { anahtar: "bu_hafta", etiket: "Bu hafta" },
  { anahtar: "gelecek_hafta", etiket: "Gelecek hafta" },
  { anahtar: "bu_ay", etiket: "Bu ay" },
  { anahtar: "sonra", etiket: "Sonra" },
];

/** Haftanın son günü (Pazar) — hafta Pazartesi başlar. */
export function haftaSonu(tarih: string): string {
  const [y, m, d] = tarih.split("-").map(Number);
  const gun = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Pazar
  return gunEkle(tarih, (7 - gun) % 7);
}

/** Vade tarihini bugüne göre gruplar. Vadesi bilinmeyen fatura gecikmiş sayılır (eski kayıt). */
export function vadeGrubu(vade: string | null, bugunStr: string): VadeGrubu {
  if (!vade || vade < bugunStr) return "gecikmis";
  const hs = haftaSonu(bugunStr);
  if (vade <= hs) return "bu_hafta";
  if (vade <= gunEkle(hs, 7)) return "gelecek_hafta";
  if (vade <= aySonu(bugunStr.slice(0, 4), bugunStr.slice(5, 7))) return "bu_ay";
  return "sonra";
}

export interface TakvimFatura {
  id: string; cari_id: string | null; cari_unvan?: string | null; fatura_no?: string | null;
  fatura_tarihi?: string | null; vade_tarihi?: string | null; toplam_tutar: number | null; durum?: string | null;
}
export interface TakvimFaturaSatiri extends TakvimFatura { vade: string | null; kalan: number; }
export interface TakvimCari { cari_id: string; cari_unvan: string; toplam: number; enErkenVade: string | null; faturalar: TakvimFaturaSatiri[]; }
export interface TakvimGrubu { anahtar: VadeGrubu; etiket: string; toplam: number; faturaSayisi: number; cariler: TakvimCari[]; }

/**
 * Açık faturaları vade gruplarına ayırır. `serbestOdemeler` (cari_id → faturaya bağlanmamış
 * ödeme toplamı) carinin en erken vadeli faturalarından düşülür; böylece takvim toplamı
 * carideki "Toplam Borç" ile tutarlı olur. Ödenmiş faturalar yok sayılır.
 */
export function vadeTakvimi(
  faturalar: TakvimFatura[],
  bugunStr: string,
  serbestOdemeler: Map<string, number> = new Map(),
): { gruplar: TakvimGrubu[]; genelToplam: number } {
  const cariBazli = new Map<string, TakvimFaturaSatiri[]>();
  faturalar.forEach(f => {
    if (f.durum === "odendi" || !f.cari_id) return;
    const tutar = sayi(f.toplam_tutar);
    if (tutar <= 0) return;
    const vade = faturaVadesi(f);
    if (!cariBazli.has(f.cari_id)) cariBazli.set(f.cari_id, []);
    cariBazli.get(f.cari_id)!.push({ ...f, vade, kalan: tutar });
  });

  const gruplar = new Map<VadeGrubu, Map<string, TakvimCari>>();
  VADE_GRUPLARI.forEach(g => gruplar.set(g.anahtar, new Map()));

  cariBazli.forEach((liste, cariId) => {
    liste.sort((a, b) => (a.vade || "").localeCompare(b.vade || ""));
    let kredi = Math.max(sayi(serbestOdemeler.get(cariId)), 0);
    for (const f of liste) {
      if (kredi <= 0) break;
      const dus = Math.min(kredi, f.kalan);
      f.kalan = yuvarla(f.kalan - dus);
      kredi = yuvarla(kredi - dus);
    }
    liste.forEach(f => {
      if (f.kalan <= 0.004) return;
      const g = f.durum === "gecikti" ? "gecikmis" : vadeGrubu(f.vade, bugunStr);
      const m = gruplar.get(g)!;
      if (!m.has(cariId)) m.set(cariId, { cari_id: cariId, cari_unvan: f.cari_unvan || "Bilinmiyor", toplam: 0, enErkenVade: f.vade, faturalar: [] });
      const c = m.get(cariId)!;
      c.faturalar.push(f);
      c.toplam = yuvarla(c.toplam + f.kalan);
      if (f.vade && (!c.enErkenVade || f.vade < c.enErkenVade)) c.enErkenVade = f.vade;
    });
  });

  const sonuc: TakvimGrubu[] = VADE_GRUPLARI.map(({ anahtar, etiket }) => {
    const cariler = Array.from(gruplar.get(anahtar)!.values())
      .sort((a, b) => (a.enErkenVade || "").localeCompare(b.enErkenVade || "") || b.toplam - a.toplam);
    return {
      anahtar, etiket, cariler,
      toplam: yuvarla(cariler.reduce((s, c) => s + c.toplam, 0)),
      faturaSayisi: cariler.reduce((s, c) => s + c.faturalar.length, 0),
    };
  });
  return { gruplar: sonuc, genelToplam: yuvarla(sonuc.reduce((s, g) => s + g.toplam, 0)) };
}

// ── CARİ EKSTRE ───────────────────────────────────────────────────────────────

export interface EkstreFatura { id?: string; fatura_no?: string | null; fatura_tarihi: string | null; toplam_tutar: number | null; aciklama?: string | null; }
export interface EkstreOdeme { id?: string; tarih: string | null; tutar: number | null; aciklama?: string | null; odeme_yontemi?: string | null; }
export interface EkstreSatiri { tarih: string; tur: "fatura" | "odeme"; belge: string; aciklama: string; borc: number; alacak: number; bakiye: number; }
export interface Ekstre { devreden: number; satirlar: EkstreSatiri[]; toplamBorc: number; toplamAlacak: number; kapanis: number; }

/**
 * Cari hesap ekstresi. Borç = fatura (tedarikçiye borçlandık), Alacak = ödeme.
 * Bakiye = borç − alacak (pozitif → tedarikçiye borçluyuz). Başlangıçtan önceki hareketler
 * devreden bakiyeye girer. Aynı gün fatura ödemeden önce yazılır. Tarihsiz kayıtlar atlanır.
 */
export function cariEkstre(faturalar: EkstreFatura[], odemeler: EkstreOdeme[], bas: string, bit: string): Ekstre {
  let devreden = 0;
  const hareketler: Omit<EkstreSatiri, "bakiye">[] = [];
  faturalar.forEach(f => {
    const t = f.fatura_tarihi?.slice(0, 10); if (!t) return;
    const tutar = sayi(f.toplam_tutar);
    if (t < bas) { devreden += tutar; return; }
    if (t > bit) return;
    hareketler.push({ tarih: t, tur: "fatura", belge: f.fatura_no || "", aciklama: f.aciklama || "Fatura", borc: tutar, alacak: 0 });
  });
  odemeler.forEach(o => {
    const t = o.tarih?.slice(0, 10); if (!t) return;
    const tutar = sayi(o.tutar);
    if (t < bas) { devreden -= tutar; return; }
    if (t > bit) return;
    hareketler.push({ tarih: t, tur: "odeme", belge: o.odeme_yontemi || "", aciklama: o.aciklama || "Ödeme", borc: 0, alacak: tutar });
  });
  hareketler.sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.tur === b.tur ? 0 : a.tur === "fatura" ? -1 : 1));
  devreden = yuvarla(devreden);
  let bakiye = devreden, toplamBorc = 0, toplamAlacak = 0;
  const satirlar = hareketler.map(h => {
    bakiye = yuvarla(bakiye + h.borc - h.alacak);
    toplamBorc += h.borc; toplamAlacak += h.alacak;
    return { ...h, bakiye };
  });
  return { devreden, satirlar, toplamBorc: yuvarla(toplamBorc), toplamAlacak: yuvarla(toplamAlacak), kapanis: bakiye };
}

// ── KDV ───────────────────────────────────────────────────────────────────────

export const KDV_ORANLARI = [0, 1, 10, 20] as const;

/** Hesaplanan yüzdeyi yasal oranlardan en yakınına yuvarlar (0/1/10/20). */
export function enYakinKdvOrani(yuzde: number): number {
  if (!Number.isFinite(yuzde) || yuzde <= 0) return 0;
  return KDV_ORANLARI.reduce((en, o) => Math.abs(o - yuzde) < Math.abs(en - yuzde) ? o : en, 0 as number);
}

export type KdvKaynak = "fatura" | "cari_varsayilan" | "bilinmiyor";
export interface KdvAyrimi { matrah: number; kdv: number; toplam: number; oran: number; kaynak: KdvKaynak; }

/**
 * Faturanın KDV hariç tutar / KDV / toplam ayrımı.
 * - kdv tutarı girilmişse (ya da toplam > tutar ise) faturadan hesaplanır;
 * - eski el girişlerinde kdv sütununa oran (1/10/20) yazılmış olabilir — toplam bununla tutuyorsa oran sayılır;
 * - hiç bilgi yoksa (Mikro aktarımları: kdv=0, toplam=tutar) carinin TANIMLI KDV oranıyla toplamdan
 *   geriye doğru hesaplanır; carinin oranı tanımsızsa (null) TAHMİN EDİLMEZ → kaynak "bilinmiyor"
 *   (matrah = toplam, KDV 0 döner ama özetlerde ayrı "KDV oranı tanımsız" satırında gösterilir).
 */
export function faturaKdvAyristir(
  f: { tutar?: number | null; kdv?: number | null; toplam_tutar?: number | null },
  varsayilanKdv?: number | null,
): KdvAyrimi {
  const tutar = sayi(f.tutar), kdvAlan = sayi(f.kdv);
  const toplam = sayi(f.toplam_tutar) || tutar + kdvAlan;
  const yakin = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * 0.0005);

  if (tutar > 0 && kdvAlan > 0) {
    if ([1, 10, 20].includes(kdvAlan) && !yakin(tutar + kdvAlan, toplam) && yakin(tutar * (1 + kdvAlan / 100), toplam)) {
      return { matrah: tutar, kdv: yuvarla(toplam - tutar), toplam, oran: kdvAlan, kaynak: "fatura" };
    }
    return { matrah: tutar, kdv: kdvAlan, toplam: yuvarla(tutar + kdvAlan), oran: enYakinKdvOrani(kdvAlan / tutar * 100), kaynak: "fatura" };
  }
  if (tutar > 0 && toplam > tutar + 0.004) {
    const kdv = yuvarla(toplam - tutar);
    return { matrah: tutar, kdv, toplam, oran: enYakinKdvOrani(kdv / tutar * 100), kaynak: "fatura" };
  }
  const v = varsayilanKdv === null || varsayilanKdv === undefined ? null : sayi(varsayilanKdv);
  if (v !== null && v > 0) {
    const matrah = yuvarla(toplam / (1 + v / 100));
    return { matrah, kdv: yuvarla(toplam - matrah), toplam, oran: v, kaynak: "cari_varsayilan" };
  }
  return { matrah: toplam, kdv: 0, toplam, oran: 0, kaynak: v === 0 ? "fatura" : "bilinmiyor" };
}

export interface KdvToplam { matrah: number; kdv: number; toplam: number; adet: number; }
export interface KdvOzeti extends KdvToplam {
  oranlar: (KdvToplam & { oran: number })[];
  cariler: (KdvToplam & { cari_id: string | null; cari_unvan: string; tanimsiz: boolean })[];
  tahminiAdet: number; bilinmeyenAdet: number;
  /** KDV oranı bilinmeyen (fatura KDV'siz girilmiş ve carinin oranı tanımsız) faturaların toplamı — genel matrah/KDV/toplama katılmaz */
  tanimsiz: KdvToplam;
  /** Oranı tanımsız olan carilerin unvanları */
  tanimsizCariler: string[];
}

/**
 * Faturaların (genellikle bir ayın) KDV özeti: oran kırılımı ve cari bazında (toplama göre sıralı).
 * KDV oranı bilinemeyen faturalar tahmin edilmez; `tanimsiz` satırında ayrı toplanır.
 */
export function kdvOzeti(
  faturalar: { cari_id?: string | null; cari_unvan?: string | null; tutar?: number | null; kdv?: number | null; toplam_tutar?: number | null }[],
  cariKdv: Map<string, number | null> = new Map(),
): KdvOzeti {
  const bos = (): KdvToplam => ({ matrah: 0, kdv: 0, toplam: 0, adet: 0 });
  const ekle = (h: KdvToplam, a: KdvAyrimi) => { h.matrah += a.matrah; h.kdv += a.kdv; h.toplam += a.toplam; h.adet++; };
  const genel = bos();
  const oranMap = new Map<number, KdvToplam>();
  const cariMap = new Map<string, KdvToplam & { cari_id: string | null; cari_unvan: string; tanimsiz: boolean }>();
  const tanimsiz = bos();
  let tahminiAdet = 0, bilinmeyenAdet = 0;
  faturalar.forEach(f => {
    const a = faturaKdvAyristir(f, f.cari_id ? cariKdv.get(f.cari_id) : null);
    if (a.kaynak === "cari_varsayilan") tahminiAdet++;
    const anahtar = f.cari_id || `unvan:${f.cari_unvan || ""}`;
    if (!cariMap.has(anahtar)) cariMap.set(anahtar, { ...bos(), cari_id: f.cari_id || null, cari_unvan: f.cari_unvan || "Bilinmiyor", tanimsiz: false });
    const c = cariMap.get(anahtar)!;
    ekle(c, a);
    if (a.kaynak === "bilinmiyor") {
      bilinmeyenAdet++;
      ekle(tanimsiz, a);
      c.tanimsiz = true;
      return;
    }
    ekle(genel, a);
    if (!oranMap.has(a.oran)) oranMap.set(a.oran, bos());
    ekle(oranMap.get(a.oran)!, a);
  });
  const yuv = <T extends KdvToplam>(h: T): T => ({ ...h, matrah: yuvarla(h.matrah), kdv: yuvarla(h.kdv), toplam: yuvarla(h.toplam) });
  return {
    ...yuv(genel),
    oranlar: Array.from(oranMap.entries()).sort((a, b) => a[0] - b[0]).map(([oran, h]) => yuv({ ...h, oran })),
    cariler: Array.from(cariMap.values()).map(yuv).sort((a, b) => b.toplam - a.toplam),
    tahminiAdet, bilinmeyenAdet,
    tanimsiz: { ...yuv(tanimsiz), matrah: 0, kdv: 0 },
    tanimsizCariler: Array.from(cariMap.values()).filter(c => c.tanimsiz).map(c => c.cari_unvan).sort((a, b) => a.localeCompare(b, "tr")),
  };
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** Excel (Türkçe) için CSV: `;` ayraç, virgüllü ondalık, UTF-8 BOM, CRLF. */
export function csvMetni(satirlar: (string | number | null | undefined)[][]): string {
  const hucre = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2).replace(".", ",") : "";
    return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return "﻿" + satirlar.map(s => s.map(hucre).join(";")).join("\r\n");
}

/** Tarayıcıda CSV dosyası indirir. */
export function csvIndir(dosyaAdi: string, metin: string): void {
  const url = URL.createObjectURL(new Blob([metin], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = dosyaAdi;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
