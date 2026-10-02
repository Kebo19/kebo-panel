// ─── MAGICPAY KARŞILAŞTIRMA ─────────────────────────────────────────────────
// MagicPay (adisyon programının raporlama sitesi, kebo-admin-ui.magicpay.ai)
// rakamlarını elle girilen Kasa Raporu ile karşılaştırır. Hiçbir şey
// kaydetmez/değiştirmez; sadece "nerede fark var" sorusunu cevaplar.
//
// Karşılaştırma ekranını SADECE `MAGICPAY_GORENLER` listesindeki kullanıcılar
// görür (proxy.ts sayfayı, /api/magicpay-karsilastirma veriyi korur). Diğer
// kullanıcılar API'den sadece platform indirimlerini alır (`kapsam=indirim`):
// Kasa Raporu'ndaki indirim hücreleri bununla otomatik doldurulur.
//
// MagicPay'deki adlar → panel alanları:
//   • Paket kanalları (online_source_breakdown): marka adında "chick/chikn" geçen
//     CNF, diğerleri Kebo. "LOCAL" kanalı = Alo Paket (Kebo + CNF birlikte).
//     Panelde platform tutarları İNDİRİM ÖNCESİ girildiği için MagicPay'in
//     `gross_turnover` (brüt) değeriyle karşılaştırılır.
//   • Masa ödemeleri (payment_masa_breakdown) = adisyon kasa raporu = panelde
//     kasa_nakit / kasa_pos / yemek kartları. Kasa sayımı nakit giderler
//     ödendikten sonra yapıldığı için nakit, kasa_nakit + günlük gider ile
//     karşılaştırılır.
//   • Paket ödemeleri (payment_paket_breakdown) personelin serbest yazdığı adlar
//     içerir ("KREDİ KARTI", "kart", "Pos", "NAKİT"...). Kapıda tahsil edilenler
//     panelde kurye satırlarındaki nakit/POS ile karşılaştırılır.

/**
 * MagicPay karşılaştırmasını görebilenler (auth kullanıcı id'leri):
 * Murat Can Çömüz (murat@kebo.com) ve Bülent Çöphüseyinoğlu (bulent@kebo.com).
 * Diğer kullanıcılar MagicPay'den sadece platform indirimlerini çeker (Kasa Raporu'na otomatik yazılır).
 */
export const MAGICPAY_GORENLER: readonly string[] = [
  "c4d199e9-e0b7-4d33-8ad8-556f7d488bac", // murat@kebo.com
  "e75d458f-1c36-405a-bd56-3c590c28cd54", // bulent@kebo.com
];
export const MAGICPAY_SAYFASI = "/magicpay";
export const magicpayGorebilirMi = (userId?: string | null): boolean =>
  !!userId && MAGICPAY_GORENLER.includes(userId);

// ─── MagicPay verisi (API route'un döndürdüğü sade biçim) ───────────────────

export interface MpKaynak {
  /** yemeksepeti | trendyol | migros | local ... */
  platform: string;
  marka: string | null;
  etiket: string;
  siparis: number;
  brut: number;
  indirim: number;
  net: number;
}

export interface MpGun {
  tarih: string;
  brut: number;
  net: number;
  indirim: number;
  iade: number;
  iptal: number;
  siparisMasa: number;
  siparisPaket: number;
  masaCiro: number;
  paketCiro: number;
  masaOdeme: Record<string, number>;
  paketOdeme: Record<string, number>;
  kaynaklar: MpKaynak[];
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};

function sayiSozlugu(o: unknown): Record<string, number> {
  const s: Record<string, number> = {};
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) s[k] = (s[k] || 0) + n(v);
  return s;
}

/** /reports/turnover/daily cevabındaki tek gün satırını sade biçime çevirir. */
export function mpGunCoz(r: Record<string, unknown>): MpGun {
  const kaynaklar: MpKaynak[] = Object.values((r.online_source_breakdown as Record<string, Record<string, unknown>>) || {})
    .map(s => ({
      platform: String(s.platform_key || s.integration_code || "").toLowerCase(),
      marka: (s.brand_name as string | null) ?? null,
      etiket: String(s.label || s.platform_label || "?"),
      siparis: n(s.orders),
      brut: n(s.gross_turnover),
      indirim: n(s.discount_amount),
      net: n(s.net_turnover ?? s.turnover),
    }));
  return {
    tarih: String(r.day || ""),
    brut: n(r.gross_turnover),
    net: n(r.turnover_total ?? r.net_turnover),
    indirim: n(r.discount_amount ?? r.discount_total),
    iade: n(r.refund_total),
    iptal: n(r.cancel_total),
    siparisMasa: n(r.orders_masa),
    siparisPaket: n(r.orders_paket),
    masaCiro: n(r.turnover_masa_total),
    paketCiro: n(r.turnover_paket_total),
    masaOdeme: sayiSozlugu(r.payment_masa_breakdown),
    paketOdeme: sayiSozlugu(r.payment_paket_breakdown),
    kaynaklar,
  };
}

