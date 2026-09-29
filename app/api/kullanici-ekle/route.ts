import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { oturumKontrol } from "@/lib/supabase/server";
import { yeniKullaniciDogrula } from "@/lib/yetki";

// Yeni kullanıcı ekleme (Ayarlar > Yetkilendirme). Sadece Tam Yetkili.
// Supabase Auth'ta kullanıcı oluşturmak service_role anahtarı ister; bu anahtar
// SADECE sunucuda okunur, istemciye / loga / cevaba asla konmaz.

const ANAHTAR_YOK_MESAJI =
  "Kullanıcı eklemek için Vercel > Settings > Environment Variables'a SUPABASE_SERVICE_ROLE_KEY eklenmeli " +
  "(Supabase > Project Settings > API Keys > service_role / secret). Eklenene kadar kullanıcıyı " +
  "Supabase > Authentication'dan ekleyip bu sayfada yetkisini verebilirsiniz.";

function hataTurkce(mesaj: string): string {
  const m = mesaj.toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) return "Bu e-posta adresi zaten kayıtlı.";
  if (m.includes("password")) return "Şifre kabul edilmedi (daha uzun / güçlü bir şifre deneyin).";
  if (m.includes("email") && m.includes("invalid")) return "E-posta adresi geçersiz.";
  if (m.includes("rate limit")) return "Çok fazla deneme yapıldı, biraz sonra tekrar deneyin.";
  return "Kullanıcı oluşturulamadı: " + mesaj;
}

export async function POST(req: Request) {
  const oturum = await oturumKontrol({ sadeceTamYetkili: true });
  if (!oturum.ok) return oturum.yanit;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servisAnahtari = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servisAnahtari) {
    return NextResponse.json({ error: ANAHTAR_YOK_MESAJI, anahtarYok: true }, { status: 501 });
  }

  let govde: unknown;
  try { govde = await req.json(); } catch { govde = null; }
  const d = yeniKullaniciDogrula(govde);
  if (!d.ok) return NextResponse.json({ error: d.hata }, { status: 400 });
  const { adSoyad, email, sifre, rol, yetkiler } = d.veri;

  const admin = createAdminClient(url, servisAnahtari, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: olusan, error: authHata } = await admin.auth.admin.createUser({
    email, password: sifre, email_confirm: true, user_metadata: { full_name: adSoyad },
  });
  if (authHata || !olusan?.user) {
    return NextResponse.json({ error: hataTurkce(authHata?.message || "bilinmeyen hata") }, { status: 400 });
  }

  const { error: profilHata } = await admin.from("profiles").upsert({
    id: olusan.user.id, email, full_name: adSoyad, role: rol, yetkiler,
  }, { onConflict: "id" });
  if (profilHata) {
    // Profil yazılamadıysa yarım kalmış hesabı geri al.
    await admin.auth.admin.deleteUser(olusan.user.id).catch(() => undefined);
    return NextResponse.json({ error: "Kullanıcının profil kaydı oluşturulamadı: " + profilHata.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: olusan.user.id });
}
