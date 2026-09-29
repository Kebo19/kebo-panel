// ─── YETKİ SİSTEMİ ──────────────────────────────────────────────────────────
// Roller ve yetkiler Supabase'deki `profiles.role` ve `profiles.yetkiler`
// alanlarından okunur (trigger ile auth app_metadata'ya da kopyalanır).
//   • "Tam Yetkili" → her şey
//   • "Müdür" (arayüzde "Yetkili kullanıcı") → sadece `yetkiler` listesindekiler
//   • "Pasif" → hiçbir erişim yok
// Kullanıcılar Ayarlar > Yetkilendirme sayfasından yönetilir.
// Asıl koruma veritabanındaki RLS kurallarıdır (public.kebo_izin); buradaki
// kontroller arayüzü ve sayfa yönlendirmelerini düzenler.

export type Rol = "Tam Yetkili" | "Müdür" | "Pasif";

export const TAM_YETKILI: Rol = "Tam Yetkili";
export const MUDUR: Rol = "Müdür";
export const PASIF: Rol = "Pasif";

export const ROLLER: { deger: Rol; etiket: string; aciklama: string }[] = [
  { deger: TAM_YETKILI, etiket: "Tam Yetkili", aciklama: "Her şeye erişir, kullanıcıları yönetir." },
  { deger: MUDUR, etiket: "Yetkili kullanıcı", aciklama: "Sadece işaretlenen alanlara erişir." },
  { deger: PASIF, etiket: "Pasif", aciklama: "Giriş yapamaz, hiçbir veriye erişemez." },
];

export function rolEtiketi(rol: Rol | null | undefined): string {
  return ROLLER.find(r => r.deger === rol)?.etiket ?? "Rol yok";
}

export type YetkiAnahtari =
  | "anasayfa" | "rapor_gir" | "rapor_duzenle" | "rapor_analiz"
  | "kasa" | "cari" | "kar_zarar"
  | "stok" | "recete"
  | "personel" | "personel_hassas" | "puantaj" | "puantaj_duzenle"
  | "yonetim";

export type YetkiGrubu = "Günlük işler" | "Finans" | "Stok & Maliyet" | "Personel" | "Yönetim";

export const YETKI_GRUPLARI: YetkiGrubu[] = ["Günlük işler", "Finans", "Stok & Maliyet", "Personel", "Yönetim"];

export interface YetkiTanimi {
  anahtar: YetkiAnahtari;
  etiket: string;
  aciklama: string;
  grup: YetkiGrubu;
  /** Bu yetkiyle açılan sayfalar (yol önekleri). */
  sayfalar: string[];
}

