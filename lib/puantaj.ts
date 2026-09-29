// ─── PUANTAJ YARDIMCILARI ────────────────────────────────────────────────────
// Personelin günlük çalışma durumu (puantaj tablosu) için saf fonksiyonlar.
// MAAŞ HESABI BURADA YAPILMAZ; sadece gün sayıları ve fazla mesai özetlenir.

export const PUANTAJ_DURUMLARI = [
  "calisti", "izin", "rapor", "gelmedi", "ucretsiz_izin", "hafta_tatili",
] as const;

export type PuantajDurum = (typeof PUANTAJ_DURUMLARI)[number];

export const DURUM_ETIKET: Record<PuantajDurum, string> = {
  calisti: "Çalıştı",
  izin: "Yıllık izin",
  rapor: "Rapor",
  gelmedi: "Gelmedi",
  ucretsiz_izin: "Ücretsiz izin",
  hafta_tatili: "Hafta tatili",
};

export const DURUM_KISA: Record<PuantajDurum, string> = {
  calisti: "Ç", izin: "İ", rapor: "R", gelmedi: "G", ucretsiz_izin: "Ü", hafta_tatili: "H",
};

/** Rozet renkleri (Tailwind sınıfları). */
export const DURUM_RENK: Record<PuantajDurum, string> = {
  calisti: "bg-emerald-50 text-emerald-700 border-emerald-200",
  izin: "bg-sky-50 text-sky-700 border-sky-200",
  rapor: "bg-violet-50 text-violet-700 border-violet-200",
  gelmedi: "bg-red-50 text-red-700 border-red-200",
  ucretsiz_izin: "bg-amber-50 text-amber-700 border-amber-200",
  hafta_tatili: "bg-slate-100 text-slate-600 border-slate-200",
};

export function durumGecerliMi(x: unknown): x is PuantajDurum {
  return typeof x === "string" && (PUANTAJ_DURUMLARI as readonly string[]).includes(x);
}

export interface PuantajKaydi {
  personel_id: number | string;
  tarih: string;
  durum: string;
  fazla_mesai_saat?: number | string | null;
}

