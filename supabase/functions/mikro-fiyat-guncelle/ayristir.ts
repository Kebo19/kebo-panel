// Mikro e-Portal fatura HTML'inden kalem satırlarını çıkaran saf yardımcılar.
// (index.ts kullanır; test edilebilsin diye ayrı dosyada.)

export interface Kalem {
  ad: string;          // temizlenmiş, büyük harf ürün adı
  hamAd: string;       // hücredeki ham metin
  miktar: number;
  birimFiyat: number;  // KDV hariç
  kdv: number;         // yüzde
}

/** "1.234,56TL" / "%1,00" / "120 kg" → sayı */
export function trSayi(metin: string | null | undefined): number {
  const s = (metin ?? "").replace(/[^\d,.\-]/g, "");
  if (!s) return NaN;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Ürün adını eşleştirme için normalleştirir: irsaliye no / açıklama kuyruğunu atar, büyük harf, tek boşluk. */
export function adTemizle(ham: string): string {
  let s = ham ?? "";
  s = s.split(/\\r\\n|\r|\n|Açıklama\s*:/)[0];
  s = s.replace(/[A-ZÇĞİÖŞÜ0-9]{3}20\d{2}\d{9}.*$/u, ""); // KIB2026000001301 gibi belge numaraları
  return s.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
}

type El = { textContent: string | null; querySelectorAll(sel: string): ArrayLike<El>; getAttribute?(ad: string): string | null };

/** Birleşik hücreleri (colspan) açarak hücre metinleri: başlık ve satır indeksleri hizalı kalsın. */
function hucreler(tr: El, sec: string): string[] {
  const sonuc: string[] = [];
  for (const c of Array.from(tr.querySelectorAll(sec))) {
    const n = Math.max(1, Math.min(10, parseInt(c.getAttribute?.("colspan") ?? "1", 10) || 1));
    sonuc.push(c.textContent ?? "");
    for (let i = 1; i < n; i++) sonuc.push("");
  }
  return sonuc;
}

const AD_BASLIK = /^(mal\s*\/\s*hizmet|mal hizmet|malzeme\s*\/\s*hizmet açıklaması|ürün adı)$/i;

/** Faturanın HTML önizlemesinden ("GetDocumentAsHtml") kalem tablosunu okur. */
export function kalemleriOku(doc: { querySelectorAll(sel: string): ArrayLike<El> }): Kalem[] {
  // Bazı faturalarda (ör. HKS) kalem tablosu başka tabloların içinde: en içteki uygun tabloyu seç.
  const uygun = Array.from(doc.querySelectorAll("table")).filter(t => {
    const m = t.textContent ?? "";
    return /Miktar/.test(m) && /Birim Fiyat/.test(m);
  });
  const tablo = uygun.sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length)[0];
  if (!tablo) return [];
  const tum = Array.from(tablo.querySelectorAll("tr"));
  const bas = tum.findIndex(tr => /Birim Fiyat/.test(tr.textContent ?? ""));
  if (bas < 0) return [];
  const satirlar = tum.slice(bas);
  if (satirlar.length < 2) return [];
  const baslik = hucreler(satirlar[0], "th,td").map(h => h.replace(/\s+/g, " ").trim());
  const iAd = baslik.findIndex(h => AD_BASLIK.test(h));
  const iMiktar = baslik.findIndex(h => /^Miktar/i.test(h));
  const iFiyat = baslik.findIndex(h => /Birim Fiyat/i.test(h));
  const iKdv = baslik.findIndex(h => /KDV Oran/i.test(h));
  if (iAd < 0 || iFiyat < 0) return [];

  const kalemler: Kalem[] = [];
  for (const tr of satirlar.slice(1)) {
    const h = hucreler(tr, "td");
    if (h.length <= Math.max(iAd, iFiyat)) continue;
    const ad = adTemizle(h[iAd]);
    const birimFiyat = trSayi(h[iFiyat]);
    if (!ad || !Number.isFinite(birimFiyat)) continue;
    kalemler.push({
      ad, hamAd: h[iAd].trim(),
      miktar: iMiktar >= 0 ? trSayi(h[iMiktar]) : NaN,
      birimFiyat,
      kdv: iKdv >= 0 ? (trSayi(h[iKdv]) || 0) : 0,
    });
  }
  return kalemler;
}

export interface Mevcut {
  urun_id: string;
  fatura_kalem_adi: string;
  tedarikci_vkn: string | null;
  fatura_birim_fiyat: number;
  fatura_tarihi: string | null;
}

export interface Aday { urun_id: string; fiyat: number; kdv: number; faturaNo: string; tarih: string; kalemAdi: string }

export type Karar =
  | { tip: "guncelle"; aday: Aday; eski: number }
  | { tip: "kontrol"; aday: Aday; eski: number; oran: number }
  | { tip: "ayni" };

/** Yeni fatura fiyatı uygulanmalı mı? %30'dan büyük sıçrama elle kontrole bırakılır. */
export function kararVer(m: Mevcut, a: Aday, esik = 0.3): Karar {
  const eskiTarih = m.fatura_tarihi ?? "0000-00-00";
  if (a.tarih < eskiTarih) return { tip: "ayni" };
  if (a.tarih === eskiTarih && Math.abs(a.fiyat - m.fatura_birim_fiyat) < 0.00005) return { tip: "ayni" };
  const eski = Number(m.fatura_birim_fiyat);
  const oran = eski > 0 ? Math.abs(a.fiyat - eski) / eski : 1;
  if (oran > esik) return { tip: "kontrol", aday: a, eski, oran };
  return { tip: "guncelle", aday: a, eski };
}