/** Tek kaynak: tüm yetki anahtarları. Veritabanındaki kullanici_yetki_guncelle ile aynı liste. */
export const YETKILER: YetkiTanimi[] = [
  { anahtar: "anasayfa", etiket: "Anasayfa özeti", aciklama: "Ciro, kasa ve fatura özet kartları", grup: "Günlük işler", sayfalar: ["/"] },
  { anahtar: "rapor_gir", etiket: "Kasa Raporu girme", aciklama: "Günlük kasa raporu girme", grup: "Günlük işler", sayfalar: ["/raporlar"] },
  { anahtar: "rapor_duzenle", etiket: "Rapor düzenleme / onay", aciklama: "Girilmiş raporu doğrudan düzenleme, silme ve değişiklik taleplerini onaylama", grup: "Günlük işler", sayfalar: [] },
  { anahtar: "rapor_analiz", etiket: "Rapor Analizi", aciklama: "Dönemsel satış ve platform analizleri", grup: "Günlük işler", sayfalar: ["/rapor-analiz"] },
  { anahtar: "kasa", etiket: "Kasa", aciklama: "Kasa hareketleri, sabit giderler, banka ekstresi", grup: "Finans", sayfalar: ["/kasa"] },
  { anahtar: "cari", etiket: "Cariler & Faturalar", aciklama: "Tedarikçiler, faturalar, ödemeler; irsaliyeden fatura oluşturma", grup: "Finans", sayfalar: ["/cariler", "/faturalar"] },
  { anahtar: "kar_zarar", etiket: "Kâr / Zarar", aciklama: "Aylık kâr/zarar ve nakit akışı", grup: "Finans", sayfalar: ["/kar-zarar"] },
  { anahtar: "stok", etiket: "Stok & İrsaliye", aciklama: "Stok listesi, ürün kartı, irsaliye girişi", grup: "Stok & Maliyet", sayfalar: ["/stok"] },
  { anahtar: "recete", etiket: "Reçete & Maliyet", aciklama: "Reçeteler ve ürün satışları (food cost için ayrıca Cari veya Kâr/Zarar gerekir)", grup: "Stok & Maliyet", sayfalar: ["/stok/recete"] },
  { anahtar: "personel", etiket: "Personel", aciklama: "Personel listesi, kartı, avans ve kesinti", grup: "Personel", sayfalar: ["/personel"] },
  { anahtar: "personel_hassas", etiket: "TC kimlik & IBAN", aciklama: "Personelin TC kimlik ve IBAN bilgisini görme/düzenleme", grup: "Personel", sayfalar: [] },
  { anahtar: "puantaj", etiket: "Puantaj görme", aciklama: "Aylık puantaj tablosunu görme", grup: "Personel", sayfalar: ["/puantaj"] },
  { anahtar: "puantaj_duzenle", etiket: "Puantaj düzenleme", aciklama: "Puantaj tablosunda hücre düzeltme", grup: "Personel", sayfalar: [] },
  { anahtar: "yonetim", etiket: "İşlem geçmişi & bildirimler", aciklama: "İşlem geçmişi, sorun bildirimleri, hata kayıtları", grup: "Yönetim", sayfalar: ["/ayarlar/gecmis", "/ayarlar/bildirimler"] },
];

export const YETKI_ANAHTARLARI: YetkiAnahtari[] = YETKILER.map(y => y.anahtar);

export function gecerliYetkiMi(s: unknown): s is YetkiAnahtari {
  return typeof s === "string" && (YETKI_ANAHTARLARI as string[]).includes(s);
}

/** Hazır şablonlar (tek tıkla işaretler). */
export const YETKI_SABLONLARI: { ad: string; yetkiler: YetkiAnahtari[] }[] = [
  { ad: "Mağaza Yöneticisi", yetkiler: ["rapor_gir", "rapor_duzenle", "rapor_analiz", "stok", "recete", "personel", "puantaj", "puantaj_duzenle"] },
  { ad: "Kasiyer / Rapor giren", yetkiler: ["rapor_gir"] },
  { ad: "Muhasebe", yetkiler: ["kasa", "cari", "kar_zarar", "rapor_analiz", "puantaj"] },
  { ad: "Temizle", yetkiler: [] },
];

/** Sadece Tam Yetkili'nin açabildiği sayfalar. */
export const TAM_YETKILI_SAYFALARI = ["/ayarlar/yetkiler"];

export function rolCoz(ham: unknown): Rol | null {
  const s = typeof ham === "string" ? ham.trim() : "";
  if (s === TAM_YETKILI) return TAM_YETKILI;
  if (s === MUDUR) return MUDUR;
  if (s === PASIF) return PASIF;
  return null;
}

/** Ham yetki dizisini (jsonb/text[]) temiz anahtar listesine çevirir. */
export function yetkilerCoz(ham: unknown): YetkiAnahtari[] {
  if (!Array.isArray(ham)) return [];
  return [...new Set(ham.filter(gecerliYetkiMi))];
}

/** Kullanıcının bu yetkisi var mı? Tam Yetkili → her şey; Pasif/rolsüz → hiçbir şey. */
export function izinVar(rol: Rol | null | undefined, yetkiler: readonly string[] | null | undefined, anahtar: YetkiAnahtari): boolean {
  if (rol === TAM_YETKILI) return true;
  if (rol !== MUDUR) return false;
  return !!yetkiler && yetkiler.includes(anahtar);
}

