import { NextResponse } from "next/server";
import { getDocumentProxy } from "unpdf";
import { oturumKontrol } from "@/lib/supabase/server";
import { geminiIstek } from "@/lib/gemini";

// Firma cari hesap ekstresi okuma (31.10.2026): herhangi bir tedarikçinin gönderdiği cari ekstre PDF'i
// (ya da fotoğrafı) satırlara ayrılır. Metin katmanı olan PDF'te metin, taranmış PDF / fotoğrafta dosyanın
// kendisi yapay zekâya verilir. Bu route veritabanına hiçbir şey yazmaz; karşılaştırma ön yüzde
// (lib/cariMutabakat) yapılır.

export const maxDuration = 60;
const MAX_DOSYA_BASE64 = 5_500_000; // ~4 MB dosya (Vercel istek sınırı)

const SISTEM = `Sen bir restoranın muhasebe asistanısın. Sana bir TEDARİKÇİ FİRMANIN gönderdiği CARİ HESAP EKSTRESİ
verilecek (firma kendi defterinden restoranın hesabını döküyor). Her hareket satırını çıkar.

YÖN KURALI (çok önemli): Ekstre FİRMANIN gözünden yazılır.
- Restoranın firmaya BORCUNU ARTIRAN satırlar → "etki": "artar". Genelde "Borç" sütunundadır: satış faturası, masraf yansıtma.
- Borcu AZALTAN satırlar → "etki": "azalir". Genelde "Alacak" sütunundadır: tahsilat, havale/EFT, kredi kartı, nakit, çek,
  virman/mahsup, iade faturası (restorandan firmaya iade), fiyat farkı/iskonto faturası.
- Bakiye "B"/"(B)"/"Borç" ise restoran borçlu → pozitif; "A"/"(A)"/"Alacak" ise restoran alacaklı → negatif.
- "Devir", "Devreden", "Açılış" satırı → "tur": "acilis" (tutarı devreden bakiye; etki bakiyenin yönüne göre).

"tur": "fatura" (satış faturası), "odeme" (tahsilat/havale/kart/nakit/çek/virman), "iade" (iade/fiyat farkı faturası),
"acilis", "diger".
Tutarlar pozitif sayı ("12.345,67" → 12345.67). Tarihleri YYYY-AA-GG yap. Evrak/fatura numarasını aynen yaz.
Toplam/ara toplam satırlarını satır olarak ALMA. Hiçbir satırı atlama.

SADECE JSON döndür:
{"firma": string|null, "vergi_no": string|null, "donem_bas": "YYYY-AA-GG"|null, "donem_bit": "YYYY-AA-GG"|null,
 "son_bakiye": number|null,
 "satirlar": [{"tarih": "YYYY-AA-GG", "evrak_no": string|null, "aciklama": string|null,
   "tur": "fatura"|"odeme"|"iade"|"acilis"|"diger", "etki": "artar"|"azalir", "tutar": number, "bakiye": number|null}]}`;

async function pdfMetni(veri: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(veri);
    const sayfalar: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const icerik = await (await pdf.getPage(i)).getTextContent();
      // Aynı satırdaki parçaları (y) birleştir
      const satirlar = new Map<number, { x: number; s: string }[]>();
      for (const it of icerik.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const y = Math.round(it.transform[5]);
        satirlar.set(y, [...(satirlar.get(y) || []), { x: it.transform[4], s: it.str }]);
      }
      sayfalar.push([...satirlar.entries()].sort((a, b) => b[0] - a[0])
        .map(([, p]) => p.sort((a, b) => a.x - b.x).map(x => x.s).join("  ")).join("\n"));
    }
    return sayfalar.join("\n\n--- sayfa ---\n\n");
  } catch { return ""; }
}

export async function POST(req: Request) {
  const oturum = await oturumKontrol({ izin: "cari" });
  if (!oturum.ok) return oturum.yanit;
  try {
    const { dosyaBase64, mediaType } = await req.json();
    if (!dosyaBase64 || typeof dosyaBase64 !== "string") return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    if (dosyaBase64.length > MAX_DOSYA_BASE64) return NextResponse.json({ error: "Dosya çok büyük (en fazla ~4 MB). PDF'i bölerek yükleyin." }, { status: 413 });
    const tip = typeof mediaType === "string" && /^(image\/|application\/pdf)/.test(mediaType) ? mediaType : "application/pdf";
    const metin = tip === "application/pdf" ? await pdfMetni(Buffer.from(dosyaBase64, "base64")) : "";
    const metinYeterli = metin.replace(/\s/g, "").length > 200;
    const sonuc = await geminiIstek({
      system: SISTEM,
      contents: [{ role: "user", parts: metinYeterli
        ? [{ text: `EKSTRE METNİ (PDF'ten okundu, sütunlar boşlukla ayrık):\n\n${metin.slice(0, 120000)}\n\nYalnızca JSON döndür.` }]
        : [{ inline_data: { mime_type: tip, data: dosyaBase64 } }, { text: "Bu cari ekstreyi oku, yalnızca JSON döndür." }] }],
      maxOutputTokens: 32768,
      json: true,
    });
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.status });
    const temiz = sonuc.metin.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const v = JSON.parse(temiz);
      const satirlar = (Array.isArray(v.satirlar) ? v.satirlar : [])
        .map((s: Record<string, unknown>) => ({
          tarih: String(s.tarih || "").slice(0, 10), evrak_no: s.evrak_no ? String(s.evrak_no) : null,
          aciklama: s.aciklama ? String(s.aciklama).slice(0, 200) : null,
          tur: ["fatura", "odeme", "iade", "acilis", "diger"].includes(String(s.tur)) ? s.tur : "diger",
          etki: s.etki === "azalir" ? "azalir" : "artar",
          tutar: Math.abs(Number(s.tutar) || 0), bakiye: s.bakiye == null ? null : Number(s.bakiye),
        }))
        .filter((s: { tarih: string; tutar: number }) => /^\d{4}-\d{2}-\d{2}$/.test(s.tarih) && s.tutar > 0);
      if (!satirlar.length) return NextResponse.json({ error: "Ekstrede hareket satırı bulunamadı. Doğru PDF olduğundan emin olun." }, { status: 422 });
      return NextResponse.json({
        firma: v.firma || null, vergi_no: v.vergi_no || null, donem_bas: v.donem_bas || null, donem_bit: v.donem_bit || null,
        son_bakiye: v.son_bakiye == null ? null : Number(v.son_bakiye), satirlar, kaynak: metinYeterli ? "metin" : "gorsel",
      });
    } catch {
      return NextResponse.json({ error: "Ekstre okunamadı, tekrar deneyin." }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Sunucu hatası: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
