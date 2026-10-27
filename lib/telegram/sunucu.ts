// ─── TELEGRAM: SUNUCU YARDIMCILARI (sadece API route'larında kullanılır) ───────
// Tek ortam değişkeni gerekir: TELEGRAM_BOT_TOKEN (BotFather'dan).
// Bundan iki değer türetilir:
//   • veritabanı anahtarı  → tg_* RPC'leri bu anahtarla çağrılır (veritabanında sadece özeti durur)
//   • webhook gizli değeri → Telegram her istekte "X-Telegram-Bot-Api-Secret-Token" başlığıyla gönderir
// Token değişirse panelde Ayarlar → Telegram → "Kur" yeniden basılır.
import { createHmac } from "crypto";

export const botToken = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const turet = (amac: string) => createHmac("sha256", botToken()).update("kebo-panel:" + amac).digest("hex");
export const dbAnahtari = () => turet("veritabani");
export const webhookGizli = () => turet("webhook").slice(0, 64);

// ── Telegram Bot API ──
export async function tg<T = unknown>(metod: string, govde: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${botToken()}/${metod}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde), cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${metod}: ${j.description || r.status}`);
  return j.result as T;
}

export type Buton = { text: string; callback_data?: string; url?: string };

/** HTML mesaj gönderir; 4096 karakter sınırını aşan metni böler. */
export async function mesajGonder(chatId: number, metin: string, butonlar?: Buton[][]) {
  const parcalar: string[] = [];
  let kalan = metin;
  while (kalan.length > 3900) {
    const kes = kalan.lastIndexOf("\n", 3900) > 1000 ? kalan.lastIndexOf("\n", 3900) : 3900;
    parcalar.push(kalan.slice(0, kes)); kalan = kalan.slice(kes);
  }
  parcalar.push(kalan);
  for (let i = 0; i < parcalar.length; i++) {
    await tg("sendMessage", {
      chat_id: chatId, text: parcalar[i], parse_mode: "HTML", disable_web_page_preview: true,
      ...(butonlar && i === parcalar.length - 1 ? { reply_markup: { inline_keyboard: butonlar } } : {}),
    });
  }
}

export async function mesajDuzenle(chatId: number, mesajId: number, metin: string, butonlar?: Buton[][]) {
  await tg("editMessageText", {
    chat_id: chatId, message_id: mesajId, text: metin.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: butonlar || [] },
  }).catch(() => { /* aynı metinse Telegram hata verir, önemsiz */ });
}

export const yaziyor = (chatId: number) => tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

/** Telegram'daki dosyayı indirip base64 döndürür. */
export async function dosyaIndir(fileId: string): Promise<{ base64: string; mime: string }> {
  const f = await tg<{ file_path: string; file_size?: number }>("getFile", { file_id: fileId });
  if ((f.file_size || 0) > 10_000_000) throw new Error("Dosya çok büyük (en fazla 10 MB).");
  const r = await fetch(`https://api.telegram.org/file/bot${botToken()}/${f.file_path}`, { cache: "no-store" });
  if (!r.ok) throw new Error("Fotoğraf indirilemedi.");
  const b = Buffer.from(await r.arrayBuffer());
  const uz = f.file_path.split(".").pop()?.toLowerCase();
  const mime = uz === "png" ? "image/png" : uz === "pdf" ? "application/pdf" : uz === "webp" ? "image/webp" : "image/jpeg";
  return { base64: b.toString("base64"), mime };
}

// ── Veritabanı (Supabase RPC, oturumsuz; yetkiyi RPC'ler kontrol eder) ──
export async function rpc<T = unknown>(ad: string, args: Record<string, unknown>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const r = await fetch(`${url}/rest/v1/rpc/${ad}`, {
    method: "POST", cache: "no-store",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_anahtar: dbAnahtari(), ...args }),
  });
  const metin = await r.text();
  if (!r.ok) {
    let m = metin; try { m = JSON.parse(metin).message || metin; } catch { /* düz metin */ }
    throw new Error(m.slice(0, 300));
  }
  return (metin ? JSON.parse(metin) : null) as T;
}

export const panelAdresi = () => (process.env.PANEL_ADRESI || "https://kebo-panel.vercel.app").replace(/\/$/, "");
