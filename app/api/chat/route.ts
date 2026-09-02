import { NextResponse } from "next/server";

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

const GEMINI_TIMEOUT_MS = 45000;
const MAX_DENEME = 3;
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { system, messages, max_tokens } = body || {};

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

    if (!apiKey) {
      console.error("[chat] GEMINI_API_KEY tanımlı değil");
      return NextResponse.json(
        { error: "Sunucu yapılandırma hatası: GEMINI_API_KEY tanımlı değil." },
        { status: 500 }
      );
    }

    // Anthropic'in "messages" formatını ({role:"user"|"assistant", content})
    // Gemini'nin "contents" formatına çeviriyoruz ({role:"user"|"model", parts}).
    const contents = (Array.isArray(messages) ? messages : []).map((m: any) => ({
      role: m?.role === "assistant" ? "model" : "user",
      parts: [{ text: typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "") }],
    }));

    let response: Response | undefined;
    let data: any;
    for (let deneme = 1; deneme <= MAX_DENEME; deneme++) {
      const controller = new AbortController();
      const zamanAsimi = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            signal: controller.signal,
            body: JSON.stringify({
              ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
              contents,
              generationConfig: {
                maxOutputTokens: typeof max_tokens === "number" ? max_tokens : 1024,
                thinkingConfig: { thinkingLevel: "minimal" },
              },
            }),
          }
        );
      } finally {
        clearTimeout(zamanAsimi);
      }

      try {
        data = await response.json();
      } catch {
        console.error("[chat] Gemini'den geçerli JSON gelmedi, HTTP", response.status);
        return NextResponse.json(
          { error: `Gemini API beklenmedik bir cevap döndürdü (HTTP ${response.status}).` },
          { status: 502 }
        );
      }

      const gecici = response.status === 503 || response.status === 429;
      if (gecici && deneme < MAX_DENEME) {
        console.warn(`[chat] Geçici Gemini hatası (HTTP ${response.status}), ${deneme}. deneme, tekrar denenecek`);
        await bekle(1200 * deneme);
        continue;
      }
      break;
    }

    if (!response!.ok) {
      console.error("API Hatası (Gemini):", JSON.stringify(data));
      const detay = data?.error?.message || "Bilinmeyen hata";
      return NextResponse.json({ error: `API Hatası: ${detay}`, details: data }, { status: response!.status });
    }

    const metin = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";

    // Frontend Anthropic'in "content: [{type,text}]" şeklini bekliyor —
    // Gemini'nin cevabını aynı şekle sarıp döndürüyoruz.
    return NextResponse.json({ content: [{ type: "text", text: metin || "Cevap alınamadı." }] });
  } catch (error: any) {
    console.error("Sunucu Hatası:", error);
    if (error?.name === "AbortError") {
      return NextResponse.json(
        { error: `Gemini API zaman aşımına uğradı (${GEMINI_TIMEOUT_MS / 1000}sn), lütfen tekrar deneyin.` },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: "Sunucu Hatası" }, { status: 500 });
  }
}
