// ─── FİRMA CARİ EKSTRESİ ↔ SİSTEM KARŞILAŞTIRMASI (31.10.2026) ──────────────
// Firmaların gönderdiği cari hesap ekstresi (PDF) yapay zekâyla satırlara ayrılır (api/cari-ekstre-tara),
// burada sistemdeki faturalar ve cari ödemeleriyle karşılaştırılır. Saf fonksiyonlar; veritabanına yazmaz.
//   etki "artar"  = borcumuzu artıran satır (firmanın bize kestiği fatura)
//   etki "azalir" = borcumuzu azaltan satır (ödememiz, iade faturası, mahsup)
// Eşleştirme: fatura önce numarayla (sondaki rakamlar), yoksa tutar (±1 TL) + tarih (±3 gün);
// ödeme tutar (±1 TL) + tarih (±5 gün), en yakın tarih önce.

export interface EkstreKalemi {
  tarih: string;            // YYYY-AA-GG
  evrak_no: string | null;
  aciklama: string | null;
  tur: "fatura" | "odeme" | "iade" | "acilis" | "diger";
  etki: "artar" | "azalir";
  tutar: number;            // pozitif
  bakiye?: number | null;   // satır sonrası bakiye (+ = biz borçluyuz)
}
export interface EkstreOkuma {
  firma: string | null;
  vergi_no: string | null;
  donem_bas: string | null;
  donem_bit: string | null;
  son_bakiye: number | null; // + = biz borçluyuz
  satirlar: EkstreKalemi[];
}
export interface SisFatura { id: string; fatura_no: string | null; fatura_tarihi: string; toplam_tutar: number | string | null }
export interface SisOdeme { id: string; tarih: string; tutar: number | string | null; odeme_yontemi?: string | null; aciklama?: string | null }

export interface Eslesme<S> { ekstre: EkstreKalemi; sistem: S; tutarFarki: number }
export interface CariKarsilastirma {
  bas: string; bit: string;
  faturaEslesen: Eslesme<SisFatura>[];
  /** Ekstrede var, sistemde yok */
  eksikFatura: EkstreKalemi[];
  eksikOdeme: EkstreKalemi[];
  /** Sistemde var (ekstre döneminde), ekstrede yok */
  fazlaFatura: SisFatura[];
  fazlaOdeme: SisOdeme[];
  odemeEslesen: Eslesme<SisOdeme>[];
  /** Numarası tuttu ama tutarı farklı faturalar */
  tutarFarkli: Eslesme<SisFatura>[];
  ekstreBakiye: number | null;
  sistemBakiye: number;
  bakiyeFarki: number | null;
  acilisVar: boolean;
}

const N = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const kurus = (v: number) => Math.round(v * 100) / 100;
const gun = (t: string) => Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) / 86400000;
const gunFarki = (a: string, b: string) => Math.abs(gun(a) - gun(b));

