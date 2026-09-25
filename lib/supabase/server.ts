import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { rolCoz, TAM_YETKILI, type Rol } from "@/lib/yetki";

/** Route handler'lar için oturum çerezlerini okuyan Supabase istemcisi. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(liste) {
          try { liste.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Route handler dışında çağrılırsa yok say */ }
        },
      },
    }
  );
}

export type OturumSonucu =
  | { ok: true; userId: string; email: string; rol: Rol }
  | { ok: false; yanit: NextResponse };

/**
 * API route'larının başında çağrılır. Giriş yapılmamışsa 401, rol yetmiyorsa
 * 403 döner. `sadeceTamYetkili` true ise sadece Tam Yetkili kullanıcılar geçer.
 */
export async function oturumKontrol(opts: { sadeceTamYetkili?: boolean } = {}): Promise<OturumSonucu> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, yanit: NextResponse.json({ error: "Oturum bulunamadı, lütfen tekrar giriş yapın." }, { status: 401 }) };
  }
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const rol = rolCoz(profil?.role);
  if (!rol) {
    return { ok: false, yanit: NextResponse.json({ error: "Bu hesaba tanımlı bir rol yok." }, { status: 403 }) };
  }
  if (opts.sadeceTamYetkili && rol !== TAM_YETKILI) {
    return { ok: false, yanit: NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, email: user.email || "", rol };
}
