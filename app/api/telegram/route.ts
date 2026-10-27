import { NextResponse } from "next/server";
import { botToken, webhookGizli, mesajGonder } from "@/lib/telegram/sunucu";
import { guncellemeIsle, type TgGuncelleme } from "@/lib/telegram/asistan";

// Telegram webhook'u: Telegram her mesajı buraya gönderir (kurulum: Ayarlar → Telegram → Kur).
// Gizli başlık doğru değilse istek reddedilir. Hata olsa bile 200 döner (Telegram aynı mesajı tekrar göndermesin).
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!botToken()) return NextResponse.json({ ok: false, hata: "TELEGRAM_BOT_TOKEN tanımlı değil" }, { status: 503 });
  if (req.headers.get("x-telegram-bot-api-secret-token") !== webhookGizli()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let g: TgGuncelleme | null = null;
  try {
    g = await req.json();
    await guncellemeIsle(g!);
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : String(e);
    console.error("[telegram]", mesaj);
    const chat = g?.message?.chat.id ?? g?.callback_query?.message?.chat.id;
    if (chat) await mesajGonder(chat, `⚠️ Bir hata oldu: ${mesaj.replace(/[<>&]/g, "").slice(0, 300)}`).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