export interface AylikOzet {
  calisti: number;
  izin: number;
  rapor: number;
  gelmedi: number;
  ucretsiz_izin: number;
  hafta_tatili: number;
  fazlaMesai: number;
  /** Personelin çalışması beklenen ama kaydı olmayan gün sayısı. */
  girilmemis: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Ayın bütün günleri "YYYY-AA-GG" olarak. ay: 1-12 */
export function ayinGunleri(yil: number, ay: number): string[] {
  const son = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  return Array.from({ length: son }, (_, i) => `${yil}-${pad(ay)}-${pad(i + 1)}`);
}

/** Geçerli "YYYY-AA-GG" mi? (bozuk/eksik tarihler yok sayılır) */
function tarihMi(t?: string | null): t is string {
  return !!t && /^\d{4}-\d{2}-\d{2}/.test(t) && Number(t.slice(0, 4)) >= 1900;
}

/**
 * Personelin o günde işte olması beklenir mi? (işe giriş ≤ gün ≤ işten çıkış)
 * Bozuk tarihler sınır olarak kullanılmaz.
 */
export function calismaAraligindaMi(gun: string, giris?: string | null, cikis?: string | null): boolean {
  if (tarihMi(giris) && gun < giris.slice(0, 10)) return false;
  if (tarihMi(cikis) && gun > cikis.slice(0, 10)) return false;
  return true;
}

export function bosOzet(): AylikOzet {
  return { calisti: 0, izin: 0, rapor: 0, gelmedi: 0, ucretsiz_izin: 0, hafta_tatili: 0, fazlaMesai: 0, girilmemis: 0 };
}

/**
 * Tek personelin aylık puantaj özeti.
 * @param kayitlar o personelin kayıtları (başka aylar/personeller olsa da sadece `gunler` sayılır)
 * @param gunler ayın günleri (ayinGunleri)
 * @param opts.giris/cikis çalışma aralığı; opts.sonGun: bu günden sonrası "girilmemiş" sayılmaz (ör. bugün)
 */
export function aylikOzet(
  kayitlar: PuantajKaydi[],
  gunler: string[],
  opts: { giris?: string | null; cikis?: string | null; sonGun?: string } = {},
): AylikOzet {
  const oz = bosOzet();
  const gunSet = new Set(gunler);
  const girilen = new Set<string>();
  for (const k of kayitlar) {
    const t = String(k.tarih).slice(0, 10);
    if (!gunSet.has(t) || girilen.has(t)) continue;
    girilen.add(t);
    if (durumGecerliMi(k.durum)) oz[k.durum] += 1;
    oz.fazlaMesai += Number(k.fazla_mesai_saat) || 0;
  }
  for (const g of gunler) {
    if (girilen.has(g)) continue;
    if (opts.sonGun && g > opts.sonGun) continue;
    if (!calismaAraligindaMi(g, opts.giris, opts.cikis)) continue;
    oz.girilmemis += 1;
  }
  oz.fazlaMesai = Math.round(oz.fazlaMesai * 100) / 100;
  return oz;
}

/** Personel id'sine göre gruplar: { "12": { "2026-09-01": kayit } } */
export function puantajHaritasi<T extends PuantajKaydi>(kayitlar: T[]): Record<string, Record<string, T>> {
  const h: Record<string, Record<string, T>> = {};
  for (const k of kayitlar) {
    const pid = String(k.personel_id);
    (h[pid] ||= {})[String(k.tarih).slice(0, 10)] = k;
  }
  return h;
}

/** "12 çalıştı · 1 izin · 1 gelmedi" — günlük rapor kartındaki özet. */
export function gunlukOzetMetni(durumlar: string[]): string {
  const say = (d: PuantajDurum) => durumlar.filter(x => x === d).length;
  const parcalar: string[] = [];
  const c = say("calisti");
  const izin = say("izin") + say("ucretsiz_izin");
  const parca: [number, string][] = [
    [c, "çalıştı"], [izin, "izin"], [say("rapor"), "rapor"], [say("gelmedi"), "gelmedi"], [say("hafta_tatili"), "hafta tatili"],
  ];
  for (const [n, e] of parca) if (n > 0) parcalar.push(`${n} ${e}`);
  return parcalar.length ? parcalar.join(" · ") : "Personel yok";
}

export interface ParaKaydi { personel_id?: string | null; personel_isim?: string | null; tutar: number | string; }

/**
 * Personelin avans/kesinti toplamı. Kayıt personel id'siyle (text) eşleşir;
 * id'si olmayan eski kayıtlar isimle eşleştirilir.
 */
export function personelToplami(kayitlar: ParaKaydi[], personel: { id: number | string; isim: string }): number {
  const pid = String(personel.id);
  let t = 0;
  for (const k of kayitlar) {
    const kid = k.personel_id == null ? "" : String(k.personel_id);
    const eslesir = kid ? kid === pid : (k.personel_isim || "").trim() === personel.isim.trim();
    if (eslesir) t += Number(k.tutar) || 0;
  }
  return Math.round(t * 100) / 100;
}

/** CSV hücresi (; ayraçlı, Excel uyumlu). */
export function csvHucre(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sayıyı Türkçe Excel'in anlayacağı ondalık virgüllü yazar. */
export function csvSayi(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

export interface CsvPersonel { id: number | string; isim: string; departman?: string | null; }

/** Mali müşavir için aylık puantaj CSV'si (BOM dahil). */
export function puantajCsv(
  personeller: CsvPersonel[],
  gunler: string[],
  harita: Record<string, Record<string, PuantajKaydi>>,
  ozetler: Record<string, AylikOzet>,
  avans: Record<string, number>,
  kesinti: Record<string, number>,
): string {
  const baslik = [
    "Personel", "Departman", ...gunler.map(g => g.slice(8, 10)),
    "Çalıştı", "Yıllık izin", "Rapor", "Gelmedi", "Ücretsiz izin", "Hafta tatili", "Fazla mesai (saat)", "Girilmemiş gün",
    "Avans", "Kesinti",
  ];
  const satirlar = [baslik.map(csvHucre).join(";")];
  for (const p of personeller) {
    const pid = String(p.id);
    const oz = ozetler[pid] || bosOzet();
    const gunHucreleri = gunler.map(g => {
      const k = harita[pid]?.[g];
      if (!k || !durumGecerliMi(k.durum)) return "";
      const fm = Number(k.fazla_mesai_saat) || 0;
      return DURUM_KISA[k.durum] + (fm ? `+${csvSayi(fm)}` : "");
    });
    satirlar.push([
      p.isim, p.departman || "", ...gunHucreleri,
      oz.calisti, oz.izin, oz.rapor, oz.gelmedi, oz.ucretsiz_izin, oz.hafta_tatili, csvSayi(oz.fazlaMesai), oz.girilmemis,
      csvSayi(avans[pid] || 0), csvSayi(kesinti[pid] || 0),
    ].map(csvHucre).join(";"));
  }
  satirlar.push("");
  satirlar.push(csvHucre("Kısaltmalar: " + PUANTAJ_DURUMLARI.map(d => `${DURUM_KISA[d]}=${DURUM_ETIKET[d]}`).join(", ") + "; +N = fazla mesai saati"));
  return "﻿" + satirlar.join("\r\n");
}

// ─── GÜNLÜK RAPOR PUANTAJ KARTI ──────────────────────────────────────────────

/** Güvenilir tarih mi? Yılı 2000'den küçük bozuk değerler ("0026-07-06") yok sayılır. */
function gecerliTarih(t?: string | null): t is string {
  return !!t && /^\d{4}-\d{2}-\d{2}/.test(t) && Number(t.slice(0, 4)) >= 2000;
}

export interface PuantajPersonel {
  id: number | string;
  durum?: string | null;
  ise_giris_tarihi?: string | null;
  isten_cikis_tarihi?: string | null;
}

/**
 * Personel verilen günde işte miydi? (günlük rapor puantaj listesine girer mi)
 * - işe giriş tarihi günden sonraysa: hayır
 * - işten çıkış tarihi günden önceyse: hayır
 * - bozuk tarihler (yıl < 2000) sınır olarak kullanılmaz
 * - "ayrildi" olup geçerli çıkış tarihi olmayan personel: ne zaman ayrıldığı bilinmediği için hayır
 */
export function tarihteCalisiyorMu(p: PuantajPersonel, gun: string): boolean {
  const giris = gecerliTarih(p.ise_giris_tarihi) ? p.ise_giris_tarihi.slice(0, 10) : null;
  const cikis = gecerliTarih(p.isten_cikis_tarihi) ? p.isten_cikis_tarihi.slice(0, 10) : null;
  if (giris && giris > gun) return false;
  if (cikis && cikis < gun) return false;
  if (p.durum === "ayrildi" && !cikis) return false;
  return true;
}

/**
 * Günlük rapordaki puantaj listesi: o gün çalışır durumdaki personel + o gün zaten
 * puantaj kaydı olan personel (kayıtlar kaybolmasın diye). Sıra korunur.
 */
export function puantajListesi<T extends PuantajPersonel>(personeller: T[], gun: string, kayitliIdler: Iterable<string> = []): T[] {
  const kayitli = new Set(Array.from(kayitliIdler, String));
  return personeller.filter(p => kayitli.has(String(p.id)) || tarihteCalisiyorMu(p, gun));
}

export interface PuantajGirdisi {
  personel_id: number | string;
  durum?: string | null;
  fazla_mesai_saat?: number | string | null;
  rapor_id?: string | null;
}

const durumYazi = (d?: string | null) => (durumGecerliMi(d) ? DURUM_ETIKET[d] : d || "—");
const fmYazi = (n: number) => (n ? ` +${String(Math.round(n * 100) / 100).replace(".", ",")} sa` : "");

/**
 * Değişiklik talebindeki puantaj (yeni) ile veritabanındaki mevcut kayıtlar arasındaki farklar.
 * "Puantaj — Ali" : "Çalıştı" → "Yıllık izin". O gün için hiç kayıt yoksa tek satır özet döner.
 * raporId verilirse, rapora bağlı olup yeni listede olmayan kayıtlar "silinecek" diye gösterilir.
 */
export function puantajFarklari(
  mevcut: PuantajGirdisi[],
  yeni: PuantajGirdisi[],
  isimler: Record<string, string>,
  raporId?: string | null,
): { alan: string; eskiDeger: string; yeniDeger: string }[] {
  const isim = (id: string) => isimler[id] || `#${id}`;
  if (!mevcut.length) {
    if (!yeni.length) return [];
    return [{ alan: "Puantaj (ilk kez girilecek)", eskiDeger: "—", yeniDeger: gunlukOzetMetni(yeni.map(y => String(y.durum || "calisti"))) }];
  }
  const eskiHarita = new Map(mevcut.map(k => [String(k.personel_id), k]));
  const yeniIdler = new Set<string>();
  const farklar: { alan: string; eskiDeger: string; yeniDeger: string }[] = [];
  for (const y of yeni) {
    const id = String(y.personel_id);
    yeniIdler.add(id);
    const e = eskiHarita.get(id);
    const yDurum = y.durum || "calisti";
    const yFm = Number(y.fazla_mesai_saat) || 0;
    if (!e) {
      farklar.push({ alan: `Puantaj — ${isim(id)}`, eskiDeger: "—", yeniDeger: durumYazi(yDurum) + fmYazi(yFm) });
      continue;
    }
    const eFm = Number(e.fazla_mesai_saat) || 0;
    if (e.durum !== yDurum || Math.abs(eFm - yFm) > 0.001)
      farklar.push({ alan: `Puantaj — ${isim(id)}`, eskiDeger: durumYazi(e.durum) + fmYazi(eFm), yeniDeger: durumYazi(yDurum) + fmYazi(yFm) });
  }
  if (raporId) {
    for (const e of mevcut) {
      const id = String(e.personel_id);
      if (!yeniIdler.has(id) && e.rapor_id === raporId)
        farklar.push({ alan: `Puantaj — ${isim(id)}`, eskiDeger: durumYazi(e.durum) + fmYazi(Number(e.fazla_mesai_saat) || 0), yeniDeger: "Kayıt silinecek" });
    }
  }
  return farklar;
}
