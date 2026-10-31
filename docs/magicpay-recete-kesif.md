# MagicPay keşfi — Reçete / Ürün satışı / Hammadde (31.10.2026)

Dönem: 23–29.10.2026, şube CORUM (branch 15). Veriler Claude'un tarayıcısında kullanıcının MagicPay oturumuyla çekildi.

## API uçları (base `https://kebo-api.magicpay.ai/api`, başlık `Authorization: Bearer <token>`)
Tarayıcıda token: `localStorage.magic_admin_token`. Sunucuda: Vercel MAGICPAY_EMAIL/PASSWORD ile giriş (`app/api/magicpay-karsilastirma` gibi).
- **Ürün Satış Raporu**: `POST /reports/product-sales` body `{start_date:"2026-10-23T00:00:00", end_date:"2026-10-29T23:59:59", include_variants:true, include_stock:false, branch_ids:[15]}` → `branches[0].products[]` {product_id, product_name, quantity, gross/discount/net_amount, variants[] {variant_id, variant_name, quantity, net_amount}}. Sayılar string.
- **Reçete**: `GET /recipes/variants/{variant_id}` → items[] {ingredient_id, quantity, unit, ingredient{name, unit_type}}.
- **Reçete maliyeti**: `GET /recipes/variants/{variant_id}/cost` → total_cost, items[] {ingredient_name, quantity, unit, unit_price, fire_rate_percent, cost}.
- **Malzemeler**: `GET /ingredients?skip=0&limit=200` (83 malzeme) → ingredient_id, name, unit_type, unit_price, price_source (Merkez/Yerel).
- **Hammadde Raporu (özet)**: `GET /reports/raw-material/summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&branch_ids=15` → items[] {ingredient_name, unit, recipe_unit_cost, recipe_used_quantity, recipe_used_cost, opening/incoming/outgoing/balance_quantity, count_quantity, waste_quantity}. DİKKAT: end_date gün başı (00:00) alınıyor → bitiş gününü dahil etmek için bir sonraki günü ver. Birim "g" yazsa da miktarlar kg.
- Ayrıntı: `GET /reports/raw-material?branch_id=15&...`, olaylar `/reports/raw-material/events`.
- Hareket raporu: `POST /reports/product-flow` (tarihler saat dilimli olmalı: `2026-10-23T00:00:00+03:00`).
- Stok: `GET /stock/branch/15?type=ingredient`, günlük kullanım `/stock/branch/15/daily-usage?days=7&target_days=7`.

## Bulgular
- 23–29.10: 2.126 ürün, net ₺463.898. Hammadde özetinde reçeteye göre kullanım ₺55.214 (net cironun ~%12). Günlük Ciro raporu "maliyet %20" (₺81.515) diyor; fark henüz açıklanmadı.
- **MagicPay'de reçeteler zaten malzeme + miktarla girili** (büyük olasılıkla Kebo merkezi; fiyatların çoğu "Merkez"). Dürümler (Kebo/Kebabi/Green/Patron/Atom 60–210 g), Yummy, Tenders Dürüm, Ekmek Arası, çıtırlar, patates, soslar, içecekler var.
- Fotoğraftaki reçetelerle eşleşme: "Ekmek sosu" + "Sos" = **DOMATES SOSU** (90 dürümde 50+40 = 0,09 kg); "Mayonez" ve "Ekmek mayonezi" = **YOĞURTLU MAYONEZ** (Green/Patron 40+10 = 0,05). Döner MagicPay'de %10 fazlasıyla (90 g → 0,099 kg; fire payı). Taze patates MagicPay'de 0,14 kg, fotoğrafta 65–70 g.
- **Hatalı reçeteler**:
  - ATOM (150 Gr): DÜRÜMLÜK 1 kg (diğerlerinde 0,0025) → maliyet ₺383,82 (doğrusu ~₺95).
  - Adetli çıtırlar kg kutusuna adet sayısı/1000 yazılmış: 3'LÜ NUGGET → NUGGET 0,003 kg (3 g); 9'LU SOĞAN HALKASI 0,009 kg; 6'LI TAVUK TOPU 0,006 kg; Combo Tabak XL, Çıtır Mix, İkili Çıtır aynı. Maliyetleri ₺3–9 çıkıyor (gerçek çok daha yüksek). 1 adet kaç gram bilinmeli.
- **Reçetesi OLMAYAN (maliyet ₺0) satılanlar**: MENÜ 1 (188 ad, ₺61.889), 2 KİŞİLİK COMBO MENÜ XL (69, ₺46.841), 2 Kişilik Menü (44, ₺21.624), 3 KİŞİLİK TRIO MENÜ XL (18, ₺17.050), 10'LU HOT SHOTS (34, ₺11.121), MENÜ 2/3/4, 3 Kişilik Menü, 2 Kişilik Coca-Cola/Ekmek Arası/Tenders Dürüm/Yummy Menü, et döner ürünleri (Green/Kebabi Et Dürüm, Ekmek Arası Et Döner, Pilav Üstü Et/Tavuk Döner), Burrito, Çuros, Su, Sütaş Ayran, Jumbo Patates K.
- MagicPay stok bakiyeleri hep EKSİ (giriş yapılmıyor) → MagicPay stoğu kullanılamaz; ama `recipe_used_quantity` "olması gereken tüketim" için doğrudan kullanılabilir.
- Fotoğraftaki Chick'N menüleri (Kanat Menü vb.) bu dönemin satışlarında ayrı adla görünmüyor; MENÜ 1–4 ne oldukları belli değil.

## Öneri
Reçeteleri panelde baştan yazmak yerine MagicPay'deki reçeteler kaynak alınsın: panel ürün satışlarını + varyant reçetelerini + hammadde kullanım özetini MagicPay'den otomatik çeksin; MagicPay malzemeleri panel stok ürünleriyle bir kez eşlensin (TAVUK DÖNER ↔ stok tavuk döner…); maliyet hem MagicPay fiyatıyla hem panelin fatura fiyatıyla (`stok_fiyatlar`) gösterilsin; hatalı/eksik reçeteler liste olarak çıkarılsın (MagicPay'de düzeltilecek ya da panelde üzerine yazılacak).
