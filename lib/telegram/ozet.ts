// ─── TELEGRAM: ÖZET VE UYARI METİNLERİ ───────────────────────────────────────
// tg_veri RPC'sinin döndürdüğü ham veriden (kullanıcının yetkisi olan bölümler) Telegram
// mesajları üretir. Hesaplar panelle aynı kütüphanelerden gelir (hesap, cariEkstre, stok),
// böylece Telegram'daki rakam paneldekiyle aynı olur. Saf fonksiyonlar: test edilebilir.
import { raporOzeti, donemOzeti, platformKirilimi, kuryeTahsilati, kuryeKartToplami, roadrunnerGunOzeti, roadrunnerKuryeUcreti, yemekKartiToplam, nakitGiderToplam, kapidaKasadaMi, ROADRUNNER_GECIS_GUNU, RR_POS_KOMISYON_ORANI, type RaporVerisi } from "@/lib/hesap";
import { POS_KOMISYON_ORANI } from "@/lib/mutabakat";
import { vadeTakvimi, type TakvimFatura } from "@/lib/cariEkstre";
import { stokDurumu, siparisPlani, sayimGecikti, VARSAYILAN_SIPARIS, type StokHareketi } from "@/lib/stok";
import { gunEkle, fmtTarih } from "@/lib/tarih";

export const GUN_ADLARI_KISA = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export interface TgBakiye { cari_id: string; unvan: string; borc: number; odenmis: number; hakedisten: boolean }
export interface TgUrun { id: string; urun_adi: string; birim: string; kategori: string | null; min_stok: number; mevcut_stok: number; sayim_periyodu: string | null; sira_no: number | null; sayim_yeri?: string | null }
export interface TgBotLog { bitti: string | null; durum: string; mesaj: string | null; guncellenen?: unknown; kontrol?: unknown }
export interface TgVeri {
  raporlar?: RaporVerisi[];
  acik_faturalar?: TakvimFatura[];
  bakiyeler?: TgBakiye[];
  son_odemeler?: { tarih: string; cari: string; tutar: number; yontem: string | null }[];
  stok_urunler?: TgUrun[];
  stok_hareketler?: StokHareketi[];
  bot_log?: TgBotLog[];
  telegram_bekleyen?: number;
  mikro_pc_son?: string | null;
  telegram_kasa_bekleyen?: number;
  bekleyen_talepler?: number;
}

const tl = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(v || 0)) + " ₺";
const sayi = (v: number, d = 1) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v || 0);
export const html = (s: string) => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const kisaAd = (unvan: string) => {
  const s = (unvan || "").replace(/\s+(Anonim|Limited|Ltd\.?|A\.?Ş\.?|Şti\.?|Sanayi|Ticaret|Gıda|Elektronik|İletişim|Hizmetleri?).*$/i, "").trim();
  return (s || unvan || "").slice(0, 34);
};
const yuzde = (a: number, b: number) => (b > 0 ? Math.round((a / b - 1) * 100) : null);
const ok = (p: number | null) => (p === null ? "" : p >= 0 ? ` (▲ %${p})` : ` (▼ %${-p})`);

/** Bu haftanın (bugün dahil) Cuma günü */
export function buCuma(bugunStr: string): string {
  const g = new Date(bugunStr + "T12:00:00Z").getUTCDay();
  return gunEkle(bugunStr, (5 - g + 7) % 7);
}

// ── Ciro (31.10.2026: kısa özet + her satırın ayrıntısı butonla, panelin rapor detayıyla aynı mantık) ──
const N = (v: unknown) => Number(v) || 0;
const MARKALAR = [["kebo", "Kebo"], ["cnf", "Chick'N"], ["kir", "Kıraloğlu"]] as const;

/** Platform → marka: ciro (online + kapıda), indirim. En çok indirim yapılan platform önce. */
export function indirimKirilimi(r: RaporVerisi) {
  const x = r as unknown as Record<string, unknown>;
  const pl = (ad: string, satir: (m: string) => [number, number]) => {
    const markalar = MARKALAR.map(([m, mAd]) => { const [c, i] = satir(m); return { ad: mAd, ciro: c, indirim: i }; }).filter(m => m.ciro > 0 || m.indirim > 0);
    return { ad, markalar, ciro: markalar.reduce((t, m) => t + m.ciro, 0), indirim: markalar.reduce((t, m) => t + m.indirim, 0) };
  };
  return [
    pl("Yemeksepeti", m => [N(x[`os_${m}_ys`]) + N(x[`ko_${m}_ys`]), N(x[`os_${m}_ys_indirim`]) + N(x[`ko_${m}_ys_indirim`])]),
    pl("Trendyol", m => [N(x[`os_${m}_trendyol`]) + N(x[`ko_${m}_trendyol`]), N(x[`os_${m}_trendyol_indirim`]) + N(x[`ko_${m}_trendyol_indirim`])]),
    pl("Migros", m => m === "kebo"
      ? [N(x.os_kebo_migros) + N(x.ko_kebo_migros_yemek), N(x.os_kebo_migros_indirim)]
      : [N(x[`os_${m}_migros_yemek`]) + N(x[`ko_${m}_migros_yemek`]), N(x[`os_${m}_migros_yemek_indirim`]) + N(x[`os_${m}_migros_indirim`])]),
    pl("Alo Paket", m => [N(x[`os_${m}_alo`]) + N(x[`ko_${m}_alo`]), N(x[`os_${m}_alo_indirim`])]),
  ].filter(p => p.markalar.length).sort((a, b) => b.indirim - a.indirim);
}
const yz = (i: number, c: number) => (c > 0 ? `%${Math.round((i / c) * 100)}` : "—");

