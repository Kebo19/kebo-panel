// ─── KAĞIT KASA FORMU + SAYIM LİSTESİ ───────────────────────────────────────
// Ön yüz: günlük kasa formu (sabit). Arka yüz: stokta "Günlük Sayım" grubundaki ürünler
// (Stok sayfasındaki sırayla, sistemden canlı gelir). Haftalık / aylık sayım listeleri de
// aynı şablonla tek sayfa olarak basılabilir.
// Her satırın başındaki NO, telefonla taranan kağıdın ürünlerle eşleşmesi içindir
// (app/api/sayim-tara). Ürün eklenip sırası değişirse kağıdı yeniden yazdırın.
// docs/kagit-form/kebo-kasa-formu.html bu şablonun bir önizlemesidir.

export type SayimPeriyodu = "gunluk" | "haftalik" | "aylik";
export const PERIYOT_ADI: Record<SayimPeriyodu, string> = { gunluk: "Günlük", haftalik: "Haftalık", aylik: "Aylık" };

export interface KagitUrunu { no: number; urun_adi: string; birim: string; kategori?: string | null }

/** stok_urunler satırının kağıt için gereken kısmı */
export interface SayimUrunKaydi { id: string; urun_adi: string; birim: string; kategori: string | null; sayim_periyodu: string | null; sira_no: number | null }

/** Bir sayım grubunun kağıttaki sırası (Stok sayfasındaki sıra). Tarama da aynı numaraları kullanır. */
export function grupUrunleri(urunler: SayimUrunKaydi[], periyot: SayimPeriyodu): (KagitUrunu & { id: string })[] {
  return urunler
    .filter(u => (u.sayim_periyodu || "gunluk") === periyot)
    .sort((a, b) => (a.sira_no ?? 9999) - (b.sira_no ?? 9999) || a.urun_adi.localeCompare(b.urun_adi, "tr"))
    .map((u, i) => ({ id: u.id, no: i + 1, urun_adi: u.urun_adi, birim: u.birim, kategori: u.kategori }));
}

