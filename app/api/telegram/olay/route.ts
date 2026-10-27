import { NextResponse } from "next/server";
import { botToken, rpc, mesajGonder } from "@/lib/telegram/sunucu";
import { mikroRaporMetni, type MikroRapor } from "@/lib/telegram/ozet";

// Veritabanından gelen olay bildirimi (pg_net): ör. dükkân robotu "Mikro'dan çek" talebini bitirdi.
// Sadece talep kimliği gelir; ayrıntı ve kime gideceği anahtarla veritabanından okunur.
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!botToken()) return NextResponse.json({ ok: false });
  try {
    const { tur, id } = await req.json();
    if (tur !== "mikro" || typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
    const r = await rpc<(MikroRapor & { chatler: number[] }) | null>("tg_mikro_rapor", { p_id: id });
    if (!r || !["bitti", "hata"].includes(r.durum)) return NextResponse.json({ ok: false });
    const metin = mikroRaporMetni(r);
    for (const c of r.chatler || []) await mesajGonder(c, metin).catch(() => {});
    return NextResponse.json({ ok: true, gonderilen: r.chatler?.length || 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, hata: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
