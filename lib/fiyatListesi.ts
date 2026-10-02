// ─── FİYAT LİSTESİ ──────────────────────────────────────────────────────────
// /fiyatlar sayfası: Mikro e-Portal'daki gelen faturaların bütün kalemleri
// (domates, kola, eldiven...) ve her ürünün son alış fiyatı.
//
// Aktarım tarayıcıdan yapılır, çünkü Mikro sunuculardan gelen istekleri
// (Supabase, Vercel) Cloudflare ile engelliyor:
//   1) "Mikro'dan güncelle" butonu Mikro'nun Gelen e-Faturalar sayfasını yeni pencerede açar.
//   2) Kullanıcı o pencerede "Kebo'ya aktar" yer imine tıklar → public/kebo-aktar.js çalışır,
//      faturaları kullanıcının Mikro oturumuyla okur, kalemleri postMessage ile bu sayfaya yollar.
//   3) Sayfa public.mikro_faturalari_kaydet() ile yazar; aynı fonksiyon stok fiyatlarını da günceller.
// Sayfayı stok değeri raporunu görenler görür (lib/stokDeger.ts → STOK_DEGER_GORENLER).

export const MIKRO_ORIGIN = "https://eportal.mikrogrup.com";
/** BCM Restoran'ın Mikro firma kodu (portal adresindeki) */
export const MIKRO_FIRMA = "9351d4b5-c397-48da-a383-d9da89b5dc9d";
export const MIKRO_GELEN_URL = `${MIKRO_ORIGIN}/cp/${MIKRO_FIRMA}/inbox/newinbox`;
export const FIYAT_SAYFASI = "/fiyatlar";

/** Yer imi: panel adresini bırakıp aktarma dosyasını Mikro sayfasına yükler. */
export function yerImiKodu(panelAdresi: string): string {
  const src = `${panelAdresi}/kebo-aktar.js`;
  return `javascript:(function(){window.KEBO_PANEL=${JSON.stringify(panelAdresi)};` +
    `var s=document.createElement('script');s.src=${JSON.stringify(src)}+'?v='+Date.now();document.body.appendChild(s);})();`;
}

/** public.fiyat_listesi() satırı (numeric alanlar metin gelebilir) */
export interface FiyatSatiri {
  urun_adi: string;
  vkn: string | null;
  tedarikci: string | null;
  birim: string | null;
  son_fiyat: number | string;
  son_kdv: number | string | null;
  son_tarih: string;
  son_fatura: string;
  onceki_fiyat: number | string | null;
  onceki_tarih: string | null;
  en_dusuk: number | string;
  en_yuksek: number | string;
  alim_sayisi: number;
  toplam_miktar: number | string | null;
  ilk_tarih: string;
}

export interface FiyatKalemi {
  anahtar: string;
  ad: string;
  vkn: string | null;
  tedarikci: string;
  birim: string;
  fiyat: number;
  kdv: number;
  fiyatKdvli: number;
  tarih: string;
  fatura: string;
  onceki: number | null;
  oncekiTarih: string | null;
  /** önceki alıma göre yüzde değişim (önceki yoksa null) */
  degisim: number | null;
  enDusuk: number;
  enYuksek: number;
  alim: number;
  toplamMiktar: number;
}

const sayi = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** "KEBO RESTAURANT PAZARLAMA SANAYİ VE TİCARET ANONİM ŞİRKETİ" → "Kebo Restaurant" gibi kısa ad */
export function kisaUnvan(unvan: string | null | undefined): string {
  if (!unvan) return "—";
  const kelimeler = unvan.replace(/\s+/g, " ").trim().split(" ");
  const durak = /^(SANAYİ|SANAYI|TİCARET|TICARET|GIDA|LTD|LİMİTED|LIMITED|ANONİM|ANONIM|A\.Ş\.?|ŞTİ\.?|PAZARLAMA|İNŞ|İNŞAAT|NAKLİYAT|VE|SAN\.?|TİC\.?)$/i;
  const secilen: string[] = [];
  for (const k of kelimeler) { if (durak.test(k) || secilen.length >= 2) break; secilen.push(k); }
  const metin = (secilen.length ? secilen : kelimeler.slice(0, 2)).join(" ");
  return metin.toLocaleLowerCase("tr-TR").replace(/(^|\s)(\S)/g, (_, b, h) => b + h.toLocaleUpperCase("tr-TR"));
}