const CSS = `
  @page { size: A4; margin: 8mm 9mm; }
  * { box-sizing: border-box; }
  body { font-family: "DejaVu Sans", Arial, sans-serif; color: #111; margin: 0; font-size: 9.5pt; }
  .ust { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #111; padding-bottom: 5px; margin-bottom: 7px; }
  .ust h1 { font-size: 17pt; margin: 0; letter-spacing: .5px; }
  .ust h1 small { font-size: 9pt; font-weight: normal; color: #444; margin-left: 6px; }
  .alanlar { display: flex; gap: 18px; font-size: 10.5pt; font-weight: bold; }
  .alanlar span.cizgi { display: inline-block; border-bottom: 1.5px solid #111; height: 20px; vertical-align: bottom; }
  h2 { font-size: 10pt; margin: 4px 0 3px; white-space: nowrap; padding: 3px 7px; background: #111; color: #fff; display: flex; justify-content: space-between; }
  h2 small { font-weight: normal; font-size: 8pt; color: #ddd; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1.2px solid #333; padding: 0 6px; height: 18.5px; }
  table.esit { table-layout: fixed; }
  th { background: #e9e9e9; font-size: 8pt; height: 17px; text-align: center; }
  td.ad { font-weight: bold; width: 26%; font-size: 9.5pt; }
  td.yok { background: #ececec; }
  td.top { background: #fff; }
  .toplam td { height: 25px; }
  .toplam td.et { font-weight: bold; background: #f3f3f3; width: 26%; }
  .toplam td.et.b { background: #111; color: #fff; }
  table.ptoplam { width: auto; margin: 4px 0 0 auto; }
  table.ptoplam td { height: 24px; }
  table.ptoplam td.et { border: none; font-weight: bold; font-size: 8pt; white-space: nowrap; text-align: right; padding: 0 5px 0 12px; }
  table.ptoplam td.et.b { color: #111; }
  table.ptoplam td.kutu { width: 62px; border: 1.5px solid #111; background: #fff; }
  tr.ptop td { height: 25px; }
  tr.gtop td { height: 26px; }
  table.nk td { height: 24px; }
  table.nk td.et { font-weight: bold; font-size: 9pt; background: #f3f3f3; }
  table.nk td.et.b { background: #fff; border: none; text-align: right; font-size: 9.5pt; }
  table.nk td.bos { border: none; }
  table.nk td.kutu { border: 2px solid #111; }
  tr.gtop td.et { text-align: right; font-weight: bold; font-size: 10pt; border: none; }
  tr.gtop td.et small { font-weight: normal; font-size: 8pt; }
  tr.gtop td.kutu { border: 2px solid #111; }
  table.ciro td { height: 28px; font-size: 12pt; }
  table.nptop th { height: 24px; font-size: 7.5pt; line-height: 1.15; }
  table.nptop th small { font-weight: normal; font-size: 6.5pt; color: #444; }
  table.nptop td { height: 24px; }
  table.ciro td.et { font-size: 11.5pt; letter-spacing: .5px; }
  tr.ptop td.et { font-weight: bold; text-align: right; background: #f3f3f3; font-size: 9pt; }
  tr.ptop td.et.b { background: #111; color: #fff; }
  tr.ptop td.kutu { border: 2px solid #111; background: #fff7e6; }
  tr.ptop td.bos { border: none; }
  tr.marka td { background: #f3f3f3; font-weight: bold; font-size: 8pt; height: 15px; letter-spacing: .5px; }
  .iki { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .not { border: 1.2px solid #333; height: 30px; }
  .alt { margin-top: 6px; font-size: 7.5pt; color: #333; display: flex; justify-content: space-between; }
  .kural { border: 1px dashed #555; padding: 4px 7px; font-size: 8pt; margin-top: 6px; }
  .w-tutar { width: 15%; } .w-paket { width: 7.5%; } .w-ind { width: 12%; } .w-kap { width: 12.5%; }

  /* Notlar sayfanın sonuna kadar uzar */
  .sayfa { display: flex; flex-direction: column; height: 277mm; overflow: hidden; }
  .sayfa.on { page-break-after: always; break-after: page; }
  .not { flex: 1 1 auto; min-height: 28px; }

  table.sayim td { height: var(--h, 27px); }
  table.sayim th small { font-weight: normal; font-size: 6.5pt; color: #444; }
  table.sayim td.no { text-align: center; font-weight: bold; font-size: 9pt; }
  table.sayim td.ad { font-size: 8.5pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 0; }
  table.sayim td.br { text-align: center; color: #444; font-size: 8.5pt; }
  .kod { font-size: 7pt; color: #555; letter-spacing: 1px; text-align: right; margin-top: 2px; }
`;

