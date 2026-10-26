// ─── FATURA ARAMA ──────────────────────────────────────────────────────────────
// Faturalar sayfası ve cari detayındaki arama kutusu. Aranabilenler: fatura no, cari ünvanı, açıklama,
// tutar ("156.201,18", "156201", "156201.18"), tarih ("12.10.2026", "12.10", "2026-10").
// Birden fazla kelime yazılırsa hepsi eşleşmeli ("kebo 12.10" → Kebo'nun 12 Ekim faturaları).
// Türkçe harf ve büyük/küçük harf farkı önemsenmez ("cicek" = "ÇİÇEK").
import { normalize } from "@/lib/ekstre";

export interface AranabilirFatura {
  fatura_no?: string | null; cari_unvan?: string | null; aciklama?: string | null;
  fatura_tarihi?: string | null; vade_tarihi?: string | null;
  toplam_tutar?: number | string | null; tutar?: number | string | null;
}

const trTarih = (t?: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : "");
/** Tutarın aranabilir biçimleri: "156201.18", "156201,18", "156.201,18" */
function tutarMetinleri(v: number | string | null | undefined): string[] {
  const n = Number(v);
  if (!v && v !== 0 || !Number.isFinite(n)) return [];
  const iki = n.toFixed(2);
  const tr = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return [iki, iki.replace(".", ","), tr];
}

/** Bir faturanın aranacak tüm metni (normalize edilmiş) */
export function faturaArananMetin(f: AranabilirFatura): string {
  return normalize([
    f.fatura_no, f.cari_unvan, f.aciklama,
    f.fatura_tarihi, trTarih(f.fatura_tarihi), f.vade_tarihi, trTarih(f.vade_tarihi),
    ...tutarMetinleri(f.toplam_tutar), ...tutarMetinleri(f.tutar),
  ].filter(Boolean).join(" | "));
}

/** Arama metnini kelimelere böler; boşsa null (filtre yok) */
export function aramaKelimeleri(q: string): string[] | null {
  const k = normalize(q).split(" ").filter(Boolean);
  return k.length ? k : null;
}

export function faturaEslesir(f: AranabilirFatura, kelimeler: string[] | null): boolean {
  if (!kelimeler) return true;
  const metin = faturaArananMetin(f);
  return kelimeler.every(k => metin.includes(k));
}
