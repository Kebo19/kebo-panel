import { NextResponse } from "next/server";
import { oturumKontrol } from "@/lib/supabase/server";
import { taramaDuzelt, taramaTarihi, kurusluAlanlar } from "@/lib/tarama";
import { geminiIstek } from "@/lib/gemini";

// "Fişten Doldur" özelliği: kullanıcı KEBO kağıt kasa raporunun fotoğrafını
// yükler, Gemini görseli okuyup dijital forma birebir eşlenen JSON döndürür.
// Gemini çağrısı, kota/yoğunlukta yedek modele geçiş dahil lib/gemini.ts'dedir.

const SISTEM_PROMPT = `Sen KEBO ERP için bir kağıt rapor okuma asistanısın. Sana KEBO'nun kağıt günlük kasa
formunun fotoğrafları verilecek (bir veya birkaç görsel; birden fazlaysa aynı günün sayfalarıdır, hepsini birlikte
oku ve TEK JSON üret). Form iki düzenden biri olabilir:

A) YENİ FORM (tek sayfa, başlık "KEBO Günlük Kasa Formu", bölümler 1–7 numaralı):
  1. SATIŞLAR: tek tablo. Sütunlar: Online ₺ | Paket | İndirim ₺ | Kapıda ₺ | Paket | Toplam Paket
     En sağdaki "Toplam Paket" sütunu satırın toplam paketidir (kontrol amaçlı, JSON'a satır bazında yazma).
     Tablonun hemen altında yan yana duran "KEBO toplam paket", "Chick'n toplam paket", "Dükkân toplam paket"
     kutularını "kontrol.paketKebo", "kontrol.paketCnf", "kontrol.paketToplam" alanlarına yaz.
     KEBO satırları: Yemeksepeti, Trendyol, Migros, Alo Paket
     CHICK'N FRIDE satırları: Yemeksepeti, Trendyol, Migros
     Gri hücreler (Alo Paket online/indirim, Chick'n Fride kapıda) genelde boştur; AMA içine bir şey yazılmışsa
     OKU ve işle: Alo Paket online → online.kebo.alo, Chick'n Fride kapıda → kapida.cnf.<platform>.
     İndirim sütunu ONLINE indirimidir (Migros dahil).
     Eşleme: KEBO Migros online → online.kebo.migros, KEBO Migros kapıda → kapida.kebo.migrosYemek,
     Chick'n Fride Migros online → online.cnf.migrosYemek, Chick'n Fride Migros kapıda → kapida.cnf.migrosYemek,
     Alo Paket kapıda → kapida.kebo.alo.
     İndirim → online.<marka>.<platform>.indirim ; kapıda indirimleri her zaman 0.
  2. KASA: Nakit, POS ve yemek kartları: Edenred, Metropol, Setcard, Pluxee, Paye.
     Altındaki "Brüt Ciro" ve "Net Ciro" kutularını "kontrol.brut" ve "kontrol.net" alanlarına yaz.
  3. GİDERLER: Açıklama | Personel (avans ise) | Tutar. Personel sütunu DOLU olan satır avanstır →
     "avanslar" dizisine {personel, aciklama, tutar}; personel sütunu boş olan satır → "giderler".
     Tablonun en altındaki "TOPLAM GİDER" kutusunu "kontrol.gider" alanına yaz (satır olarak ekleme).
  4. PERSONEL KESİNTİSİ: Personel | Sebep | Tutar → "kesintiler"
  5. İPTAL / İADE: Açıklama | Tutar → "iadeler"
  6. KURYE: satırlar "Sabit 1", "Sabit 2", "Havuz"; sütunlar Kurye adı | Paket | Nakit | POS.
     Sabit satırlar → "kuryeSabit" (sırasıyla; isim = yazılan kurye adı).
     "Havuz" satırı → "kuryeHavuz". Havuz satırında İSİM YAZILMAZ; isim boş olsa bile paket/nakit/POS
     doluysa satırı MUTLAKA ekle ve isim olarak "Havuz" yaz. Paket sayısını mutlaka oku.
  7. NAKİT KASA (önceki günlerden kalan nakit): tablo satırları (Kime / ne için | Bankaya yatırıldıysa banka
     adı | Tutar) → nakitKasa.hareketler ({aciklama, banka, tutar}; banka boşsa "" yaz);
     "Kasa sayıldıysa: kasadaki toplam nakit" kutusu → nakitKasa.sayim (boşsa 0). Eski formlarda "Devreden"
     kutusu varsa → nakitKasa.devreden.
     Bu bölüm günlük giderlere DAHİL DEĞİLDİR; bu satırları "giderler"e koyma.
  8. NOTLAR → "notlar"
  GİDERLER'de açıklamasında "iade" veya "iptal" geçen bir satır görürsen onu yine "giderler"e koy ama
  alanını (örn. "giderler.0.tutar") "belirsiz_alanlar"a ekle (iade 5. bölüme yazılmalıydı).

B) ESKİ FORM (önlü arkalı, başlık "Günlük Kasa Kapanış Raporu — Kağıt Formu"):
  Ön yüz: Tarih, Giren; "ONLINE SATIŞLAR" (KEBO: Yemeksepeti, Trendyol, Migros; CHICK'N FRIDE: Yemeksepeti,
  Trendyol, Migros Yemek — her biri Tutar, Paket, İndirim); "KAPIDA ÖDEME" (KEBO ve CHICK'N FRIDE; Yemeksepeti,
  Trendyol, Migros Yemek, Alo Paket — Tutar, Paket, İndirim); "KASA" (Nakit, Pos, Edenred, Metropol, Kasa Toplamı).
  Arka yüz: GİDERLER (Açıklama, Tutar); PERSONEL AVANS (Personel Adı, Ne alındı, Tutar); PERSONEL KESİNTİSİ;
  İPTAL-İADE FİŞLERİ; KURYE (Sabit Kurye 1–2 ve Havuz Kurye satırları: ad, Nakit, Kredi/Pos, Paket); NOTLAR.
  ESKİ formda avanslar Giderler tablosuna DA yazılmış olabilir: aynı tutarlı avans satırını "giderler"e
  tekrar koyma, sadece "avanslar"a koy. "Kasa Toplamı"nı okuma. Sayfaya elle yazılmış "Brüt" ve "Net"
  toplamları varsa "kontrol.brut" ve "kontrol.net" alanlarına yaz.

GÖREV: Fotoğraftaki el yazısı rakamları ve metinleri oku, aşağıdaki JSON şemasına birebir uyacak
şekilde çıktı ver. SADECE JSON döndür, başka hiçbir açıklama, markdown backtick veya metin ekleme.

KURALLAR:
- Boş bırakılmış (hiç yazı olmayan) hücreler için 0 (sayısal alanlarda) veya "" (metin alanlarında) yaz.
- SAYI BİÇİMİ (ÇOK ÖNEMLİ): Türkçe yazımda NOKTA BİNLİK ayraçtır, VİRGÜL ondalıktır.
  "3.285" = üç bin iki yüz seksen beş → 3285. "5.002" → 5002. "1.234,50" → 1234.5. "12,5" → 12.5.
  Noktadan sonra tam 3 rakam varsa o nokta her zaman binlik ayraçtır. Tutarları JSON'a ayraçsız sayı olarak yaz.
- Tutarlar genelde TAM LİRA yazılır. Sonda ".00" veya ",00" (iki sıfır) varsa bu sıfır kuruştur, at:
  "9.413.00" → 9413, "390.00" → 390, "2.797.00" → 2797, "4.910.00" → 4910.
  Sonda iki sıfır dışında 2 rakam varsa (",50" / ".50") kuruştur: "12,50" → 12.5.
- Rakamların arasında nokta gibi görünen küçük bir iz ve ardından TEK rakam varsa bu kalem izidir, ondalık
  DEĞİLDİR: "30.1" gibi görünen yazıyı 301 olarak oku ve "belirsiz_alanlar"a ekle.
- Üstü çizilip düzeltilmiş rakamlarda çizilen rakamı yok say, düzeltilmiş hâlini oku ve alanı "belirsiz_alanlar"a ekle.
- Rakamın sonundaki "-" işareti (örn. "854-") eksi değil, süs/çizgidir: 854.
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
      "migros": {"tutar": number, "paket": number, "indirim": number},
      "alo": {"tutar": number, "paket": number, "indirim": number}
    },
    "cnf": {
      "ys": {"tutar": number, "paket": number, "indirim": number},
      "trendyol": {"tutar": number, "paket": number, "indirim": number},
      "migrosYemek": {"tutar": number, "paket": number, "indirim": number}
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
  "kasa": {"nakit": number, "pos": number, "edenred": number, "metropol": number, "setcard": number, "pluxee": number, "paye": number},
  "kontrol": {"paketKebo": number, "paketCnf": number, "paketToplam": number, "gider": number, "brut": number, "net": number},
  "giderler": [{"aciklama": "string", "tutar": number}],
  "avanslar": [{"personel": "string", "aciklama": "string", "tutar": number}],
  "kesintiler": [{"personel": "string", "aciklama": "string", "tutar": number}],
  "iadeler": [{"aciklama": "string", "tutar": number}],
  "kuryeSabit": [{"isim": "string", "nakit": number, "pos": number, "paket": number}],
  "kuryeHavuz": [{"isim": "string", "nakit": number, "pos": number, "paket": number}],
  "nakitKasa": {"devreden": number, "hareketler": [{"aciklama": "string", "banka": "string", "tutar": number}], "sayim": number},
  "notlar": "string",
  "belirsiz_alanlar": ["dot.path.gibi.anahtarlar"]
}

Boş satırları (giderler, avanslar, kesintiler, iadeler, kuryeHavuz) dizilere hiç ekleme —
sadece gerçekten bir şey yazılmış satırları diziye koy.`;

