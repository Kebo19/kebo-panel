import { NextResponse } from "next/server";
import { createClient, oturumKontrol } from "@/lib/supabase/server";
import { botToken, dbAnahtari, webhookGizli, tg } from "@/lib/telegram/sunucu";

// Telegram kurulumu (Ayarlar → Telegram → Kur): sadece Tam Yetkili.
//  1) Bot token'ının geçerli olduğunu kontrol eder (getMe)
//  2) Veritabanı anahtarının özetini kaydeder (tg_kurulum RPC'si, oturumdaki kullanıcıyla)
//  3) Webhook'u bu siteye yönlendirir, komut menüsünü ayarlar
export async function POST(req: Request) {
  const oturum = await oturumKontrol({ sadeceTamYetkili: true });
  if (!oturum.ok) return oturum.yanit;
  if (!botToken()) {
    return NextResponse.json({ error: "Vercel'de TELEGRAM_BOT_TOKEN tanımlı değil. Ekledikten sonra siteyi yeniden yayınlayın (Redeploy)." }, { status: 400 });
  }
  try {
    const ben = await tg<{ username: string }>("getMe");
    const supabase = await createClient();
    const { error } = await supabase.rpc("tg_kurulum", { p_anahtar: dbAnahtari(), p_bot: ben.username });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const adres = `${new URL(req.url).origin}/api/telegram`;
    await tg("setWebhook", { url: adres, secret_token: webhookGizli(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
    await tg("setMyCommands", { commands: [
      { command: "ozet", description: "Günün özeti" },
      { command: "odemeler", description: "Vadesi gelen ödemeler" },
      { command: "stok", description: "Bitmek üzere olan ürünler" },
      { command: "robot", description: "Mikro faturaları ve zamlar" },
      { command: "mikro", description: "Mikro faturalarını şimdi çek" },
      { command: "bildirim", description: "Bildirim ayarları" },
      { command: "yardim", description: "Neler yapabilirim?" },
    ] });
    await tg("setMyDescription", { description: "BCM Restoran — Kebo Panel asistanı. Panelden aldığınız kodla bağlanın." }).catch(() => {});
    return NextResponse.json({ ok: true, bot: ben.username, webhook: adres });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
