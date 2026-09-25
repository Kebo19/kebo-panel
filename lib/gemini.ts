// ─── GEMINI ORTAK İSTEK KATMANI ──────────────────────────────────────────────
// Ücretsiz planda her modelin kendi kotası var (örn. gemini-3.6-flash: dakikada
// 5 istek). Eskiden 429/503 alınca aynı model 3 kez tekrar deneniyordu; bu hem
// kotayı boşa harcıyor hem de kullanıcıyı bekletiyordu. Artık:
//   • 429 (kota) / 503 (yoğunluk) → sıradaki yedek modele geçilir,
//   • model bulunamazsa (404) → sıradaki modele geçilir,
//   • "thinking" ayarını desteklemeyen modelde ayar çıkarılıp tekrar denenir,
//   • hepsi dolarsa anlaşılır Türkçe mesaj ve bekleme süresi döner.
// Birincil model GEMINI_MODEL ortam değişkeniyle değiştirilebilir.

const ZAMAN_ASIMI_MS = 40000;
const TOPLAM_SURE_MS = 55000;

export function geminiModelleri(): string[] {
  const birincil = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  return [...new Set([birincil, "gemini-flash-latest", "gemini-flash-lite-latest"])];
}

interface GeminiParca { text?: string; inline_data?: { mime_type: string; data: string } }
export interface GeminiIstegi {
  system?: string;
  contents: { role: "user" | "model"; parts: GeminiParca[] }[];
  maxOutputTokens?: number;
  json?: boolean;
}

export type GeminiSonucu =
  | { ok: true; metin: string; bitisNedeni?: string; model: string }
  | { ok: false; status: number; hata: string };

interface GeminiCevabi {
  error?: { message?: string; status?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
}

function beklemeSaniyesi(mesaj: string): number | null {
  const m = mesaj.match(/retry in ([\d.]+)s/i);
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

export async function geminiIstek(istek: GeminiIstegi): Promise<GeminiSonucu> {
  const anahtar = process.env.GEMINI_API_KEY || "";
  if (!anahtar) {
    return { ok: false, status: 500, hata: "Sunucu yapılandırma hatası: GEMINI_API_KEY tanımlı değil. Vercel > Settings > Environment Variables kısmına ekleyip yeniden deploy edin." };
  }
  const baslangic = Date.now();
  let sonHata = { status: 502, mesaj: "Bilinmeyen hata" };
  let kotaDoldu = false, yogun = false, enKisaBekleme: number | null = null;

  for (const model of geminiModelleri()) {
    let dusunmeAyari = true;
    for (let deneme = 0; deneme < 2; deneme++) {
      const kalan = TOPLAM_SURE_MS - (Date.now() - baslangic);
      if (kalan < 5000) break;
      const controller = new AbortController();
      const zamanlayici = setTimeout(() => controller.abort(), Math.min(ZAMAN_ASIMI_MS, kalan));
      let res: Response;
      let veri: GeminiCevabi = {};
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": anahtar },
          signal: controller.signal,
          body: JSON.stringify({
            ...(istek.system ? { system_instruction: { parts: [{ text: istek.system }] } } : {}),
            contents: istek.contents,
            generationConfig: {
              maxOutputTokens: istek.maxOutputTokens ?? 8192,
              ...(istek.json ? { responseMimeType: "application/json" } : {}),
              ...(dusunmeAyari ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
            },
          }),
        });
        veri = await res.json().catch(() => ({}));
      } catch (e) {
        clearTimeout(zamanlayici);
        if (e instanceof Error && e.name === "AbortError") {
          sonHata = { status: 504, mesaj: "Yapay zekâ zamanında cevap vermedi" };
          break; // sıradaki modele geç
        }
        sonHata = { status: 502, mesaj: "Yapay zekâ servisine ulaşılamadı" };
        break;
      } finally {
        clearTimeout(zamanlayici);
      }

      if (res.ok) {
        const aday = veri.candidates?.[0];
        const metin = aday?.content?.parts?.map(p => p.text || "").join("") || "";
        if (!metin.trim()) {
          const neden = aday?.finishReason || veri.promptFeedback?.blockReason || "bilinmiyor";
          return { ok: false, status: 502, hata: neden === "MAX_TOKENS"
            ? "Cevap yarıda kesildi, tekrar deneyin."
            : `Yapay zekâ boş cevap döndürdü (${neden}), tekrar deneyin.` };
        }
        return { ok: true, metin, bitisNedeni: aday?.finishReason, model };
      }

      const mesaj = veri.error?.message || `HTTP ${res.status}`;
      sonHata = { status: res.status, mesaj };
      if (res.status === 400 && dusunmeAyari && /think/i.test(mesaj)) { dusunmeAyari = false; continue; }
      if (res.status === 429) {
        kotaDoldu = true;
        const b = beklemeSaniyesi(mesaj);
        if (b !== null) enKisaBekleme = enKisaBekleme === null ? b : Math.min(enKisaBekleme, b);
      }
      if (res.status === 503) yogun = true;
      break; // 404 / 429 / 503 / diğer → sıradaki model
    }
  }

  if (kotaDoldu) {
    const sure = enKisaBekleme ? `${enKisaBekleme} saniye` : "1 dakika";
    return { ok: false, status: 429, hata: `Ücretsiz yapay zekâ kotası doldu (dakikada birkaç istek). ${sure} sonra tekrar deneyin.` };
  }
  if (yogun) return { ok: false, status: 503, hata: "Google'ın yapay zekâ servisi şu an çok yoğun. Biraz sonra tekrar deneyin." };
  return { ok: false, status: sonHata.status, hata: `Yapay zekâ hatası: ${sonHata.mesaj}` };
}