// ─── Eşleştirme kuralları ───────────────────────────────────────────────────

const sade = (s: string) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").trim();

export type Kanal = "kebo_ys" | "kebo_trendyol" | "kebo_migros" | "cnf_ys" | "cnf_trendyol" | "cnf_migros" | "alo" | "diger";

export const KANALLAR: { kanal: Exclude<Kanal, "diger">; ad: string }[] = [
  { kanal: "kebo_ys", ad: "Kebo · Yemeksepeti" },
  { kanal: "kebo_trendyol", ad: "Kebo · Trendyol" },
  { kanal: "kebo_migros", ad: "Kebo · Migros" },
  { kanal: "cnf_ys", ad: "CNF · Yemeksepeti" },
  { kanal: "cnf_trendyol", ad: "CNF · Trendyol" },
  { kanal: "cnf_migros", ad: "CNF · Migros Yemek" },
  { kanal: "alo", ad: "Alo Paket (LOCAL)" },
];

/** MagicPay paket kaynağı hangi panel kanalına denk geliyor? */
export function kanalBul(k: Pick<MpKaynak, "platform" | "marka">): Kanal {
  const p = sade(k.platform);
  if (p === "local" || p === "restaurant") return "alo";
  const cnf = /chick|chikn|cnf/.test(sade(k.marka || ""));
  if (p.includes("yemeksepeti")) return cnf ? "cnf_ys" : "kebo_ys";
  if (p.includes("trendyol")) return cnf ? "cnf_trendyol" : "kebo_trendyol";
  if (p.includes("migros")) return cnf ? "cnf_migros" : "kebo_migros";
  return "diger";
}

/** Panelde bir kanalın alanları (online + kapıda toplanır). */
const PANEL_ALANLARI: Record<Exclude<Kanal, "diger">, { tutar: string[]; paket: string[]; indirim: string[] }> = {
  kebo_ys: { tutar: ["os_kebo_ys", "ko_kebo_ys"], paket: ["os_kebo_ys_paket", "ko_kebo_ys_paket"], indirim: ["os_kebo_ys_indirim", "ko_kebo_ys_indirim"] },
  kebo_trendyol: { tutar: ["os_kebo_trendyol", "ko_kebo_trendyol"], paket: ["os_kebo_trendyol_paket", "ko_kebo_trendyol_paket"], indirim: ["os_kebo_trendyol_indirim", "ko_kebo_trendyol_indirim"] },
  kebo_migros: { tutar: ["os_kebo_migros", "ko_kebo_migros_yemek"], paket: ["os_kebo_migros_paket", "ko_kebo_migros_yemek_paket"], indirim: ["os_kebo_migros_indirim"] },
  cnf_ys: { tutar: ["os_cnf_ys", "ko_cnf_ys"], paket: ["os_cnf_ys_paket", "ko_cnf_ys_paket"], indirim: ["os_cnf_ys_indirim", "ko_cnf_ys_indirim"] },
  cnf_trendyol: { tutar: ["os_cnf_trendyol", "ko_cnf_trendyol"], paket: ["os_cnf_trendyol_paket", "ko_cnf_trendyol_paket"], indirim: ["os_cnf_trendyol_indirim", "ko_cnf_trendyol_indirim"] },
  cnf_migros: { tutar: ["os_cnf_migros_yemek", "ko_cnf_migros_yemek"], paket: ["os_cnf_migros_yemek_paket", "ko_cnf_migros_yemek_paket"], indirim: ["os_cnf_migros_yemek_indirim"] },
  alo: { tutar: ["os_kebo_alo", "ko_kebo_alo", "ko_cnf_alo"], paket: ["os_kebo_alo_paket", "ko_kebo_alo_paket", "ko_cnf_alo_paket"], indirim: ["os_kebo_alo_indirim"] },
};

/** Masa ödeme anahtarı → panel kasa alanı. */
export type KasaKalemi = "nakit" | "pos" | "kasa_edenred" | "kasa_metropol" | "kasa_setcard" | "kasa_pluxee" | "kasa_paye" | "kasa_multinet" | "yemek_tanimsiz";

