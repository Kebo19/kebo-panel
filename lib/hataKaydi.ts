// ─── HATA KAYDI ─────────────────────────────────────────────────────────────
// Tarayıcıda oluşan beklenmedik hatalar `hata_kayitlari` tablosuna yazılır;
// Tam Yetkili kullanıcı Ayarlar → Sorun bildirimleri sayfasından görür.
// Aynı mesaj 1 dakika içinde tekrar yazılmaz (bir döngüde patlayan hata tabloyu
// doldurmasın). Kayıt sırasında oluşan hatalar sessizce yutulur.

export const MAKS_MESAJ = 500;
export const TEKRAR_SURESI_MS = 60_000;

const sonGonderim = new Map<string, number>();

/** Mesajı tek satıra indirip 500 karakterle sınırlar. */
export function mesajKisalt(ham: unknown): string {
  let s: string;
  if (ham instanceof Error) s = ham.message || ham.name || "Hata";
  else if (typeof ham === "string") s = ham;
  else {
    try { s = JSON.stringify(ham) ?? String(ham); } catch { s = String(ham); }
  }
  s = s.replace(/\s+/g, " ").trim() || "Bilinmeyen hata";
  return s.length > MAKS_MESAJ ? s.slice(0, MAKS_MESAJ - 1) + "…" : s;
}

/**
 * Bu mesaj son 1 dakika içinde gönderildiyse true döner; değilse gönderim
 * zamanını kaydeder ve false döner.
 */
export function yakinZamandaGonderildi(mesaj: string, simdi: number = Date.now()): boolean {
  const onceki = sonGonderim.get(mesaj);
  if (onceki !== undefined && simdi - onceki < TEKRAR_SURESI_MS) return true;
  sonGonderim.set(mesaj, simdi);
  // Bellek şişmesin: eski girdileri temizle.
  if (sonGonderim.size > 200) {
    for (const [k, t] of sonGonderim) if (simdi - t >= TEKRAR_SURESI_MS) sonGonderim.delete(k);
  }
  return false;
}

/** Testler için. */
export function hataSinirlamasiniSifirla() { sonGonderim.clear(); }

/** Hatayı `hata_kayitlari` tablosuna yazar. Asla hata fırlatmaz. */
export async function hataKaydet(mesaj: unknown, detay?: Record<string, unknown> | null): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    const kisa = mesajKisalt(mesaj);
    if (yakinZamandaGonderildi(kisa)) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email || "";
    if (!data.session) return; // giriş yapılmamışsa RLS zaten reddeder
    await supabase.from("hata_kayitlari").insert({
      kullanici: email.split("@")[0] || null,
      sayfa: window.location.pathname + window.location.search,
      mesaj: kisa,
      detay: {
        ...(detay || {}),
        ...(mesaj instanceof Error && mesaj.stack ? { stack: mesaj.stack.slice(0, 2000) } : {}),
        tarayici: navigator.userAgent.slice(0, 300),
      },
    });
  } catch {
    /* hata kaydı başarısız — sessizce yut */
  }
}
