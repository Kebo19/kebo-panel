import { NextResponse } from "next/server";

// "Fişten Doldur" özelliği: kullanıcı KEBO kağıt kasa raporunun fotoğrafını
// yükler, Gemini görseli okuyup dijital forma birebir eşlenen JSON döndürür.
// Gemini API'nin ücretsiz katmanı (Flash modeli) kullanılıyor — Anthropic API
// kredisi gerektirmez. Anahtar sadece burada, sunucu tarafında kullanılır.

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

export async function POST(req: Request) {
  try {
    const { imageBase64, mediaType } = await req.json();

    if (!imageBase64) {
      return NextResponse.json({ error: "Görsel bulunamadı" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
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
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Rapor tarama API hatası (Gemini):", data);
      return NextResponse.json({ error: "API hatası", details: data }, { status: response.status });
    }

    const metin = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
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
    return NextResponse.json({ error: "Sunucu hatası: " + error.message }, { status: 500 });
  }
}
