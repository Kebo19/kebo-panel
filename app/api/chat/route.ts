import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const apiKey = process.env.GEMINI_API_KEY || "";

    if (!apiKey) {
      return NextResponse.json({ error: "API key eksik" }, { status: 500 });
    }

    const systemPrompt = body.system || "";
    const messages = body.messages || [];
    
    const geminiMessages = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    if (systemPrompt && geminiMessages.length > 0) {
      geminiMessages[0].parts[0].text = `${systemPrompt}\n\n${geminiMessages[0].parts[0].text}`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: { maxOutputTokens: body.max_tokens || 2000 }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: "API Hatası", details: data }, { status: response.status });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return NextResponse.json({
      content: [{ type: "text", text }]
    });

  } catch (error) {
    return NextResponse.json({ error: "Sunucu Hatası" }, { status: 500 });
  }
}