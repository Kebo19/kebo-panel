import { NextResponse } from "next/server";
import { oturumKontrol } from "@/lib/supabase/server";
import { taramaDuzelt, taramaTarihi, kurusluAlanlar } from "@/lib/tarama";
import { geminiIstek } from "@/lib/gemini";

// "Fişten Doldur" özelliği: kullanıcı KEBO kağıt kasa raporunun fotoğrafını
// yükler, Gemini görseli okuyup dijital forma birebir eşlenen JSON döndürür.
// Gemini çağrısı, kota/yoğunlukta yedek modele geçiş dahil lib/gemini.ts'dedir.

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
- SAYI BİÇİMİ (ÇOK ÖNEMLİ): Türkçe yazımda NOKTA BİNLİK ayraçtır, VİRGÜL ondalıktır.
  "3.285" = üç bin iki yüz seksen beş → 3285. "5.002" → 5002. "1.234,50" → 1234.5. "12,5" → 12.5.
  Noktadan sonra tam 3 rakam varsa o nokta her zaman binlik ayraçtır. Tutarları JSON'a ayraçsız sayı olarak yaz.
- Paket sayıları tam sayıdır. İndirim hücresine yazılmış tek rakam da (örn. "2") o satırın indirim tutarıdır.
- "—" veya "-" basılı olan hücreler o satırda alanın olmadığını gösterir, 0 yaz.
- Bir rakam okunuyor ama el yazısı belirsizse (silik, üstü çizili, yorumlanması zor), YİNE DE en iyi tahminini
  JSON'a yaz, AMA o alanın dot-path anahtarını mutlaka "belirsiz_alanlar" listesine ekle.
- Bir hücre TAMAMEN boşsa ve doldurulması bekleniyorsa (örn. Kasa bölümündeki Nakit hücresi boşsa),
  değeri 0 yap ve yine "belirsiz_alanlar" listesine ekleme — gerçekten boşsa bu normal, kullanıcı o günü doldurmamış olabilir.
  Sadece OKUNAMAYAN/BELİRSİZ olanları belirsiz_alanlar'a ekle, boş olanları değil.
- Tarihi GG.AA.YYYY olarak okuyup YYYY-AA-GG (ISO) formatına çevir. 2 haneli yıl varsa 20xx kabul et.
  Gün veya ay boş/okunamıyorsa (örn. sadece basılı "/ 2026" varsa) tarih için null yaz; tahmin etme.
- Fotoğrafta formun sadece bir sayfası olabilir; görünmeyen bölümler için boş değer/boş dizi yaz.
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
  const oturum = await oturumKontrol();
  if (!oturum.ok) return oturum.yanit;
  try {
    const { imageBase64, mediaType } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json({ error: "Görsel bulunamadı." }, { status: 400 });
    }
    const tip = typeof mediaType === "string" && /^(image\/|application\/pdf)/.test(mediaType) ? mediaType : "image/jpeg";
    const sonuc = await geminiIstek({
      system: SISTEM_PROMPT,
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: tip, data: imageBase64 } },
        { text: "Bu KEBO kağıt kasa raporunu oku ve yalnızca JSON döndür." },
      ] }],
      maxOutputTokens: 16384,
      json: true,
    });
    if (!sonuc.ok) return NextResponse.json({ error: sonuc.hata }, { status: sonuc.status });

    const metin = sonuc.metin;
    const bas = metin.indexOf("{"), son = metin.lastIndexOf("}");
    let ayrisik;
    try {
      ayrisik = JSON.parse(metin.slice(bas, son + 1));
    } catch {
      console.error("[rapor-tara] JSON okunamadı:", metin.slice(0, 500));
      return NextResponse.json({ error: "Form okunamadı, daha net bir fotoğrafla tekrar deneyin." }, { status: 502 });
    }
    // Binlik ayracı yanlış okunmuş tutarları ve geçersiz tarihi düzelt
    const duzeltilmis = taramaDuzelt(ayrisik);
    duzeltilmis.tarih = taramaTarihi(duzeltilmis.tarih);
    const belirsiz = Array.isArray(duzeltilmis.belirsiz_alanlar) ? duzeltilmis.belirsiz_alanlar.map(String) : [];
    duzeltilmis.belirsiz_alanlar = [...new Set([...belirsiz, ...kurusluAlanlar(duzeltilmis)])];
    return NextResponse.json(duzeltilmis);
  } catch (error) {
    console.error("[rapor-tara] Sunucu hatası:", error);
    return NextResponse.json({ error: "Sunucu hatası, tekrar deneyin." }, { status: 500 });
  }
}
