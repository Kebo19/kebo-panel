// ─── KEBO MENÜSÜ ────────────────────────────────────────────────────────────
// Kenar menü, mobil menü, Ctrl+K arama, anasayfa kısayolları ve sayfa başlık
// simgeleri hep bu listeden beslenir: her sayfanın TEK simgesi ve TEK rengi var.
import {
  LayoutDashboard, Wallet, ClipboardList, Users, Settings, BarChart3, Building2,
  FileText, Package, TrendingUp, ChefHat, CalendarCheck, Sparkles, ShieldCheck,
  Bell, History, UserRound, ScanSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { YetkiAnahtari } from "@/lib/yetki";
import { magicpayGorebilirMi } from "@/lib/magicpay";

export interface MenuOgesi {
  name: string;
  icon: LucideIcon;
  href: string;
  /** Sayfanın vurgu rengi (simge kutusu, kısayol kartı) */
  renk: string;
  /** Ctrl+K aramasında görünen kısa açıklama */
  aciklama: string;
  /** Ek arama kelimeleri */
  anahtar?: string;
  /** "ozel_magicpay": sadece lib/magicpay.ts → MAGICPAY_GORENLER (rol/yetki yetmez) */
  izin?: YetkiAnahtari | "tam_yetkili" | "ozel_magicpay";
}

export const MENU: { ust: MenuOgesi[]; finans: MenuOgesi[]; alt: MenuOgesi[]; ayarAlt: MenuOgesi[] } = {
  ust: [
    { name: "Anasayfa", icon: LayoutDashboard, href: "/", izin: "anasayfa", renk: "#d9b866", aciklama: "Günün özeti", anahtar: "ana dashboard özet" },
    { name: "Kasa Raporu", icon: ClipboardList, href: "/raporlar", izin: "rapor_gir", renk: "#f0a94b", aciklama: "Gün sonu girişi", anahtar: "günlük rapor kapanış kurye" },
    { name: "Rapor Analizi", icon: BarChart3, href: "/rapor-analiz", izin: "rapor_analiz", renk: "#a78bfa", aciklama: "Dönem, Roadrunner, POS", anahtar: "analiz roadrunner pos mutabakat dönem" },
    { name: "Kâr / Zarar", icon: TrendingUp, href: "/kar-zarar", izin: "kar_zarar", renk: "#60a5fa", aciklama: "Aylık işletme kârı", anahtar: "kar zarar gelir gider" },
    { name: "Stok", icon: Package, href: "/stok", izin: "stok", renk: "#38bdf8", aciklama: "Ürünler ve sayım", anahtar: "stok ürün sayım depo" },
    { name: "Reçete & Maliyet", icon: ChefHat, href: "/stok/recete", izin: "recete", renk: "#fb923c", aciklama: "Ürün maliyetleri", anahtar: "reçete maliyet" },
    { name: "Personel", icon: Users, href: "/personel", izin: "personel", renk: "#c084fc", aciklama: "Kadro ve belgeler", anahtar: "personel çalışan kadro" },
    { name: "Puantaj", icon: CalendarCheck, href: "/puantaj", izin: "puantaj", renk: "#2dd4bf", aciklama: "Devam takibi", anahtar: "puantaj mesai izin" },
    // Sadece Murat görür (lib/magicpay.ts). Listenin sonunda: anasayfa kısayolları MENU.ust sırasına bağlı.
    { name: "MagicPay Kontrol", icon: ScanSearch, href: "/magicpay", izin: "ozel_magicpay", renk: "#22d3ee", aciklama: "Kasa raporu ↔ MagicPay", anahtar: "magicpay adisyon karşılaştırma kontrol paket kasa" },
  ],
  finans: [
    { name: "Kasa", icon: Wallet, href: "/kasa", izin: "kasa", renk: "#34d399", aciklama: "Bakiye ve işlemler", anahtar: "kasa banka nakit teb vakıfbank enpara bakiye" },
    { name: "Cariler", icon: Building2, href: "/cariler", izin: "cari", renk: "#f87171", aciklama: "Tedarikçi hesapları", anahtar: "cari tedarikçi borç ekstre" },
    { name: "Faturalar", icon: FileText, href: "/faturalar", izin: "cari", renk: "#fb7185", aciklama: "Alış faturaları", anahtar: "fatura irsaliye kdv" },
  ],
  alt: [
    { name: "Ayarlar", icon: Settings, href: "/ayarlar", renk: "#a1a1aa", aciklama: "Hesap ve sistem", anahtar: "ayar" },
    { name: "Yenilikler", icon: Sparkles, href: "/yenilikler", renk: "#d9b866", aciklama: "Son değişiklikler", anahtar: "yeni sürüm" },
  ],
  // Ayarlar'ın alt sayfaları
  ayarAlt: [
    { name: "Yetkilendirme", icon: ShieldCheck, href: "/ayarlar/yetkiler", izin: "tam_yetkili", renk: "#a1a1aa", aciklama: "Kullanıcı yetkileri", anahtar: "yetki kullanıcı rol" },
  ],
};

/** Menüde görünmeyen ama simgesi olan sayfalar (başlık simgesi ve Ctrl+K için) */
export const EK_SAYFALAR: MenuOgesi[] = [
  { name: "Bildirimler", icon: Bell, href: "/ayarlar/bildirimler", renk: "#a1a1aa", aciklama: "Bildirim ayarları" },
  { name: "İşlem Geçmişi", icon: History, href: "/ayarlar/gecmis", renk: "#a1a1aa", aciklama: "Kim ne değiştirdi", anahtar: "log geçmiş kayıt" },
  { name: "Profil", icon: UserRound, href: "/profil", renk: "#a1a1aa", aciklama: "Hesabım" },
];

export const TUM_SAYFALAR: MenuOgesi[] = [...MENU.ust, ...MENU.finans, ...MENU.alt, ...MENU.ayarAlt, ...EK_SAYFALAR];

/** Mobil alt çubuk sırası (ilk 4 izinli + Ayarlar) */
export const MOBIL_SIRA = ["/", "/raporlar", "/stok", "/personel", "/puantaj", "/kasa", "/cariler", "/kar-zarar", "/rapor-analiz"];

/** Adrese en uzun eşleşen sayfa (/stok/recete → Reçete, /stok/12 → Stok) */
export function sayfaBul(pathname: string): MenuOgesi | undefined {
  return TUM_SAYFALAR
    .filter(m => m.href === "/" ? pathname === "/" : pathname === m.href || pathname.startsWith(m.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Menü öğesini bu kullanıcı görebilir mi? (Kenar menü ve Ctrl+K aynı kuralı kullanır.) */
export function menuGorunurMu(
  m: MenuOgesi,
  k: { userId: string; tamYetkili: boolean; izin: (a: YetkiAnahtari) => boolean },
): boolean {
  if (!m.izin) return true;
  if (m.izin === "tam_yetkili") return k.tamYetkili;
  if (m.izin === "ozel_magicpay") return magicpayGorebilirMi(k.userId);
  return k.izin(m.izin);
}

/** Türkçe karakterleri sadeleştirerek arama */
export function sadelestir(s: string): string {
  return s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u");
}