/** Raporda bakılması gerekenler: kurye tutmuyor, paket girilmemiş. (İndirim ayrı satırda.) */
export function raporUyarilariKisa(r: RaporVerisi): string[] {
  const out: string[] = [];
  const o = raporOzeti(r);
  if (r.tarih >= ROADRUNNER_GECIS_GUNU && (r.kurye_raporlari || []).length) {
    const getirilen = (r.kurye_raporlari || []).reduce((t, k) => t + N(k.nakit) + N(k.pos) + kuryeKartToplami(k), 0);
    const fark = Math.round(o.kapida - getirilen);
    if (Math.abs(fark) >= 1) out.push(`Kurye ${tl(Math.abs(fark))} ${fark > 0 ? "eksik" : "fazla"}`);
  }
  if (o.brut > 0 && o.paket === 0) out.push("Paket girilmemiş");
  return out;
}

/** Bir günün kısa raporu (sıra: girdi, çıktı, paket, kasa, havuz, indirim). */
export function gunRaporuKisa(d: RaporVerisi): string[] {
  const o = raporOzeti(d);
  const cikti = o.gider + o.iade + o.indirim;
  const rr = roadrunnerGunOzeti(d);
  const kt = kuryeTahsilati(d);
  const ciro = o.online + o.kapida;
  const enCok = indirimKirilimi(d)[0];
  const s = [
    `📥 Girdi: <b>${tl(o.brut)}</b> (brüt)`,
    `📤 Çıktı: ${tl(cikti)} → Net <b>${tl(o.net)}</b>`,
    `📦 Paket: <b>${o.paket}</b>${d.tarih >= ROADRUNNER_GECIS_GUNU ? ` · Roadrunner'a <b>${rr.odenecekPaket}</b>` : ""}`,
    `💵 Kasada: nakit <b>${tl(N(d.kasa_nakit) + kt.nakit)}</b> · POS <b>${tl(N(d.kasa_pos) + kt.pos)}</b>`,
  ];
  if (rr.havuzNakit + rr.havuzPos > 0) s.push(`🛵 Havuzda: <b>${tl(rr.havuzTahsilat)}</b>`);
  s.push(`🏷 İndirim: <b>${yz(o.indirim, ciro)}</b>${o.indirim / (ciro || 1) > 0.15 ? " ⚠️" : ""}${enCok && enCok.indirim > 0 ? ` (en çok ${enCok.ad} ${yz(enCok.indirim, enCok.ciro)})` : ""}`);
  const u = raporUyarilariKisa(d);
  if (u.length) s.push(`⚠️ ${u.join(" · ")}`);
  return s;
}

export type RaporBolumu = "girdi" | "cikti" | "paket" | "kasa" | "havuz" | "indirim";
/** Kısa raporun altındaki butonlar: tıklayınca o satırın ayrıntısı gelir. */
export function raporButonlari(tarih: string): { text: string; callback_data: string }[][] {
  const b = (text: string, k: RaporBolumu) => ({ text, callback_data: `rd:${k}:${tarih}` });
  return [[b("📥 Girdiler", "girdi"), b("📤 Çıktılar", "cikti"), b("📦 Paket", "paket")],
    [b("💵 Kasa", "kasa"), b("🛵 Havuz", "havuz"), b("🏷 İndirim", "indirim")]];
}