const yolEslesir = (yol: string, onek: string) =>
  onek === "/" ? yol === "/" : yol === onek || yol.startsWith(onek + "/");

/**
 * Bir sayfanın gerektirdiği yetki (en uzun önek eşleşmesi).
 * `null` → herkese açık sayfa (/ayarlar, /profil, /yenilikler, bilinmeyen).
 * Tam Yetkili'ye özel sayfalar için "tam_yetkili" döner.
 */
export function sayfaIzni(yol: string): YetkiAnahtari | "tam_yetkili" | null {
  const adaylar: { onek: string; izin: YetkiAnahtari | "tam_yetkili" }[] = [
    ...YETKILER.flatMap(y => y.sayfalar.map(onek => ({ onek, izin: y.anahtar }))),
    ...TAM_YETKILI_SAYFALARI.map(onek => ({ onek, izin: "tam_yetkili" as const })),
  ];
  const eslesen = adaylar.filter(a => yolEslesir(yol, a.onek)).sort((a, b) => b.onek.length - a.onek.length);
  return eslesen[0]?.izin ?? null;
}

/** Kullanıcı bu yola girebilir mi? */
export function sayfaErisimi(rol: Rol | null | undefined, yetkiler: readonly string[] | null | undefined, yol: string): boolean {
  if (rol !== TAM_YETKILI && rol !== MUDUR) return false;
  const gereken = sayfaIzni(yol);
  if (gereken === null) return true;
  if (gereken === "tam_yetkili") return rol === TAM_YETKILI;
  return izinVar(rol, yetkiler, gereken);
}

/** Giriş sonrası / izinsiz sayfada açılacak sayfa. */
export function anaSayfaBul(rol: Rol | null | undefined, yetkiler: readonly string[] | null | undefined): string {
  if (izinVar(rol, yetkiler, "anasayfa")) return "/";
  for (const y of YETKILER) {
    if (y.anahtar === "anasayfa" || !izinVar(rol, yetkiler, y.anahtar)) continue;
    const sayfa = y.sayfalar[0];
    if (sayfa) return sayfa;
  }
  return "/profil";
}

export interface YeniKullaniciGirdisi {
  adSoyad: string;
  email: string;
  sifre: string;
  rol: Rol;
  yetkiler: YetkiAnahtari[];
}

const EPOSTA_DESENI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** /api/kullanici-ekle girdisini doğrular; hata varsa Türkçe mesaj döner. */
export function yeniKullaniciDogrula(ham: unknown): { ok: true; veri: YeniKullaniciGirdisi } | { ok: false; hata: string } {
  const g = (ham && typeof ham === "object" ? ham : {}) as Record<string, unknown>;
  const adSoyad = typeof g.adSoyad === "string" ? g.adSoyad.trim() : "";
  const email = typeof g.email === "string" ? g.email.trim().toLowerCase() : "";
  const sifre = typeof g.sifre === "string" ? g.sifre : "";
  const rol = rolCoz(g.rol);
  if (!adSoyad) return { ok: false, hata: "Ad soyad girin." };
  if (adSoyad.length > 100) return { ok: false, hata: "Ad soyad çok uzun." };
  if (!EPOSTA_DESENI.test(email)) return { ok: false, hata: "Geçerli bir e-posta adresi girin." };
  if (sifre.length < 8) return { ok: false, hata: "Geçici şifre en az 8 karakter olmalı." };
  if (sifre.length > 72) return { ok: false, hata: "Şifre en fazla 72 karakter olabilir." };
  if (!rol) return { ok: false, hata: "Geçersiz rol." };
  if (!Array.isArray(g.yetkiler) || !g.yetkiler.every(gecerliYetkiMi)) return { ok: false, hata: "Geçersiz yetki anahtarı." };
  const yetkiler = rol === MUDUR ? [...new Set(g.yetkiler as YetkiAnahtari[])] : [];
  return { ok: true, veri: { adSoyad, email, sifre, rol, yetkiler } };
}
