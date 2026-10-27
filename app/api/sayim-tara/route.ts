import { NextResponse } from "next/server";
import { oturumKontrol } from "@/lib/supabase/server";
import { sayimKagidiOku, type Satir } from "@/lib/sayimOku";

// Sayım kağıdı okuma: doldurulmuş sayım listesinin (lib/kasaFormu.ts) telefon fotoğrafı yüklenir,
// Gemini her satırın sabah / akşam sayımını ve firesini okur. Sonuç sadece formu doldurur;
// kullanıcı kontrol edip kaydeder (bu route veritabanına hiçbir şey yazmaz).

const MAX_DOSYA_BASE64 = 14_000_000;

export async function POST(req: Request) {
  const oturum = await oturumKontrol({ izin: "stok" });
  if (!oturum.ok) return oturum.yanit;
  try {
    const { dosyaBase64, mediaType, urunler, periyot } = await req.json();
    if (!dosyaBase64 || typeof dosyaBase64 !== "string") return NextResponse.json({ error: "Fotoğraf bulunamadı." }, { status: 400 });
    if (dosyaBase64.length > MAX_DOSYA_BASE64) return NextResponse.json({ error: "Dosya çok büyük (en fazla ~10 MB)." }, { status: 413 });
    const tip = typeof mediaType === "string" && /^(image\/|application\/pdf)/.test(mediaType) ? mediaType : "image/jpeg";
    const liste: Satir[] = Array.isArray(urunler)
      ? urunler.slice(0, 300).map((u: Satir) => ({ id: String(u.id), no: Number(u.no) || 0, ad: String(u.ad).slice(0, 90), birim: String(u.birim).slice(0, 10) }))
      : [];

    const sonuc = await sayimKagidiOku(dosyaBase64, tip, liste, String(periyot || "Günlük"));
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.status });
    return NextResponse.json(sonuc.veri);
  } catch (e) {
    return NextResponse.json({ error: "Beklenmeyen hata: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