/** Butona basılınca gönderilen ayrıntı. */
export function raporBolumuMetni(d: RaporVerisi, bolum: RaporBolumu): string {
  const o = raporOzeti(d);
  const t = `${fmtTarih(d.tarih).slice(0, 5)}`;
  const sat = (ad: string, v: number) => `${html(ad)}: ${tl(v)}`;
  const kt = kuryeTahsilati(d);
  const rr = roadrunnerGunOzeti(d);
  const kuryeler = (d.kurye_raporlari || []).filter(k => N(k.paketSayisi) + N(k.uzakPaket) + N(k.paket9km) + N(k.nakit) + N(k.pos) > 0);
  const kAd = (k: (typeof kuryeler)[number], i: number) => k.isim && !/^(Havuz|Kurye \d)/.test(k.isim) ? k.isim : k.tip === "havuz" ? "Havuz" : `Kurye ${i + 1}`;
  if (bolum === "girdi") {
    const k = platformKirilimi(d);
    const s = [`<b>📥 Girdiler · ${t}</b>`];
    (Object.keys(k.online) as (keyof typeof k.online)[]).forEach(p => { if (k.online[p] > 0) s.push(sat(p, k.online[p])); });
    if (!kapidaKasadaMi(d.tarih) && o.kapida > 0) s.push(sat("Kapıda ödeme (kurye)", o.kapida));
    s.push(sat("Kasa nakit", N(d.kasa_nakit)), sat("Kasa POS", N(d.kasa_pos)));
    if (yemekKartiToplam(d) > 0) s.push(sat("Kasa yemek kartı", yemekKartiToplam(d)));
    if (nakitGiderToplam(d) > 0) s.push(sat("Kasadan ödenen gider", nakitGiderToplam(d)));
    s.push(`<b>Brüt ciro: ${tl(o.brut)}</b>`);
    return s.join("\n");
  }
  if (bolum === "cikti") {
    const s = [`<b>📤 Çıktılar · ${t}</b>`, sat("Platform indirimi", o.indirim), sat("Gider", o.gider)];
    String((d as unknown as { gider_aciklama?: string }).gider_aciklama || "").split("||")[0].split("|").map(x => x.trim()).filter(Boolean).forEach(x => s.push(`  • ${html(x.replace(/^\[Personel Avans\]\s*/, ""))}`));
    s.push(sat("İade", o.iade), `<b>Net ciro: ${tl(o.net)}</b>`);
    return s.join("\n");
  }
  if (bolum === "paket") {
    const s = [`<b>📦 Paket · ${t}</b>`, `Asıl paket: <b>${o.paket}</b>`];
    if (d.tarih >= ROADRUNNER_GECIS_GUNU) {
      s.push(`Roadrunner'a ödenecek: <b>${rr.odenecekPaket}</b>`);
      kuryeler.forEach((k, i) => { const u = roadrunnerKuryeUcreti(k); s.push(`  • ${html(kAd(k, i))}: ${u.gercek}${u.garantiFarki > 0 ? ` → ${u.uygulanan} (30 garanti)` : ""}`); });
    }
    if (o.paket > 0) s.push(`Ortalama sepet: ${tl((o.online + o.kapida) / o.paket)}`);
    return s.join("\n");
  }
  if (bolum === "kasa") {
    const pos = N(d.kasa_pos) + kt.pos, kom = pos * POS_KOMISYON_ORANI;
    const s = [`<b>💵 Kasada olması gereken · ${t}</b>`, `<b>Nakit: ${tl(N(d.kasa_nakit) + kt.nakit)}</b>`, `  • Dükkân: ${tl(N(d.kasa_nakit))}`];
    kuryeler.filter(k => k.tip !== "havuz" && N(k.nakit) > 0).forEach((k, i) => s.push(`  • ${html(kAd(k, i))}: ${tl(N(k.nakit))}`));
    s.push(`<b>POS: ${tl(pos)}</b>`, `  • Kasa: ${tl(N(d.kasa_pos))}`);
    kuryeler.filter(k => k.tip !== "havuz" && N(k.pos) > 0).forEach((k, i) => s.push(`  • ${html(kAd(k, i))}: ${tl(N(k.pos))}`));
    s.push(`POS komisyonu %${(POS_KOMISYON_ORANI * 100).toLocaleString("tr-TR")}: −${tl(kom)} → hesaba ${tl(pos - kom)}`);
    if (yemekKartiToplam(d) > 0) s.push(`Yemek kartı (kasa): ${tl(yemekKartiToplam(d))}`);
    return s.join("\n");
  }
  if (bolum === "havuz") {
    if (d.tarih < ROADRUNNER_GECIS_GUNU) return "Bu tarihte Roadrunner yok.";
    return [`<b>🛵 Havuzda biriken (Roadrunner'da) · ${t}</b>`, `Nakit: ${tl(rr.havuzNakit)}`, `POS: ${tl(rr.havuzPos)}`,
      `POS komisyonu %${RR_POS_KOMISYON_ORANI * 100}: −${tl(rr.havuzKomisyon)}`, `<b>Borçtan düşülecek: ${tl(rr.havuzTahsilat)}</b>`].join("\n");
  }
  const s = [`<b>🏷 İndirim · ${t}</b>`, "<i>ciro · indirim · yüzde</i>"];
  indirimKirilimi(d).forEach(p => {
    s.push(`<b>${p.ad}</b>: ${tl(p.ciro)} · ${tl(p.indirim)} · ${yz(p.indirim, p.ciro)}${p.ciro > 0 && p.indirim / p.ciro > 0.15 ? " ⚠️" : ""}`);
    if (p.markalar.length > 1) p.markalar.forEach(m => s.push(`  • ${html(m.ad)}: ${tl(m.ciro)} · ${tl(m.indirim)} · ${yz(m.indirim, m.ciro)}`));
  });
  s.push(`<b>Toplam: ${tl(o.online + o.kapida)} · ${tl(o.indirim)} · ${yz(o.indirim, o.online + o.kapida)}</b>`, "%15 üstü ⚠️");
  return s.join("\n");
}

