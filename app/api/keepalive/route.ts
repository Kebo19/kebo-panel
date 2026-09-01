import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Bu endpoint Vercel Cron tarafından günlük olarak tetiklenir (bkz. vercel.json).
// Amacı, Supabase projesinin uzun süre işlem görmediği için duraklatılmasını
// (free plan cold start / pause) önlemektir. Böylece kullanıcılar panele
// giriş yaptığında Supabase her zaman "uyanık" olur ve middleware
// zaman aşımı (504 MIDDLEWARE_INVOCATION_TIMEOUT) ya da eksik veri (personel
// listesi, kullanıcı adları vb. gelmemesi) yaşanmaz.
export async function GET(request: Request) {
  // Vercel dışından rastgele çağrılmasını engellemek için CRON_SECRET
  // kontrolü. Vercel bu değeri cron isteklerine otomatik ekler; projene
  // env variable olarak CRON_SECRET eklersen bu koruma aktif olur.
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Hafif bir sorgu ile Supabase'i aktif tutuyoruz. RLS nedeniyle satır
    // dönmeyebilir, önemli olan bağlantının kurulup projeyi "uyandırması".
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      console.error("[keepalive] Supabase sorgu hatası:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[keepalive] Beklenmeyen hata:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