export function masaOdemeKalemi(anahtar: string): KasaKalemi {
  const a = sade(anahtar);
  if (/ticket|edenred/.test(a)) return "kasa_edenred";
  if (/metropol/.test(a)) return "kasa_metropol";
  if (/setcard/.test(a)) return "kasa_setcard";
  if (/pluxee|sodexo/.test(a)) return "kasa_pluxee";
  if (/paye/.test(a)) return "kasa_paye";
  if (/multinet/.test(a)) return "kasa_multinet";
  if (/meal|yemek/.test(a)) return "yemek_tanimsiz";
  if (/^(cash|nakit)$|nakit/.test(a)) return "nakit";
  return "pos"; // card, kredi kartı, pos...
}

/** Paket ödeme anahtarı → kim tahsil etti? */
export type PaketOdemeTuru = "online" | "kapida_nakit" | "kapida_kart" | "kapida_yemek" | "kapida_platform" | "bilinmiyor";

export function paketOdemeTuru(anahtar: string): PaketOdemeTuru {
  const ham = anahtar.trim();
  const a = sade(ham);
  // Platform kodları BÜYÜK_HARF_ALT_ÇİZGİ: YEMEKSEPETI_CARD, TRENDYOL_EDENRED, MIGROS_MONEY_PAY...
  if (/^(yemeksepeti|trendyol|migros|getir)_/.test(a)) {
    return /on_delivery/.test(a) ? "kapida_platform" : "online";
  }
  if (/yemek|ticket|meal|sodexo|pluxee|edenred|multinet|metropol|setcard/.test(a)) return "kapida_yemek";
  if (/nak|cash/.test(a)) return "kapida_nakit";
  if (/kart|krd|kredi|card|pos/.test(a)) return "kapida_kart";
  return "bilinmiyor";
}

// ─── Karşılaştırma ──────────────────────────────────────────────────────────

export type Durum = "ok" | "fark" | "bilgi" | "yok";

export interface Satir {
  ad: string;
  aciklama?: string;
  panel: number | null;
  mp: number;
  /** panel − mp (panel yoksa null) */
  fark: number | null;
  durum: Durum;
  tur: "para" | "adet";
}

export interface Bolum {
  baslik: string;
  aciklama?: string;
  satirlar: Satir[];
}

export interface GunKarsilastirma {
  tarih: string;
  raporVar: boolean;
  bolumler: Bolum[];
  farkSayisi: number;
}

/** Panel satırı: gunluk_raporlar'dan select("*") ile gelen ham satır. */
export type PanelRaporu = Record<string, unknown> & { tarih: string; kurye_raporlari?: unknown };

export const PARA_TOLERANSI = 1;

function satir(ad: string, panel: number | null, mp: number, tur: "para" | "adet", opt: { aciklama?: string; bilgi?: boolean } = {}): Satir {
  const fark = panel === null ? null : Math.round((panel - mp) * 100) / 100;
  const tolerans = tur === "para" ? PARA_TOLERANSI : 0;
  const durum: Durum = panel === null ? "yok" : opt.bilgi ? "bilgi" : Math.abs(fark as number) > tolerans ? "fark" : "ok";
  return { ad, aciklama: opt.aciklama, panel, mp, fark, durum, tur };
}

const topla = (r: PanelRaporu | null, alanlar: string[]): number | null =>
  r ? alanlar.reduce((t, a) => t + n(r[a]), 0) : null;

function kuryeToplamlari(r: PanelRaporu | null): { nakit: number; pos: number; paket: number } | null {
  if (!r) return null;
  const liste = Array.isArray(r.kurye_raporlari) ? (r.kurye_raporlari as Record<string, unknown>[]) : [];
  const para = (v: unknown) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v ?? "").trim().replace(/\s/g, "").replace(/\./g, "").replace(/,/g, ".");
    const x = parseFloat(s);
    return Number.isFinite(x) ? x : 0;
  };
  const tam = (v: unknown) => { const x = parseInt(String(v ?? ""), 10); return Number.isFinite(x) ? x : 0; };
  return liste.reduce<{ nakit: number; pos: number; paket: number }>((t, k) => ({
    nakit: t.nakit + para(k.nakit),
    pos: t.pos + para(k.pos),
    paket: t.paket + tam(k.paketSayisi) + tam(k.uzakPaket) + tam(k.paket9km),
  }), { nakit: 0, pos: 0, paket: 0 });
}

