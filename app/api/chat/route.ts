import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Vercel'deki key'ini kullanarak Anthropic'e arka plandan istek atıyoruz
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body)
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