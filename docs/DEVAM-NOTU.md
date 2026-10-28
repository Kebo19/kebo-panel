# KEBO PANEL — DEVAM NOTU (yeni sohbete başlarken okunacak)

Son güncelleme: 28.10.2026 (gece)

## Proje
- BCM Restoran (Kebo franchise + Chick'N Fride + Kıraloğlu, Çorum) yönetim paneli: https://kebo-panel.vercel.app
- Kod: `C:\Users\Bilgisayarım\kebo-panel` (Next.js 16 + React 19 + Tailwind, Supabase `ktvarqdidplunhjcjpor`, Vercel "kebo-panel" projesi).
- Yayınlama: proje klasöründeki `yayinla.bat` (npm install → test → git commit → push; Vercel otomatik yayınlar).
- Kullanıcı Türkçe konuşur, teknik değildir; komutları kopyala-yapıştır ya da .bat ile ister. Şifre/token girmeyi kendisi yapar.
- Kodda `AGENTS.md`: bu Next.js sürümü farklı; `node_modules/next/dist/docs/` rehberine bakılır.
- Değişiklik yaptıktan sonra: `npx tsc --noEmit`, `npx eslint`, `npx vitest run` (şu an 246 test geçiyor), `next build`.

## Yapılmış olanlar (özet)
- **Cari / fatura**: borç = faturalar − ödemeler (tetikleyiciler durumu hesaplar), hakedişten mahsup ve hatır faturası (kasasız), Kebo haftalık PDF ekstre + 15 gün vade (Cuma ödemesi), fatura arama/düzenleme, ödeme→fatura görünümü, vade takvimi.
- **Kasa raporu**: Kebo/CNF/Kıraloğlu, kapıda nakit/POS ayrımı, Dükkân/Genel toplam nakit-POS, kağıt formun fotoğrafla taranması, rapor değişiklik taleplerinde kalem kalem onay.
- **Kağıt formlar** (`/stok/kagit`, `lib/kasaFormu.ts`): ön yüz kasa formu, arka yüz günlük sayım; günlük / haftalık (=günlük+haftalık) / aylık (=hepsi) / envanter (demirbaş) listeleri; "sayım yeri" girilirse kağıt yere göre bölümlenir.
- **Stok**: 71 ürünlük güncel liste (27.10); `/stok/liste` toplu liste düzenleme (sıra, ad, birim, kategori, sayım grubu, yer, min stok, not, durum); sayım kağıdını fotoğrafla okuma (`/api/sayim-tara`, `lib/sayimOku.ts`).
- **Mikro robotu** (`mikro-robot/`, kurulum zip'i `mikro-robot-kurulum.zip`): dükkân bilgisayarında 5 dk'da bir görünmez kontrol; panelden "Faturaları şimdi çek" (Faturalar ve Fiyat Listesi sayfası) ya da Telegram `/mikro` ile hemen, yoksa her gün 11:00'den sonra çalışır. Mikro sunuculardan girişi engellediği (HTTP 403) için robot dükkân bilgisayarında. **HENÜZ KURULMADI** (panelde bekleyen bir "çek" isteği var).
- **Telegram asistanı** (@Kebobcm_bot, `lib/telegram/*`, `/api/telegram/*`): soru-cevap (Gemini, kullanıcının yetkisi kadar veri), fotoğraf (kasa formu → Raporlar'da "Telegram'dan gelenler", sayım kağıdı → okunur ve Kaydet ile stoğa, irsaliye → Stok), sabah özeti (~10:00) ve öğlen uyarısı (~12:00, Vercel cron), komutlar: /ozet /odemeler /stok /robot /mikro /stokgiris /belge /bildirim /ayril. Murat bağlı.
- **Faturadan stok girişi (onaylı)** (`stok_giris_onerileri`, `stok_kalem_eslesme`, `components/StokGirisOnay.tsx`): Mikro'dan gelen her fatura kalemi "stoğa işlensin mi?" diye bekler; eşleşmiş kalemde ürün+çarpan hazır (ör. 3 koli × 10 = 30 kg); seçim hatırlanır; "takip etme" ile elektrik vb. bir daha sorulmaz; Telegram'a fatura bazında butonlu mesaj gider.
- **İrsaliye önce, fatura sonra** (`_irsaliye_eslesme`, `_irsaliye_bagla`): mal gelince irsaliye girilip teslim alınır (stoğa girer). Fatura gelince aynı VKN'li yakın tarihli irsaliye bulunur, kalem kalem karşılaştırılır (irsaliye 20 / fatura 24 → +4); "irsaliyeye bağla" stoğa ikinci kez girmez, istenirse fark faturaya göre düzeltilir; eşleşmeyen kalem irsaliyedeki ürüne elle bağlanınca çarpan öğrenilir.
- **Kullanıcı yönetimi (28.10 gece)** (`app/ayarlar/yetkiler`, migration `20261028200000_kullanici_yonetimi.sql`): Ayarlar → Kullanıcılar ve yetkiler'de ekleme / silme / yetki / "Yeni şifre ver". Hepsi veritabanı fonksiyonu (`kullanici_olustur`, `kullanici_sil`, `kullanici_sifre_belirle`, `sifremi_degistir`) — service_role anahtarı GEREKMEZ. Yöneticinin verdiği geçici şifre `kullanici_sifreleri` tablosunda (sadece Tam Yetkili okur) durur ve panelde görünür; `profiles.sifre_degismeli` true olan kişi girişte `/profil#sifre`'ye gider, kendi şifresini koyunca kayıt silinir (kendi şifresi bcrypt, kimse göremez). Kendini ve son Tam Yetkili'yi silemez. Ayşe (ayse@kebo.com) 28.10'da silindi; kullanıcılar: Murat, Bülent (Tam Yetkili), Bekir (Müdür). Migration Supabase'e uygulandı.
- **İrsaliye ↔ fatura sorgusu**: Stok ve Faturalar sayfasında "İrsaliye ↔ fatura" arama kutusu; Telegram'da `/belge <no ya da firma>` ve serbest soru.

## Bekleyenler / sıradaki işler
1. **28.10 akşamı yazılan son değişiklikler (faturadan stok girişi, irsaliye eşleştirme, belge arama, kullanıcı yönetimi/şifreler) henüz yayınlanmadı** → `yayinla.bat` çalıştırılmalı, sonra Ayarlar → Telegram → "Kurulumu yenile" (yeni komutlar menüye gelsin). Yayından sonra kullanıcı yönetimi canlıda denenmeli (deneme kullanıcısı ekle → giriş → şifre değiştir → sil).
2. Dükkân bilgisayarına Mikro robotunu kurmak (`mikro-robot-kurulum.zip` → Chrome + Node.js LTS → `KURULUM.bat`).
3. Kullanıcı: ürünlere sayım yeri ata, minimum stokları gözden geçir ('1' olanlar yer tutucu), envanter ürünlerini ve içecekleri (ayran, kola…) stok listesine ekle. `Stok-Sayim-Listeleri.xlsx` dolu gelirse panele toplu işlenecek.
4. **Reçeteler** kullanıcıdan gelecek → `receteler` tablosuna gir (menü ürünü adı MagicPay'deki adla aynı olmalı).
5. **MagicPay ürün satışları** (kebo-admin-ui.magicpay.ai; API `kebo-api.magicpay.ai`, giriş bilgisi Vercel'de MAGICPAY_EMAIL/PASSWORD, `app/api/magicpay-karsilastirma`): ürün bazlı satış uç noktası bulunacak (kullanıcı oturum açıkken tarayıcıda ağ isteklerine bakılabilir) → `urun_satislari` otomatik dolsun.
6. Sonra: **"bizde olan / olması gereken" (eksik-fazla) raporu**: önceki sayım + faturadan gelen − fire − (MagicPay satışı × reçete) = olması gereken; son sayım = bizde olan; fark = eksik/fazla. Satış stoktan doğrudan düşülmeyecek, ayrı "olması gereken" listesi olacak.
7. Beklemeye alınanlar: otomatik sipariş (stok girişi oturunca), kurye analizi (B-9), muhasebeci paketi (C-14), platform hakedişleri, tahmin/hazırlık (B-7, platform geçmiş verisiyle), nakit akışı yapılmayacak.
8. Veri kontrolü (kullanıcı faturaları düzenliyor): Kalem Meşrubat −14.387 ₺ fazla ödeme, Sütaş 28.09 32.339 ₺ ödeme, Trendyol/Yemek Sepeti/Ttnet/Yurtiçi eksi açılış düzeltmeleri. 22–30.09 arasındaki 21 eksik Mikro faturası 27.10'da eklendi.
9. Güvenlik: Vercel'deki kullanılmayan `NEXT_PUBLIC_ANTHROPIC_API_KEY` silinmeli / anahtar yenilenmeli; Shared sekmesindeki boşta `TELEGRAM_BOT_TOKEN` kopyası silinebilir.

## Önemli dosyalar
- Veritabanı değişiklikleri: `supabase/migrations/2026102*.sql`
- Telegram: `lib/telegram/{sunucu,ozet,asistan}.ts`, `app/api/telegram/{route,kurulum,bildirim,olay}`
- Stok: `app/stok/page.tsx`, `app/stok/liste`, `app/stok/kagit`, `components/{StokGirisOnay,IrsaliyePaneli,SayimKagidiTara,BelgeAra}.tsx`, `lib/stok.ts`, `lib/kasaFormu.ts`
- Mikro: `mikro-robot/robot.mjs`, `components/MikroCek.tsx`
