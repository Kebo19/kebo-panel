import { NextResponse } from "next/server";
import { getDocumentProxy } from "unpdf";
import { oturumKontrol } from "@/lib/supabase/server";
import { ekstreAyristir, type PdfSayfa } from "@/lib/keboEkstre";

// Kebo cari ekstresi (PDF) okuma: PDF'in metin katmanı konumlarıyla okunur ve satırlara ayrılır.
// Yapay zekâ kullanılmaz; bu route veritabanına hiçbir şey yazmaz — kullanıcı önizlemeyi onaylayınca
// cari sayfası kayıtları kendisi yazar.

const MAX_BAYT = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const oturum = await oturumKontrol({ izin: "cari" });
  if (!oturum.ok) return oturum.yanit;
  try {
    const form = await req.formData();
    const dosya = form.get("dosya");
    if (!(dosya instanceof File)) return NextResponse.json({ error: "PDF bulunamadı." }, { status: 400 });
    if (dosya.size > MAX_BAYT) return NextResponse.json({ error: "PDF en fazla 4 MB olabilir." }, { status: 413 });
    const pdf = await getDocumentProxy(new Uint8Array(await dosya.arrayBuffer()));
    const sayfalar: PdfSayfa[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const sayfa = await pdf.getPage(i);
      const icerik = await sayfa.getTextContent();
      sayfalar.push({
        parcalar: icerik.items.flatMap(it => ("str" in it && it.str
          ? [{ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }]
          : [])),
      });
    }
    const sonuc = ekstreAyristir(sayfalar);
    if (!sonuc.satirlar.length) {
      return NextResponse.json({ error: "PDF'te ekstre satırı bulunamadı. Kebo'nun gönderdiği \"Cari Hesap Ekstresi\" PDF'i olduğundan emin olun (taranmış/fotoğraf PDF okunamaz)." }, { status: 422 });
    }
    return NextResponse.json(sonuc);
  } catch (e) {
    return NextResponse.json({ error: "PDF okunamadı: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
