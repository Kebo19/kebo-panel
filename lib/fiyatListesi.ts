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

/** public.fiyat_listesi_v2() satırı (numeric alanlar metin gelebilir).
 *  net_fiyat = satır tutarı / miktar → satır iskontosu düşülmüş gerçek alış fiyatı (KDV hariç). */
export interface FiyatSatiri {
  urun_adi: string;
  vkn: string | null;
  tedarikci: string | null;
  birim: string | null;
  liste_fiyat: number | string;
  net_fiyat: number | string;
  iskonto: number | string | null;
  son_kdv: number | string | null;
  son_tarih: string;
  son_fatura: string;
  onceki_net: number | string | null;
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
  /** iskontosuz liste fiyatı (KDV hariç) */
  listeFiyat: number;
  /** iskontolu net fiyat (KDV hariç) — asıl alış fiyatı */
  fiyat: number;
  /** yüzde; iskonto yoksa 0 */
  iskonto: number;
  kdv: number;
  fiyatKdvli: number;
  tarih: string;
  fatura: string;
  onceki: number | null;
  oncekiTarih: string | null;
  /** önceki alıma göre net fiyatın yüzde değişimi (önceki yoksa null) */
  degisim: number | null;
  enDusuk: number;
  enYuksek: number;
  alim: number;
  toplamMiktar: number;
  /** koli/paket içinden çıkan adet, kg, litre fiyatları */
  birimFiyatlar: BirimFiyatlari;
}

