import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { rolCoz, yetkilerCoz, izinVar, TAM_YETKILI, MUDUR, type Rol, type YetkiAnahtari } from "@/lib/yetki";

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
  | { ok: true; userId: string; email: string; rol: Rol; yetkiler: YetkiAnahtari[] }
  | { ok: false; yanit: NextResponse };

/**
 * API route'larının başında çağrılır. Giriş yapılmamışsa 401, rol yetmiyorsa
 * 403 döner. `sadeceTamYetkili` true ise sadece Tam Yetkili kullanıcılar geçer;
 * `izin` verilirse kullanıcının o yetkisi olmalı. Pasif hesaplar her zaman 403.
 */
export async function oturumKontrol(opts: { sadeceTamYetkili?: boolean; izin?: YetkiAnahtari } = {}): Promise<OturumSonucu> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, yanit: NextResponse.json({ error: "Oturum bulunamadı, lütfen tekrar giriş yapın." }, { status: 401 }) };
  }
  const { data: profil } = await supabase.from("profiles").select("role, yetkiler").eq("id", user.id).maybeSingle();
  const rol = rolCoz(profil?.role);
  const yetkiler = yetkilerCoz(profil?.yetkiler);
  if (rol !== TAM_YETKILI && rol !== MUDUR) {
    return { ok: false, yanit: NextResponse.json({ error: "Bu hesap pasif ya da tanımlı bir rolü yok." }, { status: 403 }) };
  }
  if ((opts.sadeceTamYetkili && rol !== TAM_YETKILI) || (opts.izin && !izinVar(rol, yetkiler, opts.izin))) {
    return { ok: false, yanit: NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, email: user.email || "", rol, yetkiler };
}
