"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rolCoz, TAM_YETKILI, MUDUR, type Rol } from "@/lib/yetki";

export interface YetkiDurumu {
  yukleniyor: boolean;
  email: string;
  /** "murat@kebo.com" → "murat" */
  kullaniciAdi: string;
  rol: Rol | null;
  tamYetkili: boolean;
  mudur: boolean;
}

let onbellek: Omit<YetkiDurumu, "yukleniyor"> | null = null;

/** Giriş yapan kullanıcının rolünü `profiles` tablosundan okur. */
export function useYetki(): YetkiDurumu {
  const [durum, setDurum] = useState<YetkiDurumu>(() =>
    onbellek ? { ...onbellek, yukleniyor: false } : { yukleniyor: true, email: "", kullaniciAdi: "", rol: null, tamYetkili: false, mudur: false });

  useEffect(() => {
    let iptal = false;
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!iptal) setDurum({ yukleniyor: false, email: "", kullaniciAdi: "", rol: null, tamYetkili: false, mudur: false });
        return;
      }
      const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const rol = rolCoz(profil?.role) ?? rolCoz(user.app_metadata?.rol);
      const email = user.email || "";
      const yeni = {
        email, kullaniciAdi: email.split("@")[0] || "Bilinmiyor", rol,
        tamYetkili: rol === TAM_YETKILI, mudur: rol === MUDUR,
      };
      onbellek = yeni;
      if (!iptal) setDurum({ ...yeni, yukleniyor: false });
    })();
    return () => { iptal = true; };
  }, []);

  return durum;
}

/** Çıkış yapınca önbelleği temizlemek için. */
export function yetkiOnbelleginiTemizle() { onbellek = null; }
