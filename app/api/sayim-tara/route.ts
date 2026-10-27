import { NextResponse } from "next/server";
import { oturumKontrol } from "@/lib/supabase/server";
import { geminiIstek } from "@/lib/gemini";

// Sayım kağıdı okuma: doldurulmuş sayım listesinin (lib/kasaFormu.ts) telefon fotoğrafı yüklenir,
// Gemini her satırın sabah / akşam sayımını ve firesini okur. Sonuç sadece formu doldurur;
// kullanıcı kontrol edip kaydeder (bu route veritabanına hiçbir şey yazmaz).

const MAX_DOSYA_BASE64 = 14_000_000;

interface Satir { id: string; no: number; ad: string; birim: string }

function sistemPromptu(liste: Satir[], periyot: string) {
  const tablo = liste.map(u => `${u.no} | ${u.id} | ${u.ad} | ${u.birim}`).join("\n");
  return `Sen bir restoranın depo asistanısın. Sana elle doldurulmuş bir "KEBO ${periyot} Sayım Listesi" kağıdının
fotoğrafı verilecek. Kağıttaki tablo sütunları: No | Ürün | Birim | Sabah sayım | Akşam sayım | Fire | Not.

KAĞITTAKİ ÜRÜNLER (No | id | ad | birim) — kağıt bu listeyle basıldı:
${tablo}

KURALLAR:
- Her dolu satır için ürünü önce ADINDAN, sonra No'sundan eşleştir ve id'sini "urun_id" alanına yaz.
  Altta elle eklenmiş, listede olmayan bir ürün varsa urun_id null, "yazilan_ad" alanına yazılan adı yaz.
- "sabah", "aksam", "fire": elle yazılan sayılar. Boş kutu → null. 0 yazılmışsa 0 (boş ile karıştırma).
- Ondalık ayraç virgül olabilir ("12,5" → 12.5). Rakamda nokta binlik olabilir ("1.500" → 1500).
- Kutuya "2 koli" gibi birim yazılmışsa ve koli içeriği ürün adında yazıyorsa (ör. "1 KOLİ 10 KG")
  ürün birimine çevir (2 koli → 20) ve "belirsiz" listesine not düş.
- "not": satırdaki not sütunu (yoksa null).
- Üstteki "Tarih" alanını YYYY-AA-GG olarak "tarih"e yaz (okunamazsa null). "Sayan" adını "sayan"a yaz.
- Alttaki NOTLAR kutusunu "genel_not"a yaz.
- Okumakta zorlandığın ya da emin olmadığın her şeyi "belirsiz" listesine yaz (ör. "No 5 akşam: 3 mü 8 mi?").
- Tamamen boş satırları atla. SADECE JSON döndür.

JSON ŞEMASI:
{
  "tarih": "YYYY-AA-GG" | null,
  "sayan": "string" | null,
  "satirlar": [{"no": number | null, "urun_id": "uuid" | null, "yazilan_ad": "string" | null, "sabah": number | null, "aksam": number | null, "fire": number | null, "not": "string" | null}],
  "genel_not": "string" | null,
  "belirsiz": ["string"]
}`;
}

const sayiMi = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);

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

    const sonuc = await geminiIstek({
      system: sistemPromptu(liste, String(periyot || "Günlük").slice(0, 20)),
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: tip, data: dosyaBase64 } },
        { text: "Bu sayım kağıdını oku ve yalnızca JSON döndür." },
      ] }],
      maxOutputTokens: 16384,
      json: true,
    });
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.status });
    const temiz = sonuc.metin.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    let v: Record<string, unknown>;
    try { v = JSON.parse(temiz); }
    catch { return NextResponse.json({ error: "Kağıt okunamadı, daha net bir fotoğrafla tekrar deneyin." }, { status: 422 }); }

    const gecerli = new Map(liste.map(u => [u.id, u]));
    const noIle = new Map(liste.map(u => [u.no, u]));
    const satirlar = (Array.isArray(v.satirlar) ? v.satirlar : []).map((s: Record<string, unknown>) => {
      let id = typeof s.urun_id === "string" && gecerli.has(s.urun_id) ? s.urun_id : null;
      if (!id && !s.yazilan_ad && typeof s.no === "number") id = noIle.get(s.no)?.id ?? null;
      return {
        urun_id: id, no: typeof s.no === "number" ? s.no : null,
        yazilan_ad: typeof s.yazilan_ad === "string" ? s.yazilan_ad.slice(0, 120) : null,
        sabah: sayiMi(s.sabah), aksam: sayiMi(s.aksam), fire: sayiMi(s.fire),
        not: typeof s.not === "string" ? s.not.slice(0, 200) : null,
      };
    }).filter(s => s.sabah !== null || s.aksam !== null || s.fire !== null || s.not);

    return NextResponse.json({
      tarih: typeof v.tarih === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.tarih) ? v.tarih : null,
      sayan: typeof v.sayan === "string" ? v.sayan.slice(0, 60) : null,
      genel_not: typeof v.genel_not === "string" ? v.genel_not.slice(0, 500) : null,
      belirsiz: Array.isArray(v.belirsiz) ? v.belirsiz.map(String).slice(0, 30) : [],
      satirlar,
    });
  } catch (e) {
    return NextResponse.json({ error: "Beklenmeyen hata: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
