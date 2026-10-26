// ─── KEBO CARİ EKSTRESİ (PDF) ──────────────────────────────────────────────────
// Kebo her cuma "Cari Hesap Ekstresi" PDF'i gönderir. Ekstre KEBO'nun gözünden yazılmıştır:
//   Borç   = Kebo'nun bize kestiği fatura (bizim için alış faturası)
//   Alacak = bizim ödememiz / mahsup (havale, kredi kartı tahsilatı, platform virmanı, iade, gider faturası)
//   Bakiye = bizim Kebo'ya borcumuz (B)
// Bu dosya saf mantıktır: PDF metin parçalarından (konumlarıyla) satırları çıkarır ve
// sistemdeki faturalar/ödemelerle karşılaştırıp yapılacak işlemlerin planını kurar.

export interface PdfParca { str: string; x: number; y: number; w: number }
export interface PdfSayfa { parcalar: PdfParca[] }

export type EvrakGrubu = "fatura" | "havale" | "kredi_karti" | "virman" | "iade" | "gider_faturasi" | "acilis" | "diger";

export interface EkstreSatir {
  tarih: string;        // YYYY-MM-DD
  evrakNo: string;
  evrakTuru: string;    // PDF'teki ham ad ("Satış Faturası", "Cari Virman Fişi"...)
  grup: EvrakGrubu;
  aciklama: string;
  borc: number;         // Kebo'nun bize faturası
  alacak: number;       // bizim ödememiz / mahsup
  bakiye: number;       // satır sonrası bakiye (+ = biz borçluyuz)
  vade: string | null;  // YYYY-MM-DD
}

export interface EkstreSonuc {
  satirlar: EkstreSatir[];
  toplamBorc: number; toplamAlacak: number; sonBakiye: number;
  /** PDF'in "Toplam Tutarlar" satırı (varsa) */
  pdfToplam: { borc: number; alacak: number; bakiye: number } | null;
  /** Bakiye zinciri ve toplamlar tutarlı mı? Tutarsız satırların açıklamaları */
  uyarilar: string[];
  raporTarihi: string | null;
}

const yuvarla = (n: number) => Math.round(n * 100) / 100;
const SAYI = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
const TARIH = /^(\d{2})\.(\d{2})\.(\d{4})$/;

