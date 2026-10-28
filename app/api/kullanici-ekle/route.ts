import { NextResponse } from "next/server";
import { createClient, oturumKontrol } from "@/lib/supabase/server";
import { yeniKullaniciDogrula } from "@/lib/yetki";

// Yeni kullanıcı ekleme (Ayarlar > Kullanıcılar ve yetkiler). Sadece Tam Yetkili.
// Hesap veritabanındaki `kullanici_olustur` fonksiyonuyla açılır (service_role
// anahtarı gerekmez); fonksiyon da ayrıca Tam Yetkili kontrolü yapar.
// Verilen geçici şifre yöneticinin görebilmesi için saklanır; kullanıcı kendi
// şifresini değiştirince silinir.

function hataTurkce(mesaj: string): string {
  const m = mesaj.toLowerCase();
  if (m.includes("rate limit")) return "Çok fazla deneme yapıldı, biraz sonra tekrar deneyin.";
  return mesaj || "Kullanıcı oluşturulamadı.";
}

export async function POST(req: Request) {
  const oturum = await oturumKontrol({ sadeceTamYetkili: true });
  if (!oturum.ok) return oturum.yanit;

  let govde: unknown;
  try { govde = await req.json(); } catch { govde = null; }
  const d = yeniKullaniciDogrula(govde);
  if (!d.ok) return NextResponse.json({ error: d.hata }, { status: 400 });
  const { adSoyad, email, sifre, rol, yetkiler } = d.veri;

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("kullanici_olustur", {
    p_email: email, p_sifre: sifre, p_ad: adSoyad, p_rol: rol, p_yetkiler: yetkiler,
  });
  if (error) return NextResponse.json({ error: hataTurkce(error.message) }, { status: 400 });

  return NextResponse.json({ ok: true, id });
}