const YEMEK_KARTI_ADLARI: Record<string, string> = {
  kasa_edenred: "Edenred (Ticket)", kasa_metropol: "Metropol", kasa_setcard: "Setcard",
  kasa_pluxee: "Pluxee", kasa_paye: "Paye", kasa_multinet: "Multinet",
};

/** Tek günün karşılaştırması. `rapor` null ise o gün panelde rapor yok. */
export function gunuKarsilastir(mp: MpGun, rapor: PanelRaporu | null): GunKarsilastirma {
  const bolumler: Bolum[] = [];

  // 1) Paket kanalları: paket sayısı, brüt tutar, indirim
  const mpKanal: Record<string, { siparis: number; brut: number; indirim: number; etiketler: string[] }> = {};
  for (const k of mp.kaynaklar) {
    const kanal = kanalBul(k);
    const t = (mpKanal[kanal] ||= { siparis: 0, brut: 0, indirim: 0, etiketler: [] });
    t.siparis += k.siparis; t.brut += k.brut; t.indirim += k.indirim; t.etiketler.push(k.etiket);
  }
  const paketSatirlari: Satir[] = [], tutarSatirlari: Satir[] = [], indirimSatirlari: Satir[] = [];
  for (const { kanal, ad } of KANALLAR) {
    const m = mpKanal[kanal] || { siparis: 0, brut: 0, indirim: 0, etiketler: [] };
    const alan = PANEL_ALANLARI[kanal];
    const panelPaket = topla(rapor, alan.paket), panelTutar = topla(rapor, alan.tutar), panelIndirim = topla(rapor, alan.indirim);
    // İki tarafta da sıfır olan kanalları gösterme
    if (!m.siparis && !m.brut && !panelPaket && !panelTutar) continue;
    const aciklama = m.etiketler.length ? `MagicPay: ${m.etiketler.join(", ")}` : undefined;
    paketSatirlari.push(satir(ad, panelPaket, m.siparis, "adet", { aciklama }));
    tutarSatirlari.push(satir(ad, panelTutar, m.brut, "para"));
    if (m.indirim || panelIndirim) indirimSatirlari.push(satir(ad, panelIndirim, m.indirim, "para"));
  }
  if (mpKanal.diger) {
    const d = mpKanal.diger;
    paketSatirlari.push(satir("Eşleşmeyen kanal", null, d.siparis, "adet", { aciklama: d.etiketler.join(", ") }));
    tutarSatirlari.push(satir("Eşleşmeyen kanal", null, d.brut, "para", { aciklama: d.etiketler.join(", ") }));
  }
  const kanalliSiparis = mp.kaynaklar.reduce((t, k) => t + k.siparis, 0);
  const panelPaketToplam = rapor ? paketSatirlari.reduce((t, s) => t + (s.panel || 0), 0) : null;
  paketSatirlari.push(satir("Toplam paket", panelPaketToplam, mp.siparisPaket, "adet",
    { aciklama: kanalliSiparis !== mp.siparisPaket ? `MagicPay'de ${mp.siparisPaket - kanalliSiparis} paket siparişin kanalı yok` : undefined }));
  const kurye = kuryeToplamlari(rapor);
  if (kurye && kurye.paket > 0) {
    const aloMp = mpKanal.alo?.siparis || 0;
    paketSatirlari.push(satir("Kuryelerin teslim ettiği paket", kurye.paket, aloMp, "adet",
      { bilgi: true, aciklama: "Kurye satırlarındaki paketler ↔ MagicPay Alo Paket. Kuryeler platform paketi de taşıyabileceği için sadece bilgi." }));
  }
  bolumler.push({ baslik: "Paket sayıları", satirlar: paketSatirlari });

  const panelTutarToplam = rapor ? tutarSatirlari.reduce((t, s) => t + (s.panel || 0), 0) : null;
  tutarSatirlari.push(satir("Toplam paket satışı", panelTutarToplam, mp.kaynaklar.reduce((t, k) => t + k.brut, 0), "para"));
  bolumler.push({ baslik: "Paket satışları (indirim öncesi)", aciklama: "Panelde platform tutarları indirim öncesi girilir; MagicPay'in brüt tutarıyla karşılaştırılır.", satirlar: tutarSatirlari });

  if (indirimSatirlari.length) {
    const panelIndirimToplam = rapor ? indirimSatirlari.reduce((t, s) => t + (s.panel || 0), 0) : null;
    indirimSatirlari.push(satir("Toplam indirim", panelIndirimToplam, indirimSatirlari.reduce((t, s) => t + s.mp, 0), "para"));
    bolumler.push({ baslik: "Platform indirimleri", satirlar: indirimSatirlari });
  }

  // 2) Kasa (masa ödemeleri)
  const masa: Record<KasaKalemi, number> = { nakit: 0, pos: 0, kasa_edenred: 0, kasa_metropol: 0, kasa_setcard: 0, kasa_pluxee: 0, kasa_paye: 0, kasa_multinet: 0, yemek_tanimsiz: 0 };
  for (const [k, v] of Object.entries(mp.masaOdeme)) masa[masaOdemeKalemi(k)] += v;
  const gider = rapor ? n(rapor.gunluk_gider) : 0;
  const kasaSatirlari: Satir[] = [
    satir("Nakit", rapor ? n(rapor.kasa_nakit) + gider : null, masa.nakit, "para",
      { aciklama: rapor && gider ? `Kasa sayımı ₺${Math.round(n(rapor.kasa_nakit)).toLocaleString("tr-TR")} + günlük gider ₺${Math.round(gider).toLocaleString("tr-TR")} (gider kasadan ödendiği için eklenir)` : "Kasa sayımı + günlük gider" }),
    satir("POS / Kredi kartı", rapor ? n(rapor.kasa_pos) : null, masa.pos, "para"),
  ];
  let panelYemek = 0;
  for (const alan of Object.keys(YEMEK_KARTI_ADLARI)) {
    const p = rapor ? n(rapor[alan]) : 0;
    panelYemek += p;
    const m = masa[alan as KasaKalemi];
    // MagicPay'de türü seçilmemiş kart varsa kart kart fark beklenir; o zaman sadece toplam denetlenir.
    if (p || m) kasaSatirlari.push(satir(YEMEK_KARTI_ADLARI[alan], rapor ? p : null, m, "para", { bilgi: masa.yemek_tanimsiz > 0 }));
  }
  if (masa.yemek_tanimsiz) kasaSatirlari.push(satir("Tanımsız yemek kartı", null, masa.yemek_tanimsiz, "para",
    { aciklama: "MagicPay'de türü seçilmemiş yemek kartı (unknown_meal_card) — toplamda karşılaştırılır" }));
  const mpYemek = masa.kasa_edenred + masa.kasa_metropol + masa.kasa_setcard + masa.kasa_pluxee + masa.kasa_paye + masa.kasa_multinet + masa.yemek_tanimsiz;
  if (panelYemek || mpYemek) kasaSatirlari.push(satir("Yemek kartları toplamı", rapor ? panelYemek : null, mpYemek, "para"));
  const panelKasa = rapor ? n(rapor.kasa_nakit) + gider + n(rapor.kasa_pos) + panelYemek : null;
  kasaSatirlari.push(satir("Kasa toplamı (masa)", panelKasa, Object.values(masa).reduce((a, b) => a + b, 0), "para"));
  bolumler.push({ baslik: "Kasa (masa satışları)", aciklama: "Adisyon programının kasa raporu: sadece masa ödemeleri, paket siparişler hariç.", satirlar: kasaSatirlari });

  // 3) Kapıda tahsilat (paket)
  const paket: Record<PaketOdemeTuru, number> = { online: 0, kapida_nakit: 0, kapida_kart: 0, kapida_yemek: 0, kapida_platform: 0, bilinmiyor: 0 };
  const paketDetay: Record<PaketOdemeTuru, string[]> = { online: [], kapida_nakit: [], kapida_kart: [], kapida_yemek: [], kapida_platform: [], bilinmiyor: [] };
  for (const [k, v] of Object.entries(mp.paketOdeme)) { const t = paketOdemeTuru(k); paket[t] += v; if (v) paketDetay[t].push(k); }
  const detay = (t: PaketOdemeTuru) => paketDetay[t].length ? `MagicPay: ${paketDetay[t].join(", ")}` : undefined;
  const kapidaSatirlari: Satir[] = [
    satir("Kapıda nakit", kurye ? kurye.nakit : null, paket.kapida_nakit, "para", { aciklama: detay("kapida_nakit") }),
    satir("Kapıda kart / POS", kurye ? kurye.pos : null, paket.kapida_kart, "para", { aciklama: detay("kapida_kart") }),
  ];
  if (paket.kapida_yemek) kapidaSatirlari.push(satir("Kapıda yemek kartı", null, paket.kapida_yemek, "para", { aciklama: detay("kapida_yemek") }));
  if (paket.kapida_platform) kapidaSatirlari.push(satir("Platform kapıda ödeme", null, paket.kapida_platform, "para", { aciklama: detay("kapida_platform") }));
  if (paket.bilinmiyor) kapidaSatirlari.push(satir("Ödeme türü belirsiz", null, paket.bilinmiyor, "para", { aciklama: detay("bilinmiyor") }));
  kapidaSatirlari.push(satir("Online ödenen (platform)", null, paket.online, "para", { aciklama: detay("online") }));
  bolumler.push({ baslik: "Paket ödemeleri / kapıda tahsilat", aciklama: "Panel tarafı: kurye satırlarındaki nakit ve POS toplamları.", satirlar: kapidaSatirlari });

  // 4) Genel
  const genel: Satir[] = [
    satir("İade", rapor ? n(rapor.iade_tutar) : null, mp.iade, "para"),
    satir("İptal (MagicPay)", null, mp.iptal, "para", { aciklama: "Panelde karşılığı yok, bilgi için" }),
    satir("Masa sipariş sayısı", null, mp.siparisMasa, "adet"),
  ];
  bolumler.push({ baslik: "Diğer", satirlar: genel });

  const farkSayisi = bolumler.reduce((t, b) => t + b.satirlar.filter(s => s.durum === "fark").length, 0);
  return { tarih: mp.tarih, raporVar: !!rapor, bolumler, farkSayisi };
}