const ON_YUZ = `
  <div class="ust">
    <h1>KEBO <small>Günlük Kasa Formu</small></h1>
    <div class="alanlar">
      <div>Tarih: <span class="cizgi" style="width:32px"></span> / <span class="cizgi" style="width:32px"></span> / 2026</div>
      <div>Giren: <span class="cizgi" style="width:150px"></span></div>
    </div>
  </div>

  <h2>1. SATIŞLAR <small>Kapıda: nakit ve POS ayrı · Toplam Paket = online + kapıda · gri kutular boş</small></h2>
  <table>
    <tr><th>Platform</th><th class="w-tutar">Online ₺</th><th class="w-paket">Online<br>Paket</th><th class="w-ind">İndirim ₺</th><th class="w-kap">Kapıda<br>Nakit ₺</th><th class="w-kap">Kapıda<br>POS ₺</th><th class="w-paket">Toplam<br>Paket</th></tr>
    <tr class="marka"><td colspan="7">KEBO</td></tr>
    <tr><td class="ad">Yemeksepeti</td><td></td><td></td><td></td><td></td><td></td><td class="top"></td></tr>
    <tr><td class="ad">Trendyol</td><td></td><td></td><td></td><td></td><td></td><td class="top"></td></tr>
    <tr><td class="ad">Migros</td><td></td><td></td><td></td><td></td><td></td><td class="top"></td></tr>
    <tr><td class="ad">Alo Paket</td><td class="yok"></td><td class="yok"></td><td class="yok"></td><td></td><td></td><td class="top"></td></tr>
    <tr class="marka"><td colspan="7">CHICK'N FRIDE</td></tr>
    <tr><td class="ad">Yemeksepeti</td><td></td><td></td><td></td><td class="yok"></td><td class="yok"></td><td class="top"></td></tr>
    <tr><td class="ad">Trendyol</td><td></td><td></td><td></td><td class="yok"></td><td class="yok"></td><td class="top"></td></tr>
    <tr><td class="ad">Migros</td><td></td><td></td><td></td><td class="yok"></td><td class="yok"></td><td class="top"></td></tr>
    <tr class="marka"><td colspan="7">KIRALOĞLU</td></tr>
    <tr><td class="ad">Yemeksepeti</td><td></td><td></td><td></td><td class="yok"></td><td class="yok"></td><td class="top"></td></tr>
    <tr><td class="ad">Trendyol</td><td></td><td></td><td></td><td class="yok"></td><td class="yok"></td><td class="top"></td></tr>
    <tr><td class="ad">Migros</td><td></td><td></td><td></td><td class="yok"></td><td class="yok"></td><td class="top"></td></tr>
  </table>
  <table class="ptoplam">
    <tr><td class="et">KEBO toplam paket</td><td class="kutu"></td><td class="et">Chick'n toplam paket</td><td class="kutu"></td><td class="et">Kıraloğlu toplam paket</td><td class="kutu"></td><td class="et b">Dükkân toplam paket</td><td class="kutu"></td></tr>
  </table>

  <h2>2. KASA <small>Gün sonu sayım</small></h2>
  <table class="esit">
    <tr><th>Nakit ₺</th><th>POS ₺</th><th>Edenred ₺</th><th>Metropol ₺</th><th>Setcard ₺</th><th>Pluxee ₺</th><th>Paye ₺</th><th>Multinet ₺</th></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </table>
  <table class="esit nptop" style="margin-top:3px">
    <tr><th>Dükkân Toplam Nakit ₺<br><small>kasa + Kurye 1-2 (havuz hariç)</small></th><th>Dükkân Toplam POS ₺<br><small>kasa + Kurye 1-2 (havuz hariç)</small></th>
        <th>Genel Toplam Nakit ₺<br><small>dükkân + havuz kuryesi</small></th><th>Genel Toplam POS ₺<br><small>dükkân + havuz kuryesi</small></th></tr>
    <tr><td></td><td></td><td></td><td></td></tr>
  </table>
  <table class="toplam esit ciro" style="margin-top:3px">
    <tr><td class="et">BRÜT CİRO ₺</td><td></td><td class="et">NET CİRO ₺</td><td></td></tr>
  </table>

  <h2 style="margin-top:6px">3. GİDERLER <small>Kasadan çıkan her şey · avansa personel adı yazın · iade/iptal buraya değil</small></h2>
  <table>
    <tr><th>Açıklama</th><th style="width:26%">Personel (avans ise)</th><th style="width:17%">Tutar ₺</th></tr>
    <tr><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td></tr>
<tr class="gtop"><td colspan="2" class="et">TOPLAM GİDER ₺ <small>(avanslar dahil)</small></td><td class="kutu"></td></tr>
  </table>

  <div class="iki">
    <div>
      <h2>4. PERSONEL KESİNTİSİ <small>Kasayı etkilemez</small></h2>
      <table>
        <tr><th style="width:36%">Personel</th><th>Sebep</th><th style="width:28%">Tutar ₺</th></tr>
        <tr><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td></tr>
              <tr><td></td><td></td><td></td></tr>
</table>
    </div>
    <div>
      <h2>5. İPTAL / İADE</h2>
      <table>
        <tr><th>Açıklama</th><th style="width:30%">Tutar ₺</th></tr>
        <tr><td></td><td></td></tr>
        <tr><td></td><td></td></tr>
              <tr><td></td><td></td></tr>
</table>
    </div>
  </div>

  <h2>6. KURYE <small>Sabit kuryede günlük 30 paket garantisi var</small></h2>
  <table>
    <tr><th style="width:14%"></th><th>Kurye adı</th><th style="width:11%">Paket</th><th style="width:17%">Nakit ₺</th><th style="width:17%">POS ₺</th></tr>
    <tr><td class="ad">Sabit 1</td><td></td><td></td><td></td><td></td></tr>
    <tr><td class="ad">Sabit 2</td><td></td><td></td><td></td><td></td></tr>
    <tr><td class="ad">Havuz</td><td class="yok" style="font-size:8pt;color:#777;text-align:center">isim yazılmaz</td><td></td><td></td><td></td></tr>
  </table>

  <h2>7. NAKİT KASA <small>Sadece eski nakitten ödeme / bankaya yatırma olduysa · giderlere yazmayın</small></h2>
  <table>
    <tr><th>Eski nakitten ödeme — kime / ne için</th><th style="width:26%">Bankaya yatırıldıysa: banka</th><th style="width:17%">Tutar ₺</th></tr>
    <tr><td></td><td></td><td></td></tr>
    <tr><td></td><td></td><td></td></tr>
  </table>
  <table class="nk" style="margin-top:3px">
    <tr><td class="bos"></td><td class="et b" style="width:60%; white-space:nowrap">Kasa sayıldıysa: kasadaki TOPLAM nakit ₺ <small style="font-weight:normal">(isteğe bağlı)</small></td><td class="kutu" style="width:17%"></td></tr>
  </table>

  <h2>8. NOTLAR <small>Nokta koymadan yazın (9413) · kuruş için virgül (12,50) · toplamlar kontrol içindir</small></h2>
  <div class="not"></div>

`;

