import { NextResponse } from "next/server";

// MagicPay (kebo-admin-ui.magicpay.ai) entegrasyonu — 02.09.2026
//
// Genel merkez / POS sistemimiz olan MagicPay'in kendi REST API'sinden (kebo-api.magicpay.ai)
// günlük ciro rakamlarını çekip Kebo Panel'e ELLE girilen günlük raporla karşılaştırmak için.
//
// ÖNEMLİ: Bu route hiçbir veriyi otomatik değiştirmez / kaydetmez — sadece Rapor Analiz
// sayfasındaki "MagicPay Karşılaştırma" sekmesinin okuduğu salt-okunur bir köprüdür.
//
// Kimlik bilgileri (MAGICPAY_EMAIL / MAGICPAY_PASSWORD) sadece burada, sunucu tarafında
// kullanılır ve Vercel ortam değişkeni olarak tanımlanmalı — canın kendisi asla bu değerleri
// görmedi/girmedi, panel sahibi tarafından Vercel'e girildi.
//
// MagicPay tarafı bir "manager" hesabıyla (tam yönetici yetkili) giriş yapıyor — MagicPay
// ileride salt-okunur/rapor-only bir servis hesabı sunarsa bu hesap onunla değiştirilmeli.

const MAGICPAY_API = "https://kebo-api.magicpay.ai/api";
const MAGICPAY_BRANCH_ID = process.env.MAGICPAY_BRANCH_ID || "15";

// Serverless fonksiyon örneği (instance) yaşadığı sürece token'ı bellekte tutuyoruz —
// her istek için yeniden giriş yapmayı önler. expires_in genelde 10800sn (3 saat).
let tokenCache: { token: string; expiresAt: number } | null = null;

async function magicpayLogin(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const email = process.env.MAGICPAY_EMAIL || "";
  const password = process.env.MAGICPAY_PASSWORD || "";
  if (!email || !password) {
    throw new Error("Sunucu yapılandırma hatası: MAGICPAY_EMAIL / MAGICPAY_PASSWORD tanımlı değil.");
  }

  const res = await fetch(`${MAGICPAY_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(`MagicPay giriş hatası (HTTP ${res.status}) — kullanıcı adı/şifre değişmiş olabilir.`);
  }

  const data = await res.json();
  if (!data?.access_token) throw new Error("MagicPay giriş cevabında access_token bulunamadı.");

  tokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 10800) * 1000 };
  return tokenCache.token;
}

async function magicpayGet(path: string) {
  const token = await magicpayLogin();
  const res = await fetch(`${MAGICPAY_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    // Token süresi dolmuş/geçersiz olabilir — bir kez daha giriş deneyip tekrar çağır.
    tokenCache = null;
    const freshToken = await magicpayLogin();
    const retry = await fetch(`${MAGICPAY_API}${path}`, { headers: { Authorization: `Bearer ${freshToken}` } });
    if (!retry.ok) throw new Error(`MagicPay API hatası (HTTP ${retry.status}) — ${path}`);
    return retry.json();
  }
  if (!res.ok) throw new Error(`MagicPay API hatası (HTTP ${res.status}) — ${path}`);
  return res.json();
}

// payment_breakdown içindeki anahtarlar mağaza kurulumuna göre değişebiliyor
// (örn. "cash"/"kart"/"card"/"TRENDYOL_CARD"/"TRENDYOL_PLUXEE" vb.) — nakit dışındaki
// her şeyi "kart/dijital" olarak topluyoruz.
const NAKIT_ANAHTAR = /^(cash|nakit)$/i;

function paymentBreakdownTopla(pb: Record<string, unknown> | undefined | null) {
  let nakit = 0, digerToplam = 0;
  Object.entries(pb || {}).forEach(([k, v]) => {
    const tutar = Number(v) || 0;
    if (NAKIT_ANAHTAR.test(k)) nakit += tutar; else digerToplam += tutar;
  });
  return { nakit, digerToplam };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!start || !end) {
      return NextResponse.json({ error: "start ve end tarih parametreleri gerekli (YYYY-AA-GG)." }, { status: 400 });
    }

    const turnover = await magicpayGet(`/reports/turnover/daily?start=${start}&end=${end}&branch_ids=${MAGICPAY_BRANCH_ID}`);
    const gunlukSatirlar: any[] = turnover?.[0]?.rows || [];

    const gunler = gunlukSatirlar.map((r: any) => {
      const { nakit, digerToplam } = paymentBreakdownTopla(r.payment_breakdown);
      return {
        tarih: r.day,
        brutMP: Number(r.gross_turnover) || 0, // indirim öncesi brüt satış
        netMP: Number(r.turnover_total ?? r.net_turnover) || 0, // indirim sonrası (MagicPay'in "net"i — Kebo Panel'deki Net Ciro ile birebir aynı tanım değil, gider/iade düşülmüyor)
        indirimMP: Number(r.discount_amount) || 0,
        iadeMP: Number(r.refund_total) || 0,
        iptalMP: Number(r.cancel_total) || 0,
        siparisSayisiMP: Number(r.orders_total) || 0,
        paketCiroMP: Number(r.turnover_paket_total) || 0,
        masaCiroMP: Number(r.turnover_masa_total) || 0,
        paketSiparisMP: Number(r.orders_paket) || 0,
        nakitMP: nakit,
        digerOdemeMP: digerToplam,
      };
    });

    // Kurye teslimat mutabakatı sadece tek günlük sorgularda anlamlı bir şekil dönüyor —
    // aralık (birden fazla gün) seçiliyse bu kısmı atlıyoruz.
    let kurye: any = null;
    if (start === end) {
      try {
        const courierData = await magicpayGet(`/ops/online-orders/courier-report/daily?date_from=${start}&date_to=${end}&branch_id=${MAGICPAY_BRANCH_ID}`);
        kurye = {
          toplamTeslimat: (courierData?.couriers || []).reduce((s: number, k: any) => s + (Number(k.order_count) || 0), 0),
          kuryeler: (courierData?.couriers || []).map((k: any) => ({
            isim: k.courier_name,
            teslimat: Number(k.order_count) || 0,
            tutar: Number(k.total_amount) || 0,
            tahsilat: Number(k.total_collect) || 0,
            paraUstu: Number(k.total_change) || 0,
            iadeGerekenTutar: Number(k.must_return_to_kebo) || 0,
          })),
        };
      } catch {
        kurye = null; // kurye raporu opsiyonel — hata olsa da genel karşılaştırma çalışsın
      }
    }

    return NextResponse.json({ gunler, kurye });
  } catch (error: any) {
    console.error("MagicPay karşılaştırma hatası:", error);
    return NextResponse.json({ error: error?.message || "Sunucu hatası." }, { status: 502 });
  }
}