/** Fatura numarası karşılaştırma anahtarı: harf/rakam dışı atılır; GİB numarasında sondaki sıra numarası. */
export function faturaNoAnahtari(no: string | null | undefined): string {
  const s = String(no || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return "";
  const m = s.match(/(\d+)$/);
  return m ? String(Number(m[1].slice(-9))) : s;
}

export function cariKarsilastir(ok: EkstreOkuma, faturalar: SisFatura[], odemeler: SisOdeme[]): CariKarsilastirma {
  const satirlar = ok.satirlar.filter(s => s.tarih && s.tutar > 0);
  const tarihler = satirlar.map(s => s.tarih).sort();
  const bas = ok.donem_bas || tarihler[0] || "0000-00-00";
  const bit = ok.donem_bit || tarihler[tarihler.length - 1] || "9999-12-31";
  const donemde = (t: string) => t >= bas && t <= bit;

  const ekFatura = satirlar.filter(s => s.etki === "artar" && s.tur !== "acilis");
  const ekOdeme = satirlar.filter(s => s.etki === "azalir" && s.tur !== "acilis");
  const sisFatura = faturalar.filter(f => donemde(f.fatura_tarihi));
  const sisOdeme = odemeler.filter(o => donemde(o.tarih));

  // ── Faturalar ──
  const kullanilanF = new Set<string>();
  const faturaEslesen: Eslesme<SisFatura>[] = [], tutarFarkli: Eslesme<SisFatura>[] = [], eksikFatura: EkstreKalemi[] = [];
  const noIle = new Map<string, SisFatura[]>();
  sisFatura.forEach(f => { const k = faturaNoAnahtari(f.fatura_no); if (k) noIle.set(k, [...(noIle.get(k) || []), f]); });
  const kalan: EkstreKalemi[] = [];
  for (const e of ekFatura) {
    const k = faturaNoAnahtari(e.evrak_no);
    const aday = k ? (noIle.get(k) || []).find(f => !kullanilanF.has(f.id)) : undefined;
    if (aday) {
      kullanilanF.add(aday.id);
      const fark = kurus(N(aday.toplam_tutar) - e.tutar);
      (Math.abs(fark) > 1 ? tutarFarkli : faturaEslesen).push({ ekstre: e, sistem: aday, tutarFarki: fark });
    } else kalan.push(e);
  }
  for (const e of kalan) {
    const aday = sisFatura.filter(f => !kullanilanF.has(f.id) && Math.abs(N(f.toplam_tutar) - e.tutar) <= 1 && gunFarki(f.fatura_tarihi, e.tarih) <= 3)
      .sort((a, b) => gunFarki(a.fatura_tarihi, e.tarih) - gunFarki(b.fatura_tarihi, e.tarih))[0];
    if (aday) { kullanilanF.add(aday.id); faturaEslesen.push({ ekstre: e, sistem: aday, tutarFarki: kurus(N(aday.toplam_tutar) - e.tutar) }); }
    else eksikFatura.push(e);
  }
  const fazlaFatura = sisFatura.filter(f => !kullanilanF.has(f.id));

  // ── Ödemeler ──
  const kullanilanO = new Set<string>();
  const odemeEslesen: Eslesme<SisOdeme>[] = [], eksikOdeme: EkstreKalemi[] = [];
  for (const e of ekOdeme) {
    const aday = sisOdeme.filter(o => !kullanilanO.has(o.id) && Math.abs(N(o.tutar) - e.tutar) <= 1 && gunFarki(o.tarih, e.tarih) <= 5)
      .sort((a, b) => gunFarki(a.tarih, e.tarih) - gunFarki(b.tarih, e.tarih))[0];
    if (aday) { kullanilanO.add(aday.id); odemeEslesen.push({ ekstre: e, sistem: aday, tutarFarki: kurus(N(aday.tutar) - e.tutar) }); }
    else eksikOdeme.push(e);
  }
  const fazlaOdeme = sisOdeme.filter(o => !kullanilanO.has(o.id));

  // ── Bakiye: ekstrenin son günü itibarıyla ──
  const sistemBakiye = kurus(
    faturalar.filter(f => f.fatura_tarihi <= bit).reduce((t, f) => t + N(f.toplam_tutar), 0)
    - odemeler.filter(o => o.tarih <= bit).reduce((t, o) => t + N(o.tutar), 0));
  const ekstreBakiye = ok.son_bakiye ?? [...satirlar].reverse().find(s => s.bakiye != null)?.bakiye ?? null;

  return {
    bas, bit, faturaEslesen, eksikFatura, eksikOdeme, fazlaFatura, fazlaOdeme, odemeEslesen, tutarFarkli,
    ekstreBakiye, sistemBakiye, bakiyeFarki: ekstreBakiye == null ? null : kurus(ekstreBakiye - sistemBakiye),
    acilisVar: satirlar.some(s => s.tur === "acilis"),
  };
}

/** Okunan firma adı / vergi no ile sistemdeki cariyi bulur. */
export function cariBul<C extends { id: string; unvan: string; vergi_no?: string | null }>(ok: Pick<EkstreOkuma, "firma" | "vergi_no">, cariler: C[]): C | null {
  const vn = String(ok.vergi_no || "").replace(/\D/g, "");
  if (vn.length >= 10) { const c = cariler.find(x => String(x.vergi_no || "").replace(/\D/g, "") === vn); if (c) return c; }
  const sade = (s: string) => s.toLocaleUpperCase("tr-TR").replace(/[^A-ZÇĞİÖŞÜ0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !/^(LTD|ŞTİ|STI|SAN|TİC|TIC|GIDA|ANONİM|ŞİRKETİ|LİMİTED|VE)$/.test(w));
  const f = sade(ok.firma || "");
  if (!f.length) return null;
  let en: { c: C; puan: number } | null = null;
  for (const c of cariler) {
    const w = sade(c.unvan);
    const puan = f.filter(x => w.includes(x)).length / Math.max(f.length, 1);
    if (puan > 0 && (!en || puan > en.puan)) en = { c, puan };
  }
  return en && en.puan >= 0.5 ? en.c : null;
}
