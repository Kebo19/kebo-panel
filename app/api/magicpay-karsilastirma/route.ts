import { NextResponse } from "next/server";
import { oturumKontrol } from "@/lib/supabase/server";
import { magicpayGorebilirMi, mpGunCoz } from "@/lib/magicpay";

// MagicPay (kebo-admin-ui.magicpay.ai) köprüsü — SALT OKUNUR.
//
// Adisyon programının raporlama API'sinden (kebo-api.magicpay.ai) günlük ciro,
// paket kanalları ve ödeme dağılımını çeker; /magicpay sayfası bunu Kasa
// Raporu ile karşılaştırır. Hiçbir veriyi kaydetmez veya değiştirmez.
//
// ERİŞİM: sadece lib/magicpay.ts → MAGICPAY_GORENLER listesindeki kullanıcı(lar).
// Tam Yetkili olmak yetmez.
//
// Kimlik bilgileri Vercel ortam değişkeni olarak tanımlanır, sadece burada
// (sunucu tarafında) kullanılır, tarayıcıya hiç gitmez:
//   MAGICPAY_EMAIL, MAGICPAY_PASSWORD, (opsiyonel) MAGICPAY_BRANCH_ID (Çorum = 15)

const MAGICPAY_API = "https://kebo-api.magicpay.ai/api";
const MAGICPAY_BRANCH_ID = process.env.MAGICPAY_BRANCH_ID || "15";
const EN_FAZLA_GUN = 62;

// Fonksiyon örneği yaşadığı sürece token bellekte tutulur (genelde 3 saat geçerli).
let tokenCache: { token: string; expiresAt: number } | null = null;

async function magicpayLogin(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const email = process.env.MAGICPAY_EMAIL || "";
  const password = process.env.MAGICPAY_PASSWORD || "";
  if (!email || !password) {
    throw new Error("MagicPay bağlantısı kurulmamış: Vercel'de MAGICPAY_EMAIL ve MAGICPAY_PASSWORD tanımlı değil.");
  }

  const res = await fetch(`${MAGICPAY_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`MagicPay girişi başarısız (HTTP ${res.status}). Kullanıcı adı/şifre değişmiş olabilir.`);
  }
  const data = await res.json();
  if (!data?.access_token) throw new Error("MagicPay giriş cevabında access_token bulunamadı.");
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 10800) * 1000 };
  return tokenCache.token;
}

async function magicpayGet(path: string) {
  const istek = (token: string) =>
    fetch(`${MAGICPAY_API}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  let res = await istek(await magicpayLogin());
  if (res.status === 401) {
    // Token süresi dolmuş olabilir: bir kez yeniden giriş yapıp tekrar dene.
    tokenCache = null;
    res = await istek(await magicpayLogin());
  }
  if (!res.ok) throw new Error(`MagicPay API hatası (HTTP ${res.status}).`);
  return res.json();
}

const TARIH_DESENI = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const oturum = await oturumKontrol();
  if (!oturum.ok) return oturum.yanit;
  if (!magicpayGorebilirMi(oturum.userId)) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start") || "";
  const end = searchParams.get("end") || "";
  if (!TARIH_DESENI.test(start) || !TARIH_DESENI.test(end) || start > end) {
    return NextResponse.json({ error: "Başlangıç ve bitiş tarihi YYYY-AA-GG biçiminde olmalı." }, { status: 400 });
  }
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > EN_FAZLA_GUN) {
    return NextResponse.json({ error: `En fazla ${EN_FAZLA_GUN} günlük aralık seçilebilir.` }, { status: 400 });
  }

  try {
    const turnover = await magicpayGet(
      `/reports/turnover/daily?start=${start}&end=${end}&branch_ids=${encodeURIComponent(MAGICPAY_BRANCH_ID)}`);
    const sube = Array.isArray(turnover) ? turnover[0] : null;
    const gunler = ((sube?.rows as Record<string, unknown>[]) || []).map(mpGunCoz);
    return NextResponse.json(
      { sube: sube?.branch_name ?? null, gunler },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mesaj = error instanceof Error ? error.message : "Sunucu hatası.";
    console.error("MagicPay karşılaştırma hatası:", mesaj);
    return NextResponse.json({ error: mesaj }, { status: 502 });
  }
}