export function ciroBolumu(v: TgVeri, bugunStr: string): string[] {
  const r = v.raporlar; if (!r) return [];
  const dun = gunEkle(bugunStr, -1);
  const harita = new Map(r.map(x => [x.tarih, x]));
  const s: string[] = [];
  const d = harita.get(dun);
  if (d) {
    const gecen = harita.get(gunEkle(dun, -7));
    s.push(`<b>💰 Dün (${fmtTarih(dun).slice(0, 5)})</b>${gecen ? ` brüt${ok(yuzde(raporOzeti(d).brut, raporOzeti(gecen).brut))} geçen haftaya göre` : ""}`);
    s.push(...gunRaporuKisa(d));
  } else {
    s.push(`<b>💰 Ciro</b>`, `⚠️ Dünün (${fmtTarih(dun)}) kasa raporu girilmemiş.`);
  }
  const son7 = r.filter(x => x.tarih >= gunEkle(bugunStr, -7) && x.tarih < bugunStr);
  const onceki7 = r.filter(x => x.tarih >= gunEkle(bugunStr, -14) && x.tarih < gunEkle(bugunStr, -7));
  if (son7.length) {
    const a = donemOzeti(son7), b = onceki7.length ? donemOzeti(onceki7) : null;
    s.push(`Son 7 gün: ${tl(a.brut)} (${a.gunSayisi} rapor)${b && b.gunSayisi === a.gunSayisi ? ok(yuzde(a.brut, b.brut)) : ""}`);
  }
  const eksik: string[] = [];
  for (let i = 1; i <= 7; i++) { const t = gunEkle(bugunStr, -i); if (!harita.has(t)) eksik.push(fmtTarih(t).slice(0, 5)); }
  if (eksik.length > 1) s.push(`Rapor yok: ${eksik.reverse().join(", ")}`);
  return s;
}

/** Sabah özetinde dünün raporu varsa ayrıntı butonları. */
export function sabahButonlari(v: TgVeri, bugunStr: string) {
  const dun = gunEkle(bugunStr, -1);
  return v.raporlar?.some(x => x.tarih === dun) ? raporButonlari(dun) : undefined;
}

// ── Ödemeler ──
export interface OdemeOzeti { gecikmis: number; buHafta: number; keboCuma: number | null; cariler: { ad: string; tutar: number; vade: string | null; gecikmis: boolean }[] }

export function odemeOzeti(v: TgVeri, bugunStr: string): OdemeOzeti | null {
  if (!v.acik_faturalar || !v.bakiyeler) return null;
  const hakedis = new Set(v.bakiyeler.filter(b => b.hakedisten).map(b => b.cari_id));
  const odenmis = new Map(v.bakiyeler.filter(b => Number(b.odenmis) > 0).map(b => [b.cari_id, Number(b.odenmis)]));
  const faturalar = v.acik_faturalar.filter(f => f.cari_id && !hakedis.has(f.cari_id));
  const { gruplar } = vadeTakvimi(faturalar, bugunStr, odenmis);
  const gec = gruplar.find(g => g.anahtar === "gecikmis")!;
  const hafta = gruplar.find(g => g.anahtar === "bu_hafta")!;
  const cuma = buCuma(bugunStr);
  let keboCuma: number | null = null;
  gruplar.forEach(g => g.cariler.forEach(c => {
    if (!/kebo/i.test(c.cari_unvan)) return;
    const t = c.faturalar.filter(f => f.vade && f.vade <= cuma).reduce((s, f) => s + f.kalan, 0);
    keboCuma = (keboCuma || 0) + t;
  }));
  const cariler = [...gec.cariler.map(c => ({ ad: c.cari_unvan, tutar: c.toplam, vade: c.enErkenVade, gecikmis: true })),
    ...hafta.cariler.map(c => ({ ad: c.cari_unvan, tutar: c.toplam, vade: c.enErkenVade, gecikmis: false }))];
  return { gecikmis: gec.toplam, buHafta: hafta.toplam, keboCuma, cariler };
}

export function odemeBolumu(v: TgVeri, bugunStr: string): string[] {
  const o = odemeOzeti(v, bugunStr); if (!o) return [];
  const s = ["<b>📅 Ödemeler</b>"];
  if (o.keboCuma !== null) {
    const cuma = buCuma(bugunStr);
    s.push(`Kebo — ${cuma === bugunStr ? "bugün (Cuma)" : `bu Cuma (${fmtTarih(cuma).slice(0, 5)})`}: <b>${tl(o.keboCuma)}</b>`);
  }
  if (o.gecikmis > 0) s.push(`🔴 Vadesi geçmiş: <b>${tl(o.gecikmis)}</b>`);
  s.push(`Bu hafta vadesi gelen: <b>${tl(o.buHafta)}</b>`);
  o.cariler.filter(c => !/kebo/i.test(c.ad)).sort((a, b) => b.tutar - a.tutar).slice(0, 5)
    .forEach(c => s.push(`• ${html(kisaAd(c.ad))}: ${tl(c.tutar)}${c.gecikmis ? " (gecikmiş)" : c.vade ? ` · ${fmtTarih(c.vade).slice(0, 5)}` : ""}`));
  return s;
}

// ── Stok ──
export interface StokUyari { urun: TgUrun; tip: "bitiyor" | "sayim"; metin: string; kalanGun: number | null }

