// ─── YÜKLEME ÖNCESİ DOSYA HAZIRLAMA ─────────────────────────────────────────
// Vercel sunucu fonksiyonları en fazla ~4,5 MB istek gövdesi kabul eder. Telefonla
// çekilen fotoğraflar 3–8 MB olabiliyor (base64'te %33 daha büyük) ve istek sunucuya
// ulaşmadan reddediliyordu. Fotoğraflar tarayıcıda küçültülüp JPEG'e çevrilir; okuma
// kalitesi için en uzun kenar 2000 px yeterlidir.

const MAKS_KENAR = 2000;
const JPEG_KALITE = 0.82;
const MAKS_PDF_BAYT = 3 * 1024 * 1024;

export interface HazirDosya { base64: string; mediaType: string; }

const base64Oku = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] || "");
  r.onerror = () => reject(new Error("Dosya okunamadı."));
  r.readAsDataURL(blob);
});

export async function yuklemeIcinHazirla(file: File): Promise<HazirDosya> {
  if (file.type === "application/pdf") {
    if (file.size > MAKS_PDF_BAYT) throw new Error("PDF en fazla 3 MB olabilir. Sayfanın fotoğrafını yüklemeyi deneyin.");
    return { base64: await base64Oku(file), mediaType: "application/pdf" };
  }
  if (!file.type.startsWith("image/")) throw new Error("Sadece fotoğraf veya PDF yükleyebilirsiniz.");

  // HEIC gibi tarayıcının açamadığı biçimlerde küçültme yapılamaz; küçükse olduğu gibi gönder.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size <= MAKS_PDF_BAYT) return { base64: await base64Oku(file), mediaType: file.type || "image/jpeg" };
    throw new Error("Bu fotoğraf biçimi açılamadı. Kamerayı JPEG olarak ayarlayın ya da ekran görüntüsü yükleyin.");
  }
  const oran = Math.min(1, MAKS_KENAR / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * oran), h = Math.round(bitmap.height * oran);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Görsel işlenemedi.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", JPEG_KALITE));
  if (!blob) throw new Error("Görsel sıkıştırılamadı.");
  return { base64: await base64Oku(blob), mediaType: "image/jpeg" };
}

/** Sunucu JSON yerine hata sayfası döndürürse (ör. 413) anlaşılır mesaj üretir. */
export async function jsonCevap(res: Response): Promise<{ veri: Record<string, unknown>; hata: string | null }> {
  const metin = await res.text();
  let veri: Record<string, unknown> = {};
  try { veri = JSON.parse(metin); } catch { /* JSON değil */ }
  if (res.ok && !veri.error) return { veri, hata: null };
  if (typeof veri.error === "string") return { veri, hata: veri.error };
  if (res.status === 413) return { veri, hata: "Dosya çok büyük. Daha küçük bir fotoğraf deneyin." };
  if (res.status === 401) return { veri, hata: "Oturum süresi dolmuş, sayfayı yenileyip tekrar giriş yapın." };
  if (res.status === 504) return { veri, hata: "Okuma zaman aşımına uğradı, tekrar deneyin." };
  return { veri, hata: `Sunucu hatası (HTTP ${res.status}). Tekrar deneyin.` };
}
