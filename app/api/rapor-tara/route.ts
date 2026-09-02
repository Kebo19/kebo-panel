import { NextResponse } from "next/server";

// "Fişten Doldur" özelliği: kullanıcı KEBO kağıt kasa raporunun fotoğrafını
// yükler, Gemini görseli okuyup dijital forma birebir eşlenen JSON döndürür.
// Gemini API'nin ücretsiz katmanı (Flash modeli) kullanılıyor — Anthropic API
// kredisi gerektirmez. Anahtar sadece burada, sunucu tarafında kullanılır.
//
// MODEL NOTU (02.09.2026): "gemini-2.5-flash" Google tarafından yeni
// API anahtarlarına artık açılmıyor ("no longer available to new users",
// resmi kaldırma tarihinden önce yaşanan bilinen bir durum). Google'ın
// hata mesajının önerdiği "gemini-3.6-flash" modeline geçildi — bu model
// de ücretsiz katmanda, görsel girişi destekliyor ve aktif geliştirilen
// nesil (kaldırma tarihi planlanmamış). Tek fark: bu model ailesinde
// "thinking" tamamen kapatılamıyor (2.5-flash'taki thinkingBudget:0 gibi),
// sadece "minimal" seviyeye indirilebiliyor — bu yüzden çıktı token
// limitini yükselttik (bkz. MAX_OUTPUT_TOKENS).

const SISTEM_PROMPT = `Sen KEBO ERP için bir kağıt rapor okuma asistanısın. Sana KEBO'nun standart
kağıt "Günlük Kasa Kapanış Formu" fotoğrafı verilecek. Bu formun sabit bir düzeni var:

SAYFA 1:
- Üstte Tarih (GG/AA/YYYY) ve Giren (Ad Soyad)
- "ONLINE SATIŞLAR" bölümü, iki alt-marka: KEBO ve CHICK'N FRIDE
  Her markada 3 satır: Yemeksepeti (Tutar, Paket Sayısı, İndirim), Trendyol (Tutar, Paket Sayısı, İndirim),
  Migros / Migros Yemek (Tutar, Paket Sayısı — indirim yok)
- "KAPIDA ÖDEME" bölümü, aynı iki marka, her markada 4 satır: Yemeksepeti, Trendyol (indirimli),
  Migros Yemek, Alo Paket (indirimsiz)
- "KASA" bölümü: Nakit, Pos, Edenred, Metropol, Kasa Toplamı

SAYFA 2:
- "GİDERLER" tablosu: serbest satırlar, Açıklama + Tutar
- "PERSONEL AVANS" tablosu: Personel Adı, Ne alındı/sebep, Tutar
- "PERSONEL KESİNTİSİ" tablosu: Personel Adı, Sebep, Tutar
- "İPTAL - İADE FİŞLERİ" tablosu: Açıklama, Tutar
- "KURYE (ROADRUNNER)" — iki alt tablo:
  - Sabit Kurye: "Kurye 1: ____" ve "Kurye 2: ____" satırları (isim elle yazılmış olabilir), her biri Nakit, Kredi/Pos, Paket Sayısı
  - Havuz Kurye: serbest satırlar, Kurye/Firma Adı, Nakit, Kredi/Pos, Paket Sayısı
- "NOTLAR" serbest metin alanı

GÖREV: Fotoğraftaki el yazısı rakamları ve metinleri oku, aşağıdaki JSON şemasına birebir uyacak
şekilde çıktı ver. SADECE JSON döndür, başka hiçbir açıklama, markdown backtick veya metin ekleme.

KURALLAR:
- Boş bırakılmış (hiç yazı olmayan) hücreler için 0 (sayısal alanlarda) veya "" (metin alanlarında) yaz.
- Ondalık ayracı olarak virgül kullanılmış olabilir (örn. "1.234,50") — bunu 1234.5 gibi noktalı sayıya çevir.
- Bir rakam okunuyor ama el yazısı belirsizse (silik, üstü çizili, yorumlanması zor), YİNE DE en iyi tahminini
  JSON'a yaz, AMA o alanın dot-path anahtarını mutlaka "belirsiz_alanlar" listesine ekle.
- Bir hücre TAMAMEN boşsa ve doldurulması bekleniyorsa (örn. Kasa bölümündeki Nakit hücresi boşsa),
  değeri 0 yap ve yine "belirsiz_alanlar" listesine ekleme — gerçekten boşsa bu normal, kullanıcı o günü doldurmamış olabilir.
  Sadece OKUNAMAYAN/BELİRSİZ olanları belirsiz_alanlar'a ekle, boş olanları değil.
- Tarihi GG.AA.YYYY olarak okuyup YYYY-AA-GG (ISO) formatına çevir. 2 haneli yıl varsa 20xx kabul et.
- Kurye/Personel isimleri tam olarak el yazısındaki gibi, ilk harfi büyük şekilde yaz.

JSON ŞEMASI (tam olarak bu anahtarları kullan, eksik bırakma):
{
  "tarih": "YYYY-AA-GG" | null,
  "giren": "string",
  "online": {
    "kebo": {
      "ys": {"tutar": number, "paket": number, "indirim": number},
      "trendyol": {"tutar": number, "paket": number, "indirim": number},
      "migros": {"tutar": number, "paket": number}
    },
    "cnf": {
      "ys": {"tutar": number, "paket": number, "indirim": number},
      "trendyol": {"tutar": number, "paket": number, "indirim": number},
      "migrosYemek": {"tutar": number, "paket": number}
    }
  },
  "kapida": {
    "kebo": {
      "ys": {"tutar": number, "paket": number, "indirim": number},
      "trendyol": {"tutar": number, "paket": number, "indirim": number},
      "migrosYemek": {"tutar": number, "paket": number},
      "alo": {"tutar": number, "paket": number}
    },
    "cnf": {
      "ys": {"tutar": number, "paket": number, "indirim": number},
      "trendyol": {"tutar": number, "paket": number, "indirim": number},
      "migrosYemek": {"tutar": number, "paket": number},
      "alo": {"tutar": number, "paket": number}
    }
  },
  "kasa": {"nakit": number, "pos": number, "edenred": number, "metropol": number},
  "giderler": [{"aciklama": "string", "tutar": number}],
  "avanslar": [{"personel": "string", "aciklama": "string", "tutar": number}],
  "kesintiler": [{"personel": "string", "aciklama": "string", "tutar": number}],
  "iadeler": [{"aciklama": "string", "tutar": number}],
  "kuryeSabit": [{"isim": "string", "nakit": number, "pos": number, "paket": number}],
  "kuryeHavuz": [{"isim": "string", "nakit": number, "pos": number, "paket": number}],
  "notlar": "string",
  "belirsiz_alanlar": ["dot.path.gibi.anahtarlar"]
}

Boş satırları (giderler, avanslar, kesintiler, iadeler, kuryeHavuz) dizilere hiç ekleme —
sadece gerçekten bir şey yazılmış satırları diziye koy.`;