export function stokUyarilari(v: TgVeri, bugunStr: string): StokUyari[] {
  const u = v.stok_urunler, h = v.stok_hareketler; if (!u || !h) return [];
  const liste: StokUyari[] = [];
  u.forEach(x => {
    const d = stokDurumu(h, x.id, bugunStr, "gun");
    const p = siparisPlani(d, VARSAYILAN_SIPARIS, Number(x.min_stok) || 0, bugunStr);
    if (d.kalanGun !== null && (!p.varisaKadarYeter || d.kalanGun <= 2)) {
      liste.push({ urun: x, tip: "bitiyor", kalanGun: d.kalanGun,
        metin: `${html(x.urun_adi)}: ~${sayi(d.tahminiMevcut)} ${x.birim} kaldı, ~${d.kalanGun} gün yeter` });
    } else if ((x.sayim_periyodu || "gunluk") === "gunluk" && sayimGecikti(x.sayim_periyodu, d.sonSayimdanBeriGun) && (d.sonSayimdanBeriGun ?? 99) > 2) {
      liste.push({ urun: x, tip: "sayim", kalanGun: d.kalanGun, metin: `${html(x.urun_adi)}: ${d.sonSayimTarih ? `son sayım ${fmtTarih(d.sonSayimTarih)}` : "hiç sayılmadı"}` });
    }
  });
  return liste.sort((a, b) => (a.tip === b.tip ? (a.kalanGun ?? 99) - (b.kalanGun ?? 99) : a.tip === "bitiyor" ? -1 : 1));
}

export function stokBolumu(v: TgVeri, bugunStr: string, enFazla = 6): string[] {
  if (!v.stok_urunler) return [];
  const u = stokUyarilari(v, bugunStr);
  const bitiyor = u.filter(x => x.tip === "bitiyor"), sayim = u.filter(x => x.tip === "sayim");
  const s = ["<b>📦 Stok</b>"];
  if (!bitiyor.length) s.push("Bitmek üzere ürün yok.");
  bitiyor.slice(0, enFazla).forEach(x => s.push("• " + x.metin));
  if (bitiyor.length > enFazla) s.push(`… ve ${bitiyor.length - enFazla} ürün daha`);
  if (sayim.length) s.push(`Günlük sayımı geciken: ${sayim.length} ürün`);
  return s;
}

// ── Robot / fiyat ──
export function robotBolumu(v: TgVeri, bugunStr: string, sadeceBugun = false): string[] {
  const l = v.bot_log; if (!l) return [];
  const s = ["<b>🤖 Mikro faturaları</b>"];
  // Dükkân bilgisayarındaki robot hiç bağlanmadıysa eski (sunucudaki) robotun kayıtları gösterilmez:
  // o robotu Mikro engelliyordu (HTTP 403), şifre sorunu değildi.
  if (!v.mikro_pc_son && "mikro_pc_son" in v) {
    s.push("Dükkân bilgisayarındaki robot henüz kurulmadı. Kurulunca faturalar her gün kendiliğinden gelecek; şimdilik Fiyat Listesi → \"Mikro'dan güncelle\" ile aktarabilirsiniz.");
    return s;
  }
  const son = l[0];
  if (!son) { s.push("Henüz çalışma kaydı yok."); return s; }
  const tarih = son.bitti ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(son.bitti)) : null;
  if (sadeceBugun && tarih !== bugunStr) {
    s.push(`⚠️ Bugün çalışmadı (son çalışma ${tarih ? fmtTarih(tarih) : "bilinmiyor"}). Dükkân bilgisayarı açık mı?`);
    return s;
  }
  if (v.mikro_pc_son) {
    const dk = Math.round((Date.now() - Date.parse(v.mikro_pc_son)) / 60000);
    s.push(dk <= 10 ? "Dükkân bilgisayarı açık." : `Dükkân bilgisayarı ${dk < 120 ? `${dk} dakikadır` : "uzun süredir"} görünmüyor.`);
  }
  s.push(`${son.durum === "hata" ? "❌" : "✅"} ${html(son.mesaj || son.durum)}`);
  const g = Array.isArray(son.guncellenen) ? (son.guncellenen as Record<string, unknown>[]) : [];
  const zamlar = g.map(x => ({ ad: String(x.urun ?? ""), eski: Number(x.eski ?? 0), yeni: Number(x.yeni ?? 0) }))
    .filter(x => x.ad && x.eski > 0 && x.yeni > x.eski * 1.03).sort((a, b) => b.yeni / b.eski - a.yeni / a.eski);
  if (zamlar.length) {
    s.push("<b>Zamlananlar:</b>");
    zamlar.slice(0, 6).forEach(z => s.push(`• ${html(z.ad)}: ${sayi(z.eski, 2)} → ${sayi(z.yeni, 2)} ₺ (+%${Math.round((z.yeni / z.eski - 1) * 100)})`));
  }
  const k = Array.isArray(son.kontrol) ? son.kontrol.length : 0;
  if (k) s.push(`${k} fiyat değişimi panelde kontrol bekliyor (Fiyat Listesi).`);
  return s;
}

