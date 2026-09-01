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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("API Hatası:", data);
      return NextResponse.json({ error: "API Hatası", details: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Sunucu Hatası:", error);
    return NextResponse.json({ error: "Sunucu Hatası" }, { status: 500 });
  }
}
