/**
 * Kasa açığını bugün çalışan banko personeline eşit paylaştırır (kasa raporu → Kontrol).
 * Kuruşlar kaybolmasın diye artan kuruş ilk kişilere birer birer eklenir; toplam her zaman tutara eşittir.
 */
export function esitPaylas(tutar: number, kisi: number): number[] {
  if (kisi <= 0 || !(tutar > 0)) return [];
  const kurus = Math.round(tutar * 100);
  const pay = Math.floor(kurus / kisi);
  const artan = kurus - pay * kisi;
  return Array.from({ length: kisi }, (_, i) => (pay + (i < artan ? 1 : 0)) / 100);
}

export interface AcikPersoneli { id: string; isim: string; departman?: string | null }

/** Banko departmanındaki ve o gün puantajda "Çalıştı" olan personel. */
export function bankoCalisanlari<T extends AcikPersoneli>(personel: T[], durumu: (id: string) => string): T[] {
  return personel.filter(p => (p.departman || "").trim().toLocaleLowerCase("tr-TR") === "banko" && durumu(p.id) === "calisti");
}