function bekleyenBolumu(v: TgVeri): string[] {
  const s: string[] = [];
  if (v.bekleyen_talepler) s.push(`📝 Onay bekleyen ${v.bekleyen_talepler} rapor değişikliği var.`);
  if (v.telegram_kasa_bekleyen) s.push(`📷 Telegram'dan gelen ${v.telegram_kasa_bekleyen} kasa formu fotoğrafı Raporlar'da bekliyor.`);
  if (v.telegram_bekleyen) s.push(`📷 Telegram'dan gelen ${v.telegram_bekleyen} irsaliye fotoğrafı Stok'ta bekliyor.`);
  return s;
}

/** Sabah özeti (her gün ~10:00) */
export function sabahOzeti(v: TgVeri, ad: string, bugunStr: string): string {
  const gun = GUN_ADLARI_KISA[new Date(bugunStr + "T12:00:00Z").getUTCDay()];
  const bolumler = [ciroBolumu(v, bugunStr), odemeBolumu(v, bugunStr), stokBolumu(v, bugunStr), bekleyenBolumu(v)].filter(b => b.length);
  return [`☀️ Günaydın ${html(ad.split(" ")[0])} — ${fmtTarih(bugunStr)} ${gun}`, ...bolumler.map(b => b.join("\n"))].join("\n\n");
}

/** Öğlen uyarısı (Mikro robotu 11:15'te çalıştıktan sonra): sadece söylenecek bir şey varsa metin döner. */
export function oglenUyarisi(v: TgVeri, bugunStr: string): string | null {
  const parcalar: string[][] = [];
  if (v.bot_log) parcalar.push(robotBolumu(v, bugunStr, true));
  const bitiyor = stokUyarilari(v, bugunStr).filter(x => x.tip === "bitiyor" && (x.kalanGun ?? 99) <= 1);
  if (bitiyor.length) parcalar.push(["<b>📦 Bugün/yarın bitecek</b>", ...bitiyor.map(x => "• " + x.metin)]);
  const o = odemeOzeti(v, bugunStr);
  if (o && o.keboCuma && buCuma(bugunStr) === bugunStr) parcalar.push([`📅 Bugün Cuma: Kebo ödemesi <b>${tl(o.keboCuma)}</b>`]);
  if (!parcalar.length) return null;
  return ["🕛 Öğlen kontrolü", ...parcalar.map(p => p.join("\n"))].join("\n\n");
}

/**
 * Soru-cevap için yapay zekâya verilen veri özeti (düz metin). Ham veri yerine özet verilir:
 * hem kısa olur hem de rakamlar paneldeki hesaplarla aynı çıkar.
 */
export function asistanBaglami(v: TgVeri, bugunStr: string): string {
  const s: string[] = [`Bugün: ${bugunStr} (${GUN_ADLARI_KISA[new Date(bugunStr + "T12:00:00Z").getUTCDay()]})`];
  if (v.raporlar) {
    s.push("\n## Günlük kasa raporları (tarih | brüt ciro | net | online | kapıda | kasa | gider | paket)");
    v.raporlar.forEach(r => { const o = raporOzeti(r); s.push(`${r.tarih} | ${Math.round(o.brut)} | ${Math.round(o.net)} | ${Math.round(o.online)} | ${Math.round(o.kapida)} | ${Math.round(o.kasa)} | ${Math.round(o.gider)} | ${o.paket}`); });
  } else s.push("\n(Kasa raporlarını görme yetkisi yok.)");
  if (v.bakiyeler) {
    s.push("\n## Cari bakiyeler (borç > 0 = biz borçluyuz; hakediş = platform kendi kesiyor)");
    v.bakiyeler.filter(b => Math.abs(Number(b.borc)) >= 1).sort((a, b) => Number(b.borc) - Number(a.borc))
      .forEach(b => s.push(`${b.unvan} | ${Math.round(Number(b.borc))}${b.hakedisten ? " | hakediş" : ""}`));
    const o = odemeOzeti(v, bugunStr);
    if (o) s.push(`\nVadesi geçmiş toplam: ${Math.round(o.gecikmis)} · Bu hafta vadesi gelen: ${Math.round(o.buHafta)} · Kebo bu Cuma (${buCuma(bugunStr)}): ${o.keboCuma === null ? "-" : Math.round(o.keboCuma)}`);
    if (v.acik_faturalar) {
      s.push("\n## Açık faturalar (cari | no | tarih | vade | tutar)");
      v.acik_faturalar.slice().sort((a, b) => String(b.fatura_tarihi).localeCompare(String(a.fatura_tarihi))).slice(0, 150)
        .forEach(f => s.push(`${f.cari_unvan} | ${f.fatura_no} | ${f.fatura_tarihi} | ${f.vade_tarihi || "-"} | ${f.toplam_tutar}`));
    }
    if (v.son_odemeler?.length) {
      s.push("\n## Son 14 günün ödemeleri (tarih | cari | tutar | yöntem)");
      v.son_odemeler.forEach(o => s.push(`${o.tarih} | ${o.cari} | ${o.tutar} | ${o.yontem || "-"}`));
    }
  } else s.push("\n(Cari/fatura görme yetkisi yok.)");
  if (v.stok_urunler && v.stok_hareketler) {
    s.push("\n## Stok (ürün | tahmini mevcut | birim | günlük ort. kullanım | kaç gün yeter | son sayım | sayım grubu)");
    v.stok_urunler.forEach(u => {
      const d = stokDurumu(v.stok_hareketler!, u.id, bugunStr, "gun");
      s.push(`${u.urun_adi} | ${sayi(d.tahminiMevcut)} | ${u.birim} | ${sayi(d.ort7.ortalama)} | ${d.kalanGun ?? "-"} | ${d.sonSayimTarih || "yok"} | ${u.sayim_periyodu || "gunluk"}`);
    });
    if (v.bot_log?.[0]) s.push(`\nMikro robotu son çalışma: ${v.bot_log[0].bitti || "-"} · ${v.bot_log[0].mesaj || v.bot_log[0].durum}`);
  } else s.push("\n(Stok görme yetkisi yok.)");
  return s.join("\n");
}

