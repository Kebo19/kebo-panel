import { NextResponse } from "next/server";
import { botToken, rpc, mesajGonder } from "@/lib/telegram/sunucu";
import { mikroRaporMetni, stokFaturaMetni, type MikroRapor, type StokFatura } from "@/lib/telegram/ozet";
import { stokFaturaButonlari } from "@/lib/telegram/asistan";

// Veritabanından gelen olay bildirimi (pg_net): ör. dükkân robotu "Mikro'dan çek" talebini bitirdi.
// Sadece talep kimliği gelir; ayrıntı ve kime gideceği anahtarla veritabanından okunur.
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!botToken()) return NextResponse.json({ ok: false });
  try {
    const { tur, id } = await req.json();
    if (tur === "stok_giris") {
      // Yeni fatura kalemleri: her fatura için "stoğa işlensin mi?" (bir kez; RPC bildirileni işaretler)
      const r = await rpc<{ faturalar: StokFatura[]; chatler: number[] }>("tg_stok_giris_bildirilecek", {});
      for (const f of r.faturalar || []) {
        const m = stokFaturaMetni(f);
        for (const c of r.chatler || []) await mesajGonder(c, m.metin, stokFaturaButonlari(f.gib_no, m.eslesen, m.eslesmeyen, m.irsaliye, m.fark)).catch(() => {});
      }
      return NextResponse.json({ ok: true, fatura: r.faturalar?.length || 0 });
    }
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