// Gemini'nin görseli okuyup JSON üretmesi için makul bir üst sınır. Bu
// görevde tüm satırlar (giderler, avanslar, kuryeler vb.) tek bir günlük
// forma ait olduğundan bu limit rahatlıkla yeterli, ama modelin yanıtı
// yarıda kesip boş/eksik JSON dönmesini engellemek için açıkça belirtiyoruz.
const MAX_OUTPUT_TOKENS = 16384;
// Gemini API bazen (özellikle soğuk başlangıçta) uzun sürebiliyor; kullanıcıyı
// süresiz bekletmemek için kendi zaman aşımımızı koyuyoruz.
const GEMINI_TIMEOUT_MS = 45000;
// "This model is currently experiencing high demand" (503/UNAVAILABLE) ve
// hız sınırı (429) hataları geçici — Google da "genelde kısa sürede
// düzeliyor, tekrar deneyin" diyor. Kullanıcıyı hemen hatayla karşılamak
// yerine kısa aralıklarla birkaç kez otomatik deniyoruz.
const MAX_DENEME = 3;
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

const gemeniIstegiGonder = (apiKey: string, imageBase64: string, mediaType: string) => {
  const controller = new AbortController();
  const zamanAsimi = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SISTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: mediaType || "image/jpeg", data: imageBase64 } },
              { text: "Bu KEBO kağıt kasa raporunu oku ve yalnızca JSON döndür." },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          // ÖNEMLİ: Flash modelleri varsayılan olarak "thinking" (iç
          // muhakeme) modunda çalışıyor ve bu iç muhakeme de aynı token
          // bütçesini paylaşıyor. Basit bir OCR + şemaya JSON basma
          // görevinde modelin bütçenin büyük kısmını "düşünmeye"
          // harcayıp görünür cevabı boş/eksik bırakması (finishReason:
          // MAX_TOKENS) bilinen ve sık karşılaşılan bir davranış.
          // gemini-3.6-flash'ta (2.5-flash'ın aksine) thinking tamamen
          // kapatılamıyor, o yüzden "minimal" seviyeye çekip yukarıdaki
          // MAX_OUTPUT_TOKENS'ı yükselterek dengeliyoruz.
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      }),
    }
  ).finally(() => clearTimeout(zamanAsimi));
};

