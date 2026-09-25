import { NextResponse } from "next/server";
import { oturumKontrol } from "@/lib/supabase/server";
import { geminiIstek } from "@/lib/gemini";

// İrsaliye okuma: tedarikçi irsaliyesinin fotoğrafı/PDF'i yüklenir, Gemini kalemleri
// okuyup stoktaki ürünlerle eşleştirir. Sonuç sadece formu doldurur; kullanıcı kontrol
// edip kaydeder (bu route veritabanına hiçbir şey yazmaz).

const MAX_DOSYA_BASE64 = 14_000_000; // ~10 MB dosya

interface UrunOzeti { id: string; ad: string; birim: string }

function sistemPromptu(urunler: UrunOzeti[]) {
  const liste = urunler.map(u => `${u.id} | ${u.ad} | ${u.birim}`).join("\n");
  return `Sen bir restoranın depo asistanısın. Sana tedarikçiden gelen bir İRSALİYE (sevk irsaliyesi)
ya da fatura görseli/PDF'i verilecek. Görevin kalemleri okuyup aşağıdaki JSON'u üretmek.

RESTORANIN STOK ÜRÜNLERİ (id | ad | birim):
${liste}

KURALLAR:
- Her kalem için belgedeki ürün adını "urun_adi" alanına aynen yaz.
- Kalemi yukarıdaki listeden en uygun ürünle eşleştir ve id'sini "urun_id" alanına yaz. Emin değilsen null yaz.
  (Örn. "PİLİÇ BUT KG" → listede "Tavuk But" varsa onun id'si.)
- "miktar": belgedeki miktar. Birim listedeki üründen farklıysa (örn. belge "koli", ürün "kg") ve
  koli içeriği belgede yazıyorsa ürün birimine çevir; çeviremiyorsan belgedeki miktarı yaz ve
  "birim" alanına belgedeki birimi yaz.
- "birim_fiyat": KDV hariç birim fiyat; belgede yoksa null.
- Ondalık ayraç virgül olabilir ("12,5" → 12.5).
- Tarihi YYYY-AA-GG biçimine çevir.
- Okuyamadığın/emin olmadığın alanları "belirsiz" listesine yaz (örn. "kalem 3 miktar").
- SADECE JSON döndür.

JSON ŞEMASI:
{
  "tedarikci": "string",
  "belge_no": "string",
  "tarih": "YYYY-AA-GG" | null,
  "kalemler": [{"urun_adi": "string", "urun_id": "uuid" | null, "miktar": number, "birim": "string", "birim_fiyat": number | null}],
  "belirsiz": ["string"]
}`;
}

export async function POST(req: Request) {
  const oturum = await oturumKontrol();
  if (!oturum.ok) return oturum.yanit;
  try {
    const { dosyaBase64, mediaType, urunler } = await req.json();
    if (!dosyaBase64 || typeof dosyaBase64 !== "string") {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }
    if (dosyaBase64.length > MAX_DOSYA_BASE64) {
      return NextResponse.json({ error: "Dosya çok büyük (en fazla ~10 MB)." }, { status: 413 });
    }
    const tip = typeof mediaType === "string" && /^(image\/|application\/pdf)/.test(mediaType) ? mediaType : "image/jpeg";
    const urunListesi: UrunOzeti[] = Array.isArray(urunler)
      ? urunler.slice(0, 500).map((u: UrunOzeti) => ({ id: String(u.id), ad: String(u.ad).slice(0, 80), birim: String(u.birim).slice(0, 10) }))
      : [];

    const sonuc = await geminiIstek({
      system: sistemPromptu(urunListesi),
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: tip, data: dosyaBase64 } },
        { text: "Bu irsaliyeyi oku ve yalnızca JSON döndür." },
      ] }],
      maxOutputTokens: 16384,
      json: true,
    });
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.status });
    const metin = sonuc.metin;
    const temiz = metin.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const sonuc = JSON.parse(temiz);
      // Listede olmayan id'leri temizle
      const gecerli = new Set(urunListesi.map(u => u.id));
      if (Array.isArray(sonuc.kalemler)) {
        sonuc.kalemler = sonuc.kalemler.map((k: { urun_id?: string | null }) => ({ ...k, urun_id: k.urun_id && gecerli.has(k.urun_id) ? k.urun_id : null }));
      }
      return NextResponse.json(sonuc);
    } catch {
      return NextResponse.json({ error: "Belge okunamadı, daha net bir fotoğrafla tekrar deneyin." }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Okuma zaman aşımına uğradı, tekrar deneyin." }, { status: 504 });
    }
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
