"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rolCoz, yetkilerCoz, izinVar, TAM_YETKILI, MUDUR, type Rol, type YetkiAnahtari } from "@/lib/yetki";

interface YetkiVerisi {
  /** auth kullanıcı id'si */
  userId: string;
  email: string;
  /** "murat@kebo.com" → "murat" */
  kullaniciAdi: string;
  /** profiles.full_name (yoksa kullaniciAdi) */
  adSoyad: string;
  rol: Rol | null;
  /** Tam Yetkili için boş olabilir; kontrol için `izin()` kullanın. */
  yetkiler: YetkiAnahtari[];
  tamYetkili: boolean;
  /** Geriye uyumluluk: rol "Müdür" (Yetkili kullanıcı) mü? */
  mudur: boolean;
}

export interface YetkiDurumu extends YetkiVerisi {
  yukleniyor: boolean;
  /** Kullanıcının bu yetkisi var mı? Tam Yetkili → her zaman true, Pasif → false. */
  izin: (anahtar: YetkiAnahtari) => boolean;
}

const BOS: YetkiVerisi = { userId: "", email: "", kullaniciAdi: "", adSoyad: "", rol: null, yetkiler: [], tamYetkili: false, mudur: false };

let onbellek: YetkiVerisi | null = null;

function durumYap(v: YetkiVerisi, yukleniyor: boolean): YetkiDurumu {
  return { ...v, yukleniyor, izin: (a) => izinVar(v.rol, v.yetkiler, a) };
}

/** Giriş yapan kullanıcının rolünü ve yetkilerini `profiles` tablosundan okur. */
export function useYetki(): YetkiDurumu {
  const [durum, setDurum] = useState<YetkiDurumu>(() =>
    onbellek ? durumYap(onbellek, false) : durumYap(BOS, true));

  useEffect(() => {
    let iptal = false;
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!iptal) setDurum(durumYap(BOS, false));
        return;
      }
      const { data: profil } = await supabase.from("profiles").select("role, yetkiler, full_name").eq("id", user.id).maybeSingle();
      const rol = profil ? rolCoz(profil.role) : rolCoz(user.app_metadata?.rol);
      const yetkiler = yetkilerCoz(profil ? profil.yetkiler : user.app_metadata?.yetkiler);
      const email = user.email || "";
      const kullaniciAdi = email.split("@")[0] || "Bilinmiyor";
      const yeni: YetkiVerisi = {
        userId: user.id, email, kullaniciAdi, adSoyad: (profil?.full_name as string | null)?.trim() || kullaniciAdi,
        rol, yetkiler,
        tamYetkili: rol === TAM_YETKILI, mudur: rol === MUDUR,
      };
      onbellek = yeni;
      if (!iptal) setDurum(durumYap(yeni, false));
    })();
    return () => { iptal = true; };
  }, []);

  return durum;
}

/** Çıkış yapınca önbelleği temizlemek için. */
export function yetkiOnbelleginiTemizle() { onbellek = null; }