const kacis = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/** Sayım sayfası. Satır yüksekliği ürün sayısına göre küçülür, tek A4'e sığar. */
export function sayimSayfasi(urunler: KagitUrunu[], periyot: SayimPeriyodu, bosSatir = 3): string {
  const n = urunler.length + bosSatir;
  const yukseklik = Math.max(13, Math.min(27, Math.floor(740 / Math.max(n, 1))));
  const yazi = yukseklik < 16 ? "7pt" : yukseklik < 20 ? "7.5pt" : "8.5pt";
  const satirlar = urunler.map(u =>
    `<tr><td class="no">${u.no}</td><td class="ad" style="font-size:${yazi}">${kacis(u.urun_adi)}</td><td class="br">${kacis(u.birim)}</td><td></td><td></td><td></td><td></td></tr>`).join("\n")
    + Array.from({ length: bosSatir }, () => `<tr><td class="no"></td><td class="ad"></td><td class="br"></td><td></td><td></td><td></td><td></td></tr>`).join("");
  const ad = PERIYOT_ADI[periyot];
  return `<section class="sayfa arka">
  <div class="ust">
    <h1>KEBO <small>${ad} Sayım Listesi</small></h1>
    <div class="alanlar">
      <div>Tarih: <span class="cizgi" style="width:32px"></span> / <span class="cizgi" style="width:32px"></span> / 20<span class="cizgi" style="width:24px"></span></div>
      <div>Sayan: <span class="cizgi" style="width:150px"></span></div>
    </div>
  </div>
  <h2>${ad.toLocaleUpperCase("tr-TR")} SAYILAN ÜRÜNLER <small>Miktarı ürünün birimiyle yazın · gelen mal faturadan otomatik işlenir, buraya yazmayın</small></h2>
  <table class="sayim esit" style="--h:${yukseklik}px">
    <tr><th style="width:5%">No</th><th>Ürün</th><th style="width:6%">Birim</th><th style="width:11.5%">Sabah sayım<br><small>(gün başı)</small></th><th style="width:11.5%">Akşam sayım<br><small>(gün sonu)</small></th><th style="width:9%">Fire<br><small>(bozuk/SKT)</small></th><th style="width:11%">Not</th></tr>
${satirlar}
  </table>
  <div class="kural">Sabah ya da akşam sayımından en az biri yeterlidir. Koli/kova sayıyorsanız birime çevirin (ör. 2 koli tavuk döner = 20 kg).
    Sayılmayan ürünün kutusunu boş bırakın — sıfır yazmayın (0 = stok bitti demektir). Rakamları net yazın; kağıt telefonla taranıp sisteme girilir.</div>
  <h2 style="margin-top:6px">NOTLAR <small>Eksik, bozuk, iade edilen ürünler</small></h2>
  <div class="not"></div>
  <div class="kod">KEBO-SAYIM · ${periyot.toLocaleUpperCase("tr-TR")} · ${urunler.length} ÜRÜN</div>
</section>`;
}

/** Yazdırılacak tam HTML belgesi. kasaFormu=true ise ön yüz kasa formu, arka yüz sayım listesi. */
export function kagitBelgesi(urunler: KagitUrunu[], periyot: SayimPeriyodu, kasaFormu: boolean): string {
  const on = kasaFormu ? `<section class="sayfa on">${ON_YUZ}</section>` : "";
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>KEBO ${kasaFormu ? "Kasa Formu + " : ""}${PERIYOT_ADI[periyot]} Sayım</title><style>${CSS}</style></head><body>${on}${sayimSayfasi(urunler, periyot)}</body></html>`;
}
