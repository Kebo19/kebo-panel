import { NextResponse } from "next/server";

// AI Analiz (raporlar sayfasındaki "AI Analiz" paneli) ve genel amaçlı
// Claude tamamlama istekleri buradan geçer. Anahtar sadece burada,
// sunucu tarafında kullanılır — tarayıcıya asla gönderilmez.
//
// NOT: Supabase "keepalive" (uyanık tutma) görevi artık burada değil,
// /api/keepalive altında — vercel.json'daki cron tanımıyla eşleşsin diye.
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Vercel'de yanlışlıkla iki ayrı env var oluşturulmuş (ANTHROPIC_API_KEY
    // ve NEXT_PUBLIC_ANTHROPIC_API_KEY). Kod sadece NEXT_PUBLIC_ olanı
    // okuyordu — o değer geçersiz/eskiyse "API key is invalid" (401)
    // hatası alıyorduk. Standart olan ANTHROPIC_API_KEY'i önce deniyoruz.
    // (Not: NEXT_PUBLIC_ önekli env var'lar tarayıcı bundle'ına gömülebiliyor;
    // bir API anahtarını bu şekilde tutmak güvenlik açısından da riskli —
    // fırsat bulunca Vercel'den bu değişkeni tamamen kaldırmak iyi olur.)
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "";

    if (!apiKey) {
      console.error("[chat] ANTHROPIC_API_KEY tanımlı değil");
      return NextResponse.json(
        { error: "Sunucu yapılandırma hatası: ANTHROPIC_API_KEY tanımlı değil." },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("API Hatası:", data);
      const detay = data?.error?.message || "Bilinmeyen hata";
      return NextResponse.json({ error: `API Hatası: ${detay}`, details: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Sunucu Hatası:", error);
    return NextResponse.json({ error: "Sunucu Hatası" }, { status: 500 });
  }
}