export function trSayi(s: string): number {
  return Number(s.trim().replace(/\./g, "").replace(",", "."));
}
export function trTarih(s: string): string | null {
  const m = s.trim().match(TARIH);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function evrakGrubu(tur: string): EvrakGrubu {
  const t = tur.toLocaleLowerCase("tr-TR");
  if (t.includes("iade")) return "iade";
  if (t.includes("gider fatura")) return "gider_faturasi";
  if (t.includes("fatura")) return "fatura";
  if (t.includes("havale") || t.includes("eft")) return "havale";
  if (t.includes("kredi kart")) return "kredi_karti";
  if (t.includes("virman")) return "virman";
  if (t.includes("açılış") || t.includes("acilis") || t.includes("devir")) return "acilis";
  return "diger";
}

interface Kolonlar {
  evrakNo: number; evrakTuru: number; aciklama: number;
  borcSag: number; alacakSag: number; bakiyeSag: number; ba: number; vade: number;
}

/** Başlık satırındaki ("Tarih Evrak No Evrak Türü ...") parçalardan kolon konumlarını bulur. */
function kolonlariBul(parcalar: PdfParca[]): Kolonlar | null {
  const bul = (ad: string) => parcalar.find(p => p.str.trim() === ad);
  const borc = bul("Borç"), alacak = bul("Alacak"), bakiye = bul("Bakiye");
  const evrakNo = bul("Evrak No"), evrakTuru = bul("Evrak Türü"), aciklama = bul("Açıklama");
  const ba = bul("B/A"), vade = bul("Vade Tarihi");
  if (!borc || !alacak || !bakiye || !evrakNo || !evrakTuru || !aciklama) return null;
  return {
    evrakNo: evrakNo.x, evrakTuru: evrakTuru.x, aciklama: aciklama.x,
    borcSag: borc.x + borc.w, alacakSag: alacak.x + alacak.w, bakiyeSag: bakiye.x + bakiye.w,
    ba: ba ? ba.x : bakiye.x + bakiye.w + 3, vade: vade ? vade.x : bakiye.x + bakiye.w + 20,
  };
}

/** PDF sayfalarından ekstre satırlarını çıkarır. */
export function ekstreAyristir(sayfalar: PdfSayfa[]): EkstreSonuc {
  const satirlar: EkstreSatir[] = [];
  const uyarilar: string[] = [];
  let pdfToplam: EkstreSonuc["pdfToplam"] = null;
  let raporTarihi: string | null = null;

  for (const [si, sayfa] of sayfalar.entries()) {
    const parcalar = sayfa.parcalar.filter(p => p.str.trim() !== "");
    const k = kolonlariBul(parcalar);
    if (!k) { uyarilar.push(`${si + 1}. sayfada ekstre başlığı bulunamadı.`); continue; }
    if (!raporTarihi) {
      const rt = parcalar.find(p => /^\d{2}\.\d{2}\.\d{4}\s*-\s*\d{2}:\d{2}$/.test(p.str.trim()));
      if (rt) raporTarihi = trTarih(rt.str.trim().slice(0, 10));
    }
    // Aynı y'deki parçalar bir satırdır (±2 birim tolerans)
    const gruplar: PdfParca[][] = [];
    for (const p of [...parcalar].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const g = gruplar.find(g => Math.abs(g[0].y - p.y) <= 2);
      if (g) g.push(p); else gruplar.push([p]);
    }
    for (const g of gruplar) {
      g.sort((a, b) => a.x - b.x);
      const metin = g.map(p => p.str.trim());
      // Toplam satırı
      if (metin.some(m => m.startsWith("Toplam Tutarlar"))) {
        const sayilar = g.filter(p => SAYI.test(p.str.trim()));
        if (sayilar.length >= 3) pdfToplam = {
          borc: trSayi(sayilar[0].str), alacak: trSayi(sayilar[1].str), bakiye: trSayi(sayilar[2].str),
        };
        continue;
      }
      const ilk = g[0];
      const tarih = trTarih(ilk.str);
      if (!tarih || ilk.x > k.evrakNo) continue; // satır tarihle başlamıyor → başlık / boş
      let evrakNo = "", evrakTuru = "", aciklama = "", vade: string | null = null, ba = "B";
      let borc = 0, alacak = 0, bakiye: number | null = null;
      for (const p of g.slice(1)) {
        const s = p.str.trim(); const sag = p.x + p.w;
        if (SAYI.test(s)) {
          // Sayılar sağa yaslı: en yakın kolon sağ kenarına göre
          const uz = [Math.abs(sag - k.borcSag), Math.abs(sag - k.alacakSag), Math.abs(sag - k.bakiyeSag)];
          const i = uz.indexOf(Math.min(...uz));
          if (i === 0) borc = trSayi(s); else if (i === 1) alacak = trSayi(s); else bakiye = trSayi(s);
        } else if (TARIH.test(s) && p.x >= k.vade - 10) {
          vade = trTarih(s);
        } else if ((s === "B" || s === "A") && p.x >= k.ba - 10) {
          ba = s;
        } else if (p.x < k.evrakTuru - 8) {
          evrakNo += (evrakNo ? " " : "") + s;
        } else if (p.x < k.aciklama - 2) {
          evrakTuru += (evrakTuru ? " " : "") + s;
        } else {
          aciklama += (aciklama ? " " : "") + s;
        }
      }
      if (bakiye === null) continue; // "Nakli Yekün" gibi tutarsız satırlar
      // Bazı satırlarda PDF evrak no ile evrak türünü tek parça yazar ("0000000018 Kredi Kartı Tahsilatı")
      if (!evrakTuru) {
        const m = evrakNo.match(/^(\S+)\s+(.+)$/);
        if (m) { evrakNo = m[1]; evrakTuru = m[2]; }
      }
      satirlar.push({
        tarih, evrakNo, evrakTuru, grup: evrakGrubu(evrakTuru), aciklama,
        borc: yuvarla(borc), alacak: yuvarla(alacak), bakiye: yuvarla(ba === "A" ? -bakiye : bakiye), vade,
      });
    }
  }

  // Bakiye zinciri: her satırda önceki bakiye + borç − alacak = bakiye olmalı.
  // Kolon ayrımı şaşarsa (borç/alacak yer değiştirirse) bakiye farkından düzelt.
  let onceki = 0;
  for (const s of satirlar) {
    const beklenen = yuvarla(onceki + s.borc - s.alacak);
    if (Math.abs(beklenen - s.bakiye) > 0.01) {
      const tutar = s.borc || s.alacak;
      const fark = yuvarla(s.bakiye - onceki);
      if (Math.abs(Math.abs(fark) - tutar) <= 0.01) {
        s.borc = fark > 0 ? tutar : 0; s.alacak = fark < 0 ? tutar : 0;
      } else {
        uyarilar.push(`${s.tarih} ${s.evrakNo}: bakiye tutmuyor (beklenen ${beklenen}, ekstrede ${s.bakiye}).`);
      }
    }
    onceki = s.bakiye;
  }
  const toplamBorc = yuvarla(satirlar.reduce((t, s) => t + s.borc, 0));
  const toplamAlacak = yuvarla(satirlar.reduce((t, s) => t + s.alacak, 0));
  const sonBakiye = satirlar.length ? satirlar[satirlar.length - 1].bakiye : 0;
  if (pdfToplam) {
    if (Math.abs(pdfToplam.borc - toplamBorc) > 0.01) uyarilar.push(`Borç toplamı tutmuyor: okunan ${toplamBorc}, ekstrede ${pdfToplam.borc}.`);
    if (Math.abs(pdfToplam.alacak - toplamAlacak) > 0.01) uyarilar.push(`Alacak toplamı tutmuyor: okunan ${toplamAlacak}, ekstrede ${pdfToplam.alacak}.`);
    if (Math.abs(pdfToplam.bakiye - sonBakiye) > 0.01) uyarilar.push(`Son bakiye tutmuyor: okunan ${sonBakiye}, ekstrede ${pdfToplam.bakiye}.`);
  } else {
    uyarilar.push("Ekstrenin \"Toplam Tutarlar\" satırı bulunamadı — PDF eksik olabilir.");
  }
  return { satirlar, toplamBorc, toplamAlacak, sonBakiye, pdfToplam, uyarilar, raporTarihi };
}

// ─── MUTABAKAT PLANI ────────────────────────────────────────────────────────────
export interface SistemFatura { id: string; fatura_no: string; fatura_tarihi: string; toplam_tutar: number; durum: string; hatir_faturasi?: boolean | null }
export interface SistemOdeme { id: string; tarih: string; tutar: number; aciklama: string | null; fatura_idleri?: string[] | null }

/** Ekstreden gelen ödeme kayıtlarının açıklama ön eki — tekrar yüklemede aynı satırı tanımak için */
export const EKSTRE_ONEK = "Kebo ekstre";
export const DUZELTME_ACIKLAMA = `${EKSTRE_ONEK} · bakiye düzeltmesi`;
export const ekstreAnahtar = (s: Pick<EkstreSatir, "tarih" | "evrakNo" | "alacak">) => `${s.tarih}|${s.evrakNo}|${s.alacak.toFixed(2)}`;

/** Alacak satırının sistemdeki ödeme yöntemi adı (hiçbiri kasaya yansımaz) */
export function odemeYontemiAdi(g: EvrakGrubu): string {
  switch (g) {
    case "havale": return "Banka Havalesi";
    case "kredi_karti": return "Kredi Kartı";
    case "virman": return "Hakedişten Mahsup";
    case "iade": return "İade Faturası";
    case "gider_faturasi": return "Gider Faturası (mahsup)";
    default: return "Diğer";
  }
}

export interface MutabakatPlani {
  yeniFaturalar: EkstreSatir[];
  tutarFarklari: { fatura: SistemFatura; satir: EkstreSatir }[];
  /** Ekstre döneminde sistemde olup ekstrede olmayan faturalar (silinmez, sadece uyarı) */
  ekstredeOlmayan: SistemFatura[];
  yeniOdemeler: EkstreSatir[];
  /** Başlangıç tarihinden önceki, sistemde karşılığı bulunamayan tahsilatlar (sistemde toplu girilmiş sayılır, eklenmez) */
  atlananOdemeler: EkstreSatir[];
  /** Bakiye eşitleme: hangi faturalar açık kalacak, hangileri kapanacak */
  acikKalacak: string[]; kapanacak: string[]; acilacak: string[];
  /** Açık faturalar toplamı ile ekstre bakiyesi arasındaki küsurat (serbest düzeltme kaydı) */
  duzeltme: number;
  hedefBakiye: number;
}

/**
 * Ekstredeki tahsilatların hangi tarihten itibaren tek tek ekleneceği.
 * Ekstre yüklemeden önce girilmiş ödemeler çoğunlukla toplu ("43 fatura için ödeme") olduğundan satır satır
 * eşleşmez; onlardan önceki tahsilatları eklemek ödemeyi iki kez saydırır.
 * Daha önce ekstre işlendiyse başlangıç sabittir: ekstreden gelen ilk tahsilatın tarihi (sonradan elle girilen
 * cuma ödemeleri tarihi ileri kaydırıp geç işlenen virmanları atlatmasın). İlk yüklemede: ekstre dışı en son
 * ödemenin ertesi günü. (Sonraki satırlar anahtarla ya da aynı gün + aynı tutarla tanınır.)
 */
export function varsayilanOdemeBaslangici(odemeler: SistemOdeme[]): string {
  const ekstredenIlk = odemeler.filter(o => (o.aciklama || "").startsWith(EKSTRE_ONEK) && o.aciklama !== DUZELTME_ACIKLAMA)
    .map(o => o.tarih).sort()[0];
  if (ekstredenIlk) return ekstredenIlk;
  const son = odemeler.filter(o => !(o.aciklama || "").startsWith(EKSTRE_ONEK)).map(o => o.tarih).sort().at(-1);
  if (!son) return "0000-00-00";
  const d = new Date(son + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Sistemdeki Kebo faturaları/ödemeleri ile ekstreyi karşılaştırır.
 * Bakiye eşitleme FIFO'dur: Kebo hesabı tek bakiye üzerinden yürür, ödemeler en eski faturaları kapatır.
 * Bu yüzden en yeni faturalardan başlayarak bakiyeyi dolduran faturalar "bekliyor", geri kalanı "ödendi" olur;
 * son faturanın ödenmiş kısmı serbest (faturaya bağlı olmayan) bir düzeltme kaydıyla düşülür.
 * Böylece cari ekranındaki "Toplam Borç" = Kebo ekstresindeki bakiye.
 */
export function mutabakatPlani(ekstre: EkstreSonuc, faturalar: SistemFatura[], odemeler: SistemOdeme[], odemeBaslangic = varsayilanOdemeBaslangici(odemeler)): MutabakatPlani {
  const noIle = new Map(faturalar.map(f => [f.fatura_no.trim().toUpperCase(), f]));
  const ekstreFaturalari = ekstre.satirlar.filter(s => s.grup === "fatura" && s.borc > 0);
  const yeniFaturalar: EkstreSatir[] = [];
  const tutarFarklari: MutabakatPlani["tutarFarklari"] = [];
  for (const s of ekstreFaturalari) {
    const f = noIle.get(s.evrakNo.trim().toUpperCase());
    if (!f) yeniFaturalar.push(s);
    else if (Math.abs((Number(f.toplam_tutar) || 0) - s.borc) > 0.01) tutarFarklari.push({ fatura: f, satir: s });
  }
  const ekstreNolari = new Set(ekstreFaturalari.map(s => s.evrakNo.trim().toUpperCase()));
  const ilkTarih = ekstre.satirlar.find(s => s.grup !== "acilis")?.tarih ?? "0000-00-00";
  const ekstredeOlmayan = faturalar.filter(f => f.fatura_tarihi >= ilkTarih && !ekstreNolari.has(f.fatura_no.trim().toUpperCase()));

  // Ödemeler: önce ekstre anahtarıyla, yoksa aynı gün + aynı tutarla eşleşen sistem ödemesi var mı?
  const kullanilan = new Set<string>();
  const yeniOdemeler: EkstreSatir[] = [];
  const atlananOdemeler: EkstreSatir[] = [];
  const alacaklar = ekstre.satirlar.filter(s => s.alacak > 0 && s.grup !== "acilis");
  for (const s of alacaklar) {
    const anahtar = ekstreAnahtar(s);
    let es = odemeler.find(o => !kullanilan.has(o.id) && (o.aciklama || "").includes(anahtar));
    if (!es) es = odemeler.find(o => !kullanilan.has(o.id) && o.tarih === s.tarih && Math.abs((Number(o.tutar) || 0) - s.alacak) <= 0.01
      && !(o.aciklama || "").startsWith(EKSTRE_ONEK));
    if (es) kullanilan.add(es.id);
    else if (s.tarih < odemeBaslangic) atlananOdemeler.push(s);
    else yeniOdemeler.push(s);
  }

  // Bakiye eşitleme (yeni faturalar dahil, hatır faturaları hariç). Serbest ödemeler borçtan düşüldüğü için
  // hedef = ekstre bakiyesi + (önceki düzeltme hariç) serbest ödemeler.
  const serbest = odemeler.filter(o => Array.isArray(o.fatura_idleri) && o.fatura_idleri.length === 0 && o.aciklama !== DUZELTME_ACIKLAMA)
    .reduce((t, o) => t + (Number(o.tutar) || 0), 0);
  const hedefBakiye = yuvarla(ekstre.sonBakiye + serbest);
  type Kalem = { id: string; tarih: string; tutar: number; durum: string; no: string };
  const kalemler: Kalem[] = [
    ...faturalar.filter(f => !f.hatir_faturasi).map(f => ({ id: f.id, tarih: f.fatura_tarihi, tutar: Number(f.toplam_tutar) || 0, durum: f.durum, no: f.fatura_no })),
    ...yeniFaturalar.map(s => ({ id: `yeni:${s.evrakNo}`, tarih: s.tarih, tutar: s.borc, durum: "yeni", no: s.evrakNo })),
  ].sort((a, b) => b.tarih.localeCompare(a.tarih) || b.no.localeCompare(a.no));
  // Tutar farkı olan faturalarda ekstredeki tutarı esas al
  const duzeltilmisTutar = new Map(tutarFarklari.map(t => [t.fatura.id, t.satir.borc]));
  const acikKalacak: string[] = []; let kum = 0;
  for (const k of kalemler) {
    if (kum >= hedefBakiye - 0.005) break;
    acikKalacak.push(k.id); kum += duzeltilmisTutar.get(k.id) ?? k.tutar;
  }
  const acikSet = new Set(acikKalacak);
  const kapanacak = faturalar.filter(f => !f.hatir_faturasi && !acikSet.has(f.id) && f.durum !== "odendi").map(f => f.id);
  const acilacak = faturalar.filter(f => acikSet.has(f.id) && f.durum === "odendi").map(f => f.id);
  return {
    yeniFaturalar, tutarFarklari, ekstredeOlmayan, yeniOdemeler, atlananOdemeler,
    acikKalacak, kapanacak, acilacak, duzeltme: yuvarla(Math.max(0, kum - hedefBakiye)), hedefBakiye,
  };
}

// ─── VADE (sadece Kebo) ─────────────────────────────────────────────────────────
// Kebo'da her faturanın ödemesi kesildiği günden itibaren 15 gün içinde yapılır.
export const KEBO_VADE_GUN = 15;
export const keboCariMi = (unvan?: string | null) => /kebo/i.test(unvan || "");

export function gunEkle(tarih: string, gun: number): string {
  const d = new Date(tarih + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}
/** Faturanın vadesi: ekstreden gelen vade_tarihi, yoksa fatura tarihi + 15 gün */
export const keboVade = (f: { fatura_tarihi: string; vade_tarihi?: string | null }) => f.vade_tarihi || gunEkle(f.fatura_tarihi, KEBO_VADE_GUN);

/** Bugünden itibaren ilk cuma (bugün cumaysa bugün) — Kebo ekstresi ve ödemesi cuma günü */
export function sonrakiCuma(bugunStr: string): string {
  const d = new Date(bugunStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export interface VadeKalemi { id: string; fatura_no: string; fatura_tarihi: string; vade: string; kalan: number }
export interface VadeOzeti {
  kalemler: VadeKalemi[];          // vadesi tarihe kadar dolan açık faturalar (kalan tutarlarıyla)
  toplam: number;                  // tarihe kadar ödenmesi gereken
  gecikmis: number;                // bugünden önce vadesi geçmiş kısım
  sonraki: number;                 // vadesi tarihten sonra olan açık bakiye
}

/**
 * Vadesi verilen tarihe kadar dolan Kebo borcu. Faturaya bağlı olmayan (serbest) ödemeler — ekstre bakiye
 * düzeltmesi dahil — en eski açık faturadan düşülür (FIFO), kalan tutarlar vadeye göre toplanır.
 */
export function keboVadeOzeti(
  faturalar: (SistemFatura & { vade_tarihi?: string | null })[], odemeler: SistemOdeme[], tarih: string, bugunStr: string,
): VadeOzeti {
  let serbest = odemeler.filter(o => Array.isArray(o.fatura_idleri) && o.fatura_idleri.length === 0)
    .reduce((t, o) => t + (Number(o.tutar) || 0), 0);
  const acik = faturalar.filter(f => f.durum !== "odendi" && !f.hatir_faturasi)
    .sort((a, b) => a.fatura_tarihi.localeCompare(b.fatura_tarihi) || a.fatura_no.localeCompare(b.fatura_no));
  const tumu: VadeKalemi[] = [];
  for (const f of acik) {
    let kalan = Number(f.toplam_tutar) || 0;
    const dus = Math.min(kalan, serbest); kalan -= dus; serbest -= dus;
    if (kalan > 0.005) tumu.push({ id: f.id, fatura_no: f.fatura_no, fatura_tarihi: f.fatura_tarihi, vade: keboVade(f), kalan: yuvarla(kalan) });
  }
  const kalemler = tumu.filter(k => k.vade <= tarih).sort((a, b) => a.vade.localeCompare(b.vade));
  return {
    kalemler,
    toplam: yuvarla(kalemler.reduce((t, k) => t + k.kalan, 0)),
    gecikmis: yuvarla(tumu.filter(k => k.vade < bugunStr).reduce((t, k) => t + k.kalan, 0)),
    sonraki: yuvarla(tumu.filter(k => k.vade > tarih).reduce((t, k) => t + k.kalan, 0)),
  };
}
