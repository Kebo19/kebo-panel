// ─── TELEGRAM: ÖZET VE UYARI METİNLERİ ───────────────────────────────────────
// tg_veri RPC'sinin döndürdüğü ham veriden (kullanıcının yetkisi olan bölümler) Telegram
// mesajları üretir. Hesaplar panelle aynı kütüphanelerden gelir (hesap, cariEkstre, stok),
// böylece Telegram'daki rakam paneldekiyle aynı olur. Saf fonksiyonlar: test edilebilir.
import { raporOzeti, donemOzeti, type RaporVerisi } from "@/lib/hesap";
import { vadeTakvimi, type TakvimFatura } from "@/lib/cariEkstre";
import { stokDurumu, siparisPlani, sayimGecikti, VARSAYILAN_SIPARIS, type StokHareketi } from "@/lib/stok";
import { gunEkle, fmtTarih } from "@/lib/tarih";

export const GUN_ADLARI_KISA = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export interface TgBakiye { cari_id: string; unvan: string; borc: number; odenmis: number; hakedisten: boolean }
export interface TgUrun { id: string; urun_adi: string; birim: string; kategori: string | null; min_stok: number; mevcut_stok: number; sayim_periyodu: string | null; sira_no: number | null }
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

// ── Ciro ──
export function ciroBolumu(v: TgVeri, bugunStr: string): string[] {
  const r = v.raporlar; if (!r) return [];
  const dun = gunEkle(bugunStr, -1);
  const harita = new Map(r.map(x => [x.tarih, x]));
  const s: string[] = ["<b>💰 Ciro</b>"];
  const d = harita.get(dun);
  if (d) {
    const o = raporOzeti(d);
    const gecen = harita.get(gunEkle(dun, -7));
    const og = gecen ? raporOzeti(gecen) : null;
    s.push(`Dün (${fmtTarih(dun)}): <b>${tl(o.brut)}</b>${og ? ok(yuzde(o.brut, og.brut)) + " geçen haftaya göre" : ""}`);
    s.push(`Online ${tl(o.online)} · Kasa ${tl(o.kasa)} · ${o.paket} paket`);
  } else {
    s.push(`⚠️ Dünün (${fmtTarih(dun)}) kasa raporu girilmemiş.`);
  }
  const son7 = r.filter(x => x.tarih >= gunEkle(bugunStr, -7) && x.tarih < bugunStr);
  const onceki7 = r.filter(x => x.tarih >= gunEkle(bugunStr, -14) && x.tarih < gunEkle(bugunStr, -7));
  if (son7.length) {
    const a = donemOzeti(son7), b = onceki7.length ? donemOzeti(onceki7) : null;
    s.push(`Son 7 gün: ${tl(a.brut)} (${a.gunSayisi} rapor)${b && b.gunSayisi === a.gunSayisi ? ok(yuzde(a.brut, b.brut)) : ""}`);
  }
  const eksik: string[] = [];
  for (let i = 1; i <= 7; i++) { const t = gunEkle(bugunStr, -i); if (!harita.has(t)) eksik.push(fmtTarih(t).slice(0, 5)); }
  if (eksik.length > 1) s.push(`Raporu girilmemiş günler: ${eksik.reverse().join(", ")}`);
  return s;
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
  const son = l[0];
  const s = ["<b>🤖 Mikro faturaları</b>"];
  if (!son) { s.push("Henüz çalışma kaydı yok."); return s; }
  const tarih = son.bitti ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(son.bitti)) : null;
  if (sadeceBugun && tarih !== bugunStr) {
    s.push(`⚠️ Bugün çalışmadı (son çalışma ${tarih ? fmtTarih(tarih) : "bilinmiyor"}). Dükkân bilgisayarı açık mı?`);
    return s;
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