export async function POST(req: Request) {
  const oturum = await oturumKontrol();
  if (!oturum.ok) return oturum.yanit;
  try {
    const govde = await req.json();
    // Yeni biçim: gorseller: [{base64, mediaType}] (ön/arka yüz). Eski biçim: imageBase64 + mediaType.
    const ham: { base64?: unknown; mediaType?: unknown }[] = Array.isArray(govde?.gorseller)
      ? govde.gorseller
      : govde?.imageBase64 ? [{ base64: govde.imageBase64, mediaType: govde.mediaType }] : [];
    const gorseller = ham
      .filter(g => typeof g?.base64 === "string" && g.base64.length > 0)
      .slice(0, 3)
      .map(g => ({
        data: g.base64 as string,
        mime_type: typeof g.mediaType === "string" && /^(image\/|application\/pdf)/.test(g.mediaType) ? g.mediaType : "image/jpeg",
      }));
    if (!gorseller.length) {
      return NextResponse.json({ error: "Görsel bulunamadı." }, { status: 400 });
    }
    const sonuc = await geminiIstek({
      system: SISTEM_PROMPT,
      contents: [{ role: "user", parts: [
        ...gorseller.map(g => ({ inline_data: g })),
        { text: gorseller.length > 1
          ? `Bu ${gorseller.length} görsel aynı günün KEBO kağıt kasa raporunun sayfaları. Hepsini birlikte oku ve yalnızca tek JSON döndür.`
          : "Bu KEBO kağıt kasa raporunu oku ve yalnızca JSON döndür." },
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
