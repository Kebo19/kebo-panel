// Supabase/PostgREST tek istekte en fazla 1000 satır döndürür. Bu yardımcı,
// sorguyu .range(from, to) ile sayfa sayfa çalıştırıp tüm satırları birleştirir.
// Sayfalama kararlı olsun diye sorguda benzersiz bir ikinci sıralama (ör. .order("id")) bulunmalı.

export const SAYFA_BOYUTU = 1000;

export async function hepsiniCek<T>(
  sorguUret: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  sayfa = SAYFA_BOYUTU,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += sayfa) {
    const { data, error } = await sorguUret(from, from + sayfa - 1);
    if (error) {
      const mesaj = typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
      throw new Error(mesaj);
    }
    const parca = data || [];
    out.push(...parca);
    if (parca.length < sayfa) break;
  }
  return out;
}
