// ─── YETKİ SİSTEMİ ──────────────────────────────────────────────────────────
// Roller Supabase'deki `profiles.role` alanından okunur; kodda hiçbir yerde
// e-posta listesi yoktur. Yeni bir kullanıcı (ör. Bekir) eklemek için:
//   1) Supabase → Authentication'da kullanıcıyı oluştur,
//   2) profiles tablosuna aynı id ile satır ekle, role = 'Müdür'.
// Asıl koruma veritabanındaki RLS kurallarıdır; buradaki kontroller sadece
// arayüzü ve sayfa yönlendirmelerini düzenler.

export type Rol = "Tam Yetkili" | "Müdür";

export const TAM_YETKILI: Rol = "Tam Yetkili";
export const MUDUR: Rol = "Müdür";

/** Sadece Tam Yetkili kullanıcıların açabildiği sayfalar. */
export const YONETICI_SAYFALARI = ["/kasa", "/cariler", "/faturalar", "/rapor-analiz"];

/** Müdürün giriş sonrası açılış sayfası (anasayfa yöneticilere özel). */
export const MUDUR_ANA_SAYFA = "/raporlar";

export function rolCoz(ham: unknown): Rol | null {
  const s = typeof ham === "string" ? ham.trim() : "";
  if (s === TAM_YETKILI) return TAM_YETKILI;
  if (s === MUDUR) return MUDUR;
  return null;
}

/** Yol yalnızca Tam Yetkili kullanıcılara mı açık? */
export function yoneticiSayfasiMi(yol: string): boolean {
  if (yol === "/") return true;
  return YONETICI_SAYFALARI.some(s => yol === s || yol.startsWith(s + "/"));
}