const sayi = (v: number | string | null | undefined): number => {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── Koli / paket içeriği ───────────────────────────────────────────────────
// Ürün adından bir fatura biriminin (KUTU, PAKET, ADET...) içinde kaç adet, kaç kg,
// kaç litre olduğunu çıkarır: "COCA-COLA KUTU 330ML 1X24" → 24 adet, 7,92 lt.

export interface PaketIcerigi {
  /** fatura biriminde kaç adet var (bilinmiyorsa null) */
  adet: number | null;
  /** fatura biriminde toplam kaç kg */
  kg: number | null;
  /** fatura biriminde toplam kaç litre */
  lt: number | null;
}

export interface BirimFiyatlari { adet: number | null; kg: number | null; lt: number | null; adetSayisi: number | null }

/** Koli, paket gibi birden fazla ürün içeren fatura birimleri */
const PAKET_BIRIMI = /^(KUTU|KOLİ|KOLI|PAKET|PK|KASA|BALYA|SET|ÇUVAL|CUVAL)$/;

const say = (m: string) => Number(m.replace(",", "."));

export function paketIcerigi(urunAdi: string, birim: string | null | undefined): PaketIcerigi {
  const ad = ` ${urunAdi.toLocaleUpperCase("tr-TR")} `;
  const b = (birim ?? "").replace(/^-\s*/, "").trim().toLocaleUpperCase("tr-TR");
  const paket = PAKET_BIRIMI.test(b);
  const SAYI = "(\\d+(?:[.,]\\d+)?)";
  const KUTLE = "(KG|GR|G)";
  const HACIM = "(LT|LİTRE|L|ML|CL|CC)";
  const kgCevir = (n: number, u: string) => (u === "KG" ? n : n / 1000);
  const ltCevir = (n: number, u: string) => (u === "ML" || u === "CC" ? n / 1000 : u === "CL" ? n / 100 : n);

  let adet: number | null = null;
  let tekKg: number | null = null;   // bir adedin kütlesi
  let tekLt: number | null = null;   // bir adedin hacmi
  let toplamKg: number | null = null;
  let m: RegExpMatchArray | null;

  // 500 G.*20, 1000 GR * 8, 5 KG*6, (1,5 KG*6), 10 GR * 504, 500MLX24 → boyut × adet
  if ((m = ad.match(new RegExp(`${SAYI}\\s*${KUTLE}\\.?\\s*[*X×]\\s*(\\d+)\\b`)))) {
    tekKg = kgCevir(say(m[1]), m[2]); adet = Number(m[3]);
  } else if ((m = ad.match(new RegExp(`${SAYI}\\s*${HACIM}\\.?\\s*[*X×]\\s*(\\d+)\\b`)))) {
    tekLt = ltCevir(say(m[1]), m[2]); adet = Number(m[3]);
  } else if ((m = ad.match(new RegExp(`\\b(\\d+)\\s*[*X×]\\s*${SAYI}\\s*${KUTLE}\\b`)))) {
    // 600 * 9 GR, 120*20 GR → adet × boyut
    adet = Number(m[1]); tekKg = kgCevir(say(m[2]), m[3]);
  }
  // 100LÜ*50PK, 150Lİ * 12PK → adet × paket
  if (adet === null && (m = ad.match(/(\d+)\s*(?:LÜ|LU|Lİ|LI)\s*[*X×]\s*(\d+)/))) adet = Number(m[1]) * Number(m[2]);
  // 1X24, 4X6, 1X12 (ölçü değil: arkasından CM/MM ya da üçüncü X gelmez)
  if (adet === null && (m = ad.match(/(?<![\d.,X×])(\d+)\s*[X×]\s*(\d+)(?!\s*(?:CM|MM|[X×]|\d))/))) adet = Number(m[1]) * Number(m[2]);
  // (100 AD.), 50ADET, 200LÜ, 120Lİ
  if (adet === null && (m = ad.match(/\(\s*(\d+)\s*AD(?:ET)?\.?\s*\)|(\d+)\s*ADET\b|(\d+)\s*'?(?:LÜK|LİK|LÜ|LU|Lİ|LI)(?![A-ZÇĞİÖŞÜ0-9])/)))
    adet = Number(m[1] ?? m[2] ?? m[3]);

  // Tek ölçü: 330ML, 2,5L, 20 KG, 9 KG KOVA, 800 G.
  if (tekKg === null && tekLt === null) {
    if ((m = ad.match(new RegExp(`(?:^|[^\\d.,])${SAYI}\\s*${KUTLE}\\.?(?![A-ZÇĞİÖŞÜ])`)))) tekKg = kgCevir(say(m[1]), m[2]);
    else if ((m = ad.match(new RegExp(`(?:^|[^\\d.,])${SAYI}\\s*${HACIM}\\.?(?![A-ZÇĞİÖŞÜ])`)))) tekLt = ltCevir(say(m[1]), m[2]);
  }

  if (!paket) {
    // ADET / KG gibi birimlerde fiyat zaten tek ürüne ait: adet bölmesi yapılmaz, sadece tek ürünün ölçüsü kullanılır.
    return { adet: null, kg: b === "KG" ? 1 : tekKg, lt: tekLt };
  }
  if (adet !== null && adet <= 1) adet = null;
  toplamKg = tekKg !== null ? tekKg * (adet ?? 1) : null;
  const toplamLt = tekLt !== null ? tekLt * (adet ?? 1) : null;
  return { adet, kg: toplamKg, lt: toplamLt };
}

/** Net fiyatı adet / kg / litre başına çevirir. */
export function birimFiyatlari(netFiyat: number, urunAdi: string, birim: string | null | undefined): BirimFiyatlari {
  const p = paketIcerigi(urunAdi, birim);
  const bol = (x: number | null) => (x && x > 0 ? netFiyat / x : null);
  return { adet: bol(p.adet), kg: bol(p.kg), lt: bol(p.lt), adetSayisi: p.adet };
}

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
    const fiyat = sayi(s.net_fiyat), kdv = sayi(s.son_kdv);
    const onceki = s.onceki_net == null || s.onceki_net === "" ? null : sayi(s.onceki_net);
    const birim = (s.birim ?? "").trim();
    return {
      anahtar: `${s.vkn ?? ""}|${s.urun_adi}`,
      ad: s.urun_adi,
      vkn: s.vkn,
      tedarikci: kisaUnvan(s.tedarikci),
      birim,
      listeFiyat: sayi(s.liste_fiyat),
      fiyat,
      iskonto: sayi(s.iskonto),
      kdv,
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
      birimFiyatlar: birimFiyatlari(fiyat, s.urun_adi, birim),
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
