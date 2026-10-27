import { NextResponse } from "next/server";
import { bugun } from "@/lib/tarih";
import { botToken, rpc, mesajGonder } from "@/lib/telegram/sunucu";
import { sabahOzeti, oglenUyarisi, type TgVeri } from "@/lib/telegram/ozet";

// Günlük Telegram bildirimleri (Vercel Cron, vercel.json):
//   ?tur=sabah → her bağlı kullanıcıya sabah özeti (kendi yetkisindeki bölümlerle)
//   ?tur=oglen → Mikro robotu çalıştıktan sonra: robot sonucu, zamlar, bugün/yarın bitecekler (söylenecek bir şey yoksa mesaj atılmaz)
export const maxDuration = 60;

export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  if (!botToken()) return NextResponse.json({ ok: false, hata: "TELEGRAM_BOT_TOKEN yok" });
  const tur = new URL(req.url).searchParams.get("tur") === "oglen" ? "oglen" : "sabah";
  const b = bugun();
  let gonderilen = 0; const hatalar: string[] = [];
  try {
    const aboneler = await rpc<{ chat_id: number }[]>("tg_aboneler", { p_tur: tur });
    for (const { chat_id } of aboneler) {
      try {
        const k = await rpc<{ ad: string } | null>("tg_kim", { p_chat: chat_id });
        if (!k) continue;
        const v = await rpc<TgVeri>("tg_veri", { p_chat: chat_id });
        const metin = tur === "sabah" ? sabahOzeti(v, k.ad, b) : oglenUyarisi(v, b);
        if (metin) { await mesajGonder(chat_id, metin); gonderilen++; }
      } catch (e) { hatalar.push(e instanceof Error ? e.message : String(e)); }
    }
  } catch (e) {
    return NextResponse.json({ ok: false, hata: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tur, gonderilen, hatalar });
}