export function fiyatKalemleri(satirlar: FiyatSatiri[]): FiyatKalemi[] {
  return satirlar.map(s => {
    const fiyat = sayi(s.son_fiyat), kdv = sayi(s.son_kdv);
    const onceki = s.onceki_fiyat == null || s.onceki_fiyat === "" ? null : sayi(s.onceki_fiyat);
    return {
      anahtar: `${s.vkn ?? ""}|${s.urun_adi}`,
      ad: s.urun_adi,
      vkn: s.vkn,
      tedarikci: kisaUnvan(s.tedarikci),
      birim: (s.birim ?? "").trim(),
      fiyat, kdv,
      fiyatKdvli: fiyat * (1 + kdv / 100),
      tarih: s.son_tarih,
      fatura: s.son_fatura,
      onceki,
      oncekiTarih: s.onceki_tarih,
      degisim: onceki && onceki > 0 ? ((fiyat - onceki) / onceki) * 100 : null,
      enDusuk: sayi(s.en_dusuk),
      enYuksek: sayi(s.en_yuksek),
      alim: s.alim_sayisi ?? 0,
      toplamMiktar: sayi(s.toplam_miktar),
    };
  });
}

/** Türkçe karakter ve büyük/küçük harf farkını yok sayarak arar; her kelime ayrı ayrı eşleşmeli. */
export function aramaEslesir(k: Pick<FiyatKalemi, "ad" | "tedarikci">, arama: string, sadelestir: (s: string) => string): boolean {
  const kelimeler = sadelestir(arama).split(/\s+/).filter(Boolean);
  if (!kelimeler.length) return true;
  const metin = sadelestir(`${k.ad} ${k.tedarikci}`);
  return kelimeler.every(w => metin.includes(w));
}

// ─── Aktarım mesajları (public/kebo-aktar.js ↔ /fiyatlar) ───────────────────
export interface AktarimKalemi {
  sira: number; urun_adi: string; ham_ad?: string; miktar: number | null; birim: string | null;
  birim_fiyat: number; kdv_orani: number; iskonto_orani: number | null; tutar: number | null;
}
export interface AktarimFaturasi {
  gib_no: string; mikro_id: string; vkn: string; tedarikci: string; tarih: string; tip: string;
  toplam: number | null; kalemler: AktarimKalemi[];
}
export type MikrodanMesaj =
  | { kaynak: "kebo-aktar"; tip: "hazir"; firma: string }
  | { kaynak: "kebo-aktar"; tip: "ilerleme"; okunan: number; toplam: number }
  | { kaynak: "kebo-aktar"; tip: "veri"; faturalar: AktarimFaturasi[]; hatali: number; baslangic: string }
  | { kaynak: "kebo-aktar"; tip: "hata"; mesaj: string };

/** Mikro penceresinden gelen mesaj geçerli mi? (adres + biçim) */
export function mikroMesajiMi(origin: string, veri: unknown): veri is MikrodanMesaj {
  if (origin !== MIKRO_ORIGIN || !veri || typeof veri !== "object") return false;
  const m = veri as { kaynak?: unknown; tip?: unknown };
  return m.kaynak === "kebo-aktar" && typeof m.tip === "string";
}

/** Büyük aktarımı veritabanına parça parça yazmak için */
export function parcala<T>(dizi: T[], boyut: number): T[][] {
  const sonuc: T[][] = [];
  for (let i = 0; i < dizi.length; i += boyut) sonuc.push(dizi.slice(i, i + boyut));
  return sonuc;
}