// ─── Platform indirimleri → Kasa Raporu (otomatik doldurma) ─────────────────

/**
 * Her paket kanalının indirimi panelde hangi alana yazılır. Formda kanal başına
 * tek indirim hücresi var (online sütunu), MagicPay de online/kapıda ayırmıyor;
 * kanalın tüm indirimi bu alana yazılır, eski `ko_*_indirim` alanları 0 olur.
 */
export const INDIRIM_ALANLARI: Record<Exclude<Kanal, "diger">, string> = {
  kebo_ys: "os_kebo_ys_indirim",
  kebo_trendyol: "os_kebo_trendyol_indirim",
  kebo_migros: "os_kebo_migros_indirim",
  cnf_ys: "os_cnf_ys_indirim",
  cnf_trendyol: "os_cnf_trendyol_indirim",
  cnf_migros: "os_cnf_migros_yemek_indirim",
  alo: "os_kebo_alo_indirim",
};

/** Formda gösterilmeyen eski kapıda indirim alanları (MagicPay ile doldurulunca 0). */
export const ESKI_KAPIDA_INDIRIM_ALANLARI = ["ko_kebo_ys_indirim", "ko_kebo_trendyol_indirim", "ko_cnf_ys_indirim", "ko_cnf_trendyol_indirim"] as const;