export async function POST(req: Request) {
  try {
    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "Görsel bulunamadı" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

    if (!apiKey) {
      // En sık karşılaşılan "API hatası" nedeni budur: Vercel proje
      // ayarlarında GEMINI_API_KEY (ya da NEXT_PUBLIC_GEMINI_API_KEY) tanımlı
      // değil veya yalnızca bazı ortamlarda (Production/Preview) eklenmiş.
      console.error("[rapor-tara] GEMINI_API_KEY / NEXT_PUBLIC_GEMINI_API_KEY tanımlı değil");
      return NextResponse.json(
        {
          error:
            "Sunucu yapılandırma hatası: GEMINI_API_KEY tanımlı değil. Vercel > Project Settings > Environment Variables kısmından ekleyip yeniden deploy edin.",
        },
        { status: 500 }
      );
    }

    let response: Response | undefined;
    let data: any;
    for (let deneme = 1; deneme <= MAX_DENEME; deneme++) {
      response = await gemeniIstegiGonder(apiKey, imageBase64, mediaType);

      try {
        data = await response.json();
      } catch {
        console.error("[rapor-tara] Gemini'den geçerli JSON gelmedi, HTTP", response.status);
        return NextResponse.json(
          { error: `Gemini API beklenmedik bir cevap döndürdü (HTTP ${response.status}).` },
          { status: 502 }
        );
      }

      const gecici = response.status === 503 || response.status === 429;
      if (gecici && deneme < MAX_DENEME) {
        console.warn(`[rapor-tara] Geçici Gemini hatası (HTTP ${response.status}), ${deneme}. deneme, tekrar denenecek`);
        await bekle(1200 * deneme);
        continue;
      }
      break;
    }

    if (!response!.ok) {
      console.error("Rapor tarama API hatası (Gemini):", JSON.stringify(data));
      const detay = data?.error?.message || "Bilinmeyen hata";
      return NextResponse.json(
        { error: `Gemini API hatası: ${detay}`, details: data },
        { status: response!.status }
      );
    }

    const aday = data.candidates?.[0];
    const bitisNedeni = aday?.finishReason;
    const metin = aday?.content?.parts?.map((p: any) => p.text || "").join("") || "";

    if (!metin.trim()) {
      console.error("[rapor-tara] Boş içerik döndü. finishReason:", bitisNedeni, JSON.stringify(data));
      if (bitisNedeni === "MAX_TOKENS") {
        return NextResponse.json(
          {
            error:
              "Model yanıtı token sınırına takılıp yarıda kaldı. Lütfen fotoğrafı tekrar yükleyin; sorun devam ederse fotoğrafı biraz daha net/küçük çekmeyi deneyin.",
          },
          { status: 502 }
        );
      }
      if (bitisNedeni === "SAFETY" || bitisNedeni === "PROHIBITED_CONTENT") {
        return NextResponse.json(
          { error: "Model bu görseli güvenlik filtresi nedeniyle işleyemedi, farklı bir fotoğrafla deneyin." },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: "Model boş cevap döndürdü, lütfen tekrar deneyin." },
        { status: 502 }
      );
    }

    const temiz = metin.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();

    let ayrisik;
    try {
      ayrisik = JSON.parse(temiz);
    } catch (e) {
      console.error("JSON parse hatası:", temiz);
      return NextResponse.json({ error: "Model geçerli JSON döndürmedi", raw: metin }, { status: 502 });
    }

    return NextResponse.json(ayrisik);
  } catch (error: any) {
    console.error("Rapor tarama sunucu hatası:", error);
    if (error?.name === "AbortError") {
      return NextResponse.json(
        { error: `Gemini API zaman aşımına uğradı (${GEMINI_TIMEOUT_MS / 1000}sn), lütfen tekrar deneyin.` },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: "Sunucu hatası: " + error.message }, { status: 500 });
  }
}