// ── Mikro "şimdi çek" raporu (panel ve Telegram ortak) ──
export interface MikroRapor {
  durum: string; mesaj: string | null; istendi: string; basladi: string | null; bitti: string | null; isteyen_ad: string | null;
  sonuc: { bulunan?: number; okunamayan?: number; yeni_cari?: number } | null;
  faturalar: { cari: string; no: string; tarih: string; tutar: number }[];
  fiyat: { guncellenen?: { urun: string; eski: number; yeni: number }[] | null; kontrol?: { urun: string; eski: number; yeni: number; oran: number }[] | null } | null;
}

export function mikroRaporMetni(r: MikroRapor): string {
  if (r.durum === "hata") return `❌ <b>Mikro'dan çekme başarısız</b>\n${html(r.mesaj || "")}`;
  const s = ["✅ <b>Mikro faturaları işlendi</b>"];
  if (r.sonuc?.bulunan !== undefined) s.push(`Mikro'da son günlerde ${r.sonuc.bulunan} fatura tarandı${r.sonuc.okunamayan ? `, ${r.sonuc.okunamayan} tanesi okunamadı` : ""}.`);
  if (r.faturalar.length) {
    const top = r.faturalar.reduce((t, f) => t + Number(f.tutar || 0), 0);
    s.push("", `<b>Faturalar'a eklenen ${r.faturalar.length} fatura</b> (toplam ${tl(top)}):`);
    r.faturalar.slice(0, 15).forEach(f => s.push(`• ${fmtTarih(f.tarih).slice(0, 5)} ${html(kisaAd(f.cari))}: ${tl(Number(f.tutar))}`));
    if (r.faturalar.length > 15) s.push(`… ve ${r.faturalar.length - 15} fatura daha`);
  } else s.push("Yeni fatura yok.");
  if (r.sonuc?.yeni_cari) s.push(`🆕 ${r.sonuc.yeni_cari} yeni cari açıldı.`);
  const g = (r.fiyat?.guncellenen || []).filter(x => Math.abs(Number(x.yeni) - Number(x.eski)) > 0.005);
  if (g.length) {
    s.push("", `<b>Fiyatı değişen ${g.length} stok ürünü:</b>`);
    g.slice(0, 10).forEach(x => {
      const p = Number(x.eski) > 0 ? Math.round((Number(x.yeni) / Number(x.eski) - 1) * 100) : 0;
      s.push(`• ${html(x.urun)}: ${sayi(Number(x.eski), 2)} → ${sayi(Number(x.yeni), 2)} ₺ (${p >= 0 ? "+" : ""}%${p})`);
    });
  }
  const k = r.fiyat?.kontrol || [];
  if (k.length) s.push("", `⚠️ ${k.length} fiyat %30'dan fazla değişmiş, Fiyat Listesi'nde onayınızı bekliyor: ${k.slice(0, 5).map(x => html(x.urun)).join(", ")}`);
  return s.join("\n");
}

// ── Faturadan stok girişi: "stoğa işlensin mi?" ──
export interface IrsaliyeEslesme {
  belge: string; belge_no: string | null; tarih: string | null; teslim: boolean;
  satirlar: { oneri_id: string; kalem: string; urun: string; birim: string; irsaliye_kalem_id: string; irsaliye_miktar: number; fatura_miktar: number; fark: number; teslim: boolean }[];
  faturada_olmayan: { irsaliye_kalem_id: string; urun: string; miktar: number; birim: string | null }[];
  irsaliyede_olmayan: { oneri_id: string; kalem: string; miktar: number; birim: string | null; eslesmis: boolean }[];
}
export interface StokFatura {
  gib_no: string; tarih: string; tedarikci: string | null; iade: boolean; irsaliye?: IrsaliyeEslesme | null;
  kalemler: { id: string; kalem: string; miktar: number | null; birim: string | null; urun: string | null; urun_birim: string | null; stok_miktar: number | null; durum: string }[];
}