/** Bir indirim alanının okunur adı (onay ekranı ve uyarılar için). */
export const INDIRIM_ALAN_ADLARI: Record<string, string> = Object.fromEntries(
  KANALLAR.map(k => [INDIRIM_ALANLARI[k.kanal], `${k.ad} indirim`]));

const kurus = (x: number) => Math.round(x * 100) / 100;

/** MagicPay gününden Kasa Raporu indirim alanları: { os_kebo_ys_indirim: 123.45, ... } (eşleşmeyen kanallar hariç). */
export function mpIndirimAlanlari(gun: MpGun | null | undefined): Record<string, number> {
  const sonuc: Record<string, number> = Object.fromEntries(Object.values(INDIRIM_ALANLARI).map(a => [a, 0]));
  for (const k of gun?.kaynaklar || []) {
    const kanal = kanalBul(k);
    if (kanal === "diger") continue;
    sonuc[INDIRIM_ALANLARI[kanal]] += k.indirim;
  }
  for (const a of Object.keys(sonuc)) sonuc[a] = kurus(sonuc[a]);
  return sonuc;
}

/**
 * Formdaki indirimler MagicPay'den farklı mı? Farklı olan alanların adlarını döner.
 * `form`: alan → tutar (formda olmayan alan 0 sayılır). Eski kapıda indirim alanları
 * MagicPay'de 0 kabul edilir. Kuruş farkı (≤ ₺0,01) yok sayılır.
 */
export function indirimFarkliAlanlar(magic: Record<string, number>, form: Record<string, number>): string[] {
  const alanlar = [...Object.values(INDIRIM_ALANLARI), ...ESKI_KAPIDA_INDIRIM_ALANLARI];
  return alanlar.filter(a => Math.abs((form[a] || 0) - (magic[a] || 0)) > 0.01);
}
