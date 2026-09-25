import { NextResponse } from "next/server";
import { oturumKontrol } from "@/lib/supabase/server";
import { geminiIstek } from "@/lib/gemini";

// AI Analiz (raporlar sayfasındaki "AI Analiz" paneli) buradan geçer.
// Anahtar sadece burada, sunucu tarafında kullanılır — tarayıcıya asla
// gönderilmez.
//
// NOT (02.09.2026): Bu route eskiden Anthropic (Claude) API'sini
// kullanıyordu, ama Anthropic ücretli bir servis (hesapta kredi/bakiye
// gerektiriyor) ve o an hesapta bakiye yoktu. Fiş tarama özelliğinde
// (app/api/rapor-tara) zaten kullandığımız, tamamen ücretsiz katmandaki
// Gemini'ye — aynı GEMINI_API_KEY'i kullanarak — geçirdik. Böylece iki ayrı
// API sağlayıcı/fatura yönetmek yerine tek, tamamen bedava bir entegrasyona
// indirgedik. Frontend (raporlar/page.tsx) hâlâ Anthropic'in "messages"
// isteğini gönderiyor ve "content: [{text}]" cevabını bekliyor — bu route
// o formatı Gemini'ninkine çevirip geri çeviriyor, frontend'te değişiklik
// gerekmedi.
//
// NOT: Supabase "keepalive" (uyanık tutma) görevi artık burada değil,
// /api/keepalive altında — vercel.json'daki cron tanımıyla eşleşsin diye.


export async function POST(req: Request) {
  // Sadece giriş yapmış panel kullanıcıları AI'yi kullanabilir (Gemini kotası korunur).
  const oturum = await oturumKontrol();
  if (!oturum.ok) return oturum.yanit;
  try {
    const { system, messages, max_tokens, json } = (await req.json()) || {};
    // Anthropic "messages" biçimi → Gemini "contents" biçimi
    const contents = (Array.isArray(messages) ? messages : []).map((m: { role?: string; content?: unknown }) => ({
      role: (m?.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "") }],
    }));
    const sonuc = await geminiIstek({
      system: typeof system === "string" ? system : undefined,
      contents,
      // Model "düşünme" için de aynı bütçeyi kullanır; düşük limit cevabı yarıda keser.
      maxOutputTokens: Math.max(8192, typeof max_tokens === "number" ? max_tokens : 0),
      json: !!json,
    });
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.status });
    // Frontend Anthropic'in "content: [{type,text}]" şeklini bekliyor.
    return NextResponse.json({ content: [{ type: "text", text: sonuc.metin }] });
  } catch (error) {
    console.error("[chat] Sunucu hatası:", error);
    return NextResponse.json({ error: "Sunucu hatası, tekrar deneyin." }, { status: 500 });
  }
}