export function stokFaturaMetni(f: StokFatura): { metin: string; eslesen: number; eslesmeyen: number; irsaliye: number; fark: boolean } {
  const irs = f.irsaliye && f.irsaliye.satirlar.length ? f.irsaliye : null;
  if (irs) {
    const kisa = (u: string) => html(u.replace(/\s*\(.*$/, ""));
    const s = [`🧾 <b>Fatura geldi — irsaliyesi bulundu</b>`, `${html(kisaAd(f.tedarikci || ""))} · fatura ${fmtTarih(f.tarih)} · ${html(f.gib_no)}`,
      `İrsaliye: ${html(irs.belge_no || "numarasız")} · ${irs.tarih ? fmtTarih(irs.tarih) : ""}${irs.teslim ? " (teslim alındı, stokta)" : " (henüz teslim alınmadı)"}`, "",
      "<i>Ürün: irsaliye / fatura</i>"];
    irs.satirlar.forEach(x => s.push(`${Math.abs(x.fark) < 0.001 ? "✅" : "⚠️"} ${kisa(x.urun)}: ${sayi(x.irsaliye_miktar, 2)} / ${sayi(x.fatura_miktar, 2)} ${html(x.birim)}${Math.abs(x.fark) < 0.001 ? "" : ` (<b>${x.fark > 0 ? "+" : ""}${sayi(x.fark, 2)}</b>)`}`));
    if (irs.irsaliyede_olmayan.length) s.push("", `❓ Faturada olup irsaliyede olmayan: ${irs.irsaliyede_olmayan.map(x => `${sayi(x.miktar, 2)} ${html((x.birim || "").toLowerCase())} ${html(x.kalem)}`).join(", ")}`);
    if (irs.faturada_olmayan.length) s.push("", `❓ İrsaliyede olup faturada olmayan: ${irs.faturada_olmayan.map(x => `${kisa(x.urun)} ${sayi(x.miktar, 2)} ${html(x.birim || "")}`).join(", ")}`);
    const fark = irs.satirlar.some(x => Math.abs(x.fark) >= 0.001);
    s.push("", irs.teslim ? "Eşleştirince stoğa tekrar girmez." : "Eşleştirince fatura miktarıyla stoğa girer.");
    return { metin: s.join("\n"), eslesen: 0, eslesmeyen: irs.irsaliyede_olmayan.length, irsaliye: irs.satirlar.length, fark };
  }
  const bekleyen = f.kalemler.filter(k => k.durum === "bekliyor");
  const eslesen = bekleyen.filter(k => k.urun), eslesmeyen = bekleyen.filter(k => !k.urun);
  const s = [`📦 <b>${f.iade ? "İade faturası — stoktan düşülsün mü?" : "Fatura geldi — stoğa işlensin mi?"}</b>`,
    `${html(kisaAd(f.tedarikci || ""))} · ${fmtTarih(f.tarih)} · ${html(f.gib_no)}`, ""];
  eslesen.forEach(k => s.push(`• ${sayi(Number(k.miktar), 2)} ${html((k.birim || "").toLowerCase())} ${html(k.kalem)} → <b>${sayi(Number(k.stok_miktar), 2)} ${html(k.urun_birim || "")} ${html((k.urun || "").replace(/\s*\(.*$/, ""))}</b>`));
  if (eslesmeyen.length) {
    s.push("", `❓ Stok ürünüyle eşleşmemiş ${eslesmeyen.length} kalem (panelden bir kez eşleştirin, sonra otomatik gelir):`);
    eslesmeyen.slice(0, 8).forEach(k => s.push(`• ${sayi(Number(k.miktar), 2)} ${html((k.birim || "").toLowerCase())} ${html(k.kalem)}`));
  }
  if (!bekleyen.length) s.push("Bu faturanın kalemleri işlendi.");
  return { metin: s.join("\n"), eslesen: eslesen.length, eslesmeyen: eslesmeyen.length, irsaliye: 0, fark: false };
}

// ── İrsaliye ↔ fatura sorgusu ──
export interface BelgeEslesmesi {
  belge: string | null; irsaliye_no: string | null; tedarikci: string | null; irsaliye_tarihi: string | null; teslim: boolean | null; kalemler: string | null;
  gib_no: string | null; fatura_tarihi: string | null; toplam: number | null; fatura_tedarikci: string | null;
}
export function belgeSatiri(b: BelgeEslesmesi): string {
  const irs = b.belge ? `🧾 İrsaliye ${html(b.irsaliye_no || "numarasız")} (${b.irsaliye_tarihi ? fmtTarih(b.irsaliye_tarihi) : "?"}${b.teslim ? "" : ", teslim alınmadı"})` : "🧾 İrsaliyesi yok";
  const fat = b.gib_no ? `📄 Fatura ${html(b.gib_no)} (${b.fatura_tarihi ? fmtTarih(b.fatura_tarihi) : "?"}${b.toplam != null ? `, ${tl(Number(b.toplam))}` : ""})` : "📄 Faturası henüz gelmedi";
  return `<b>${html(kisaAd(b.tedarikci || b.fatura_tedarikci || ""))}</b>\n${irs} ↔ ${fat}${b.kalemler ? `\n<i>${html(b.kalemler.slice(0, 200))}</i>` : ""}`;
}
