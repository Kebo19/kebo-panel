// ─── KAĞIT RAPOR TARAMA SONUCUNU DÜZELTME ───────────────────────────────────
// El yazısı formlarda binlik ayracı nokta ile yazılıyor ("3.285", "5.002").
// Model bunu bazen 3.285 (üç virgül iki yüz seksen beş) sayısı olarak döndürüyor.
// Para tutarlarında 3 ondalık hane olamayacağı için bu durum güvenle 3285'e
// çevrilir. Metin olarak gelen sayılar da Türkçe biçime göre okunur.

const PARA_ALANLARI = new Set(["tutar", "indirim", "nakit", "pos", "edenred", "metropol"]);
const ADET_ALANLARI = new Set(["paket"]);

/** "5.002" → 5002, "1.234,50" → 1234.5, "12,5" → 12.5, 3.285 → 3285 */
export function paraOku(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") {
    if (!isFinite(v) || v <= 0) return 0;
    // 3 ondalık haneli tutar = binlik ayraç yanlış okunmuş
    const binli = Math.round(v * 1000);
    if (Math.abs(v * 1000 - binli) < 1e-6 && binli % 10 !== 0 && v < 1000) return binli;
    return Math.round(v * 100) / 100;
  }
  let s = String(v).replace(/[₺\sTLtl]/g, "");
  if (!s) return 0;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = parseFloat(s.replace(/[^\d.]/g, ""));
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export function adetOku(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Tarama JSON'undaki tüm para/adet alanlarını düzeltir (iç içe nesne ve dizilerde). */
export function taramaDuzelt<T>(veri: T): T {
  const gez = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(gez);
    if (x && typeof x === "object") {
      const cikti: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (PARA_ALANLARI.has(k) && (typeof v === "number" || typeof v === "string" || v === null)) cikti[k] = paraOku(v);
        else if (ADET_ALANLARI.has(k) && (typeof v === "number" || typeof v === "string" || v === null)) cikti[k] = adetOku(v);
        else cikti[k] = gez(v);
      }
      return cikti;
    }
    return x;
  };
  return gez(veri) as T;
}

/** Tarih geçerli bir YYYY-AA-GG değilse null (formda gün/ay boş bırakılmış olabilir). */
export function taramaTarihi(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T12:00:00Z");
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  const yil = d.getUTCFullYear();
  return yil >= 2024 && yil <= 2035 ? v : null;
}

// ─── Belirsiz alanlar ───────────────────────────────────────────────────────
// El yazısı formda kuruş neredeyse hiç yazılmaz; kuruşlu okunan tutar büyük
// ihtimalle yanlış okunmuştur ("301" → 30.1). Bu alanlar kontrol listesine eklenir.
export function kurusluAlanlar(veri: unknown, yol = ""): string[] {
  if (Array.isArray(veri)) return veri.flatMap((x, i) => kurusluAlanlar(x, `${yol}.${i}`));
  if (veri && typeof veri === "object") {
    return Object.entries(veri as Record<string, unknown>).flatMap(([k, v]) => {
      const y = yol ? `${yol}.${k}` : k;
      if (PARA_ALANLARI.has(k) && typeof v === "number" && v > 0 && Math.round(v) !== v) return [y];
      return kurusluAlanlar(v, y);
    });
  }
  return [];
}

const ETIKET: Record<string, string> = {
  online: "Online", kapida: "Kapıda", kebo: "KEBO", cnf: "Chick'n Fride",
  ys: "Yemeksepeti", trendyol: "Trendyol", migros: "Migros", migrosYemek: "Migros Yemek", alo: "Alo Paket",
  tutar: "Tutar", paket: "Paket", indirim: "İndirim", kasa: "Kasa", nakit: "Nakit", pos: "POS",
  edenred: "Edenred", metropol: "Metropol", giderler: "Gider", avanslar: "Avans", kesintiler: "Kesinti",
  iadeler: "İade", kuryeSabit: "Sabit kurye", kuryeHavuz: "Havuz kurye", isim: "İsim", personel: "Personel",
  aciklama: "Açıklama", tarih: "Tarih", giren: "Giren", notlar: "Notlar",
};

/** "online.kebo.ys.indirim" → "Online › KEBO › Yemeksepeti › İndirim" */
export function alanEtiketi(yol: string): string {
  return yol.split(".").map(p => /^\d+$/.test(p) ? `${Number(p) + 1}. satır` : (ETIKET[p] || p)).join(" › ");
}
