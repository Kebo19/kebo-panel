/*
 * Kebo Panel ← Mikro e-Portal fatura aktarımı
 * --------------------------------------------
 * "Kebo'ya aktar" yer imi bu dosyayı Mikro e-Portal sayfasında çalıştırır
 * (yer imi /fiyatlar sayfasında oluşturulur, panel adresini window.KEBO_PANEL'e yazar).
 *
 * 1) Paneli açan pencereye (window.opener) "hazir" der, panel aktarılacak başlangıç tarihini yollar.
 * 2) Kullanıcının kendi Mikro oturumuyla gelen fatura listesini ve her faturanın HTML önizlemesini okur.
 *    Sadece okur: portalın faturayı "okundu" işaretleyen çağrısı yapılmaz.
 * 3) Kalemleri (ürün, miktar, birim fiyat, KDV) panele postMessage ile gönderir; panel veritabanına yazar.
 */
(function () {
  "use strict";
  if (window.__keboAktarim) return;
  window.__keboAktarim = true;

  var PANEL = window.KEBO_PANEL;
  var KAYNAK = "kebo-aktar";

  // ─── Ekrandaki durum kutusu ──────────────────────────────────────────────
  var kutu = document.createElement("div");
  kutu.style.cssText = "position:fixed;z-index:2147483647;right:20px;bottom:20px;width:340px;padding:16px 18px;" +
    "background:#16130d;color:#f3ead7;border:1px solid #d9b866;border-radius:14px;font:13px/1.45 system-ui,sans-serif;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.45)";
  kutu.innerHTML = '<div style="font-weight:700;color:#d9b866;margin-bottom:6px">Kebo Panel · fatura aktarımı</div>' +
    '<div id="kebo-durum">Başlıyor…</div>' +
    '<div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;margin-top:10px;overflow:hidden">' +
    '<div id="kebo-cubuk" style="height:100%;width:0;background:#d9b866;transition:width .2s"></div></div>';
  document.body.appendChild(kutu);
  function durum(metin, oran, hata) {
    var d = document.getElementById("kebo-durum");
    d.textContent = metin;
    d.style.color = hata ? "#fca5a5" : "";
    if (oran != null) document.getElementById("kebo-cubuk").style.width = Math.round(oran * 100) + "%";
  }
  function bitir(metin, hata) {
    durum(metin, 1, hata);
    window.__keboAktarim = false;
    setTimeout(function () { kutu.remove(); }, hata ? 15000 : 6000);
  }

  var panel = window.opener;
  if (!PANEL || !panel || panel.closed) {
    return bitir("Bu pencereyi Kebo Panel → Fiyat Listesi → \"Mikro'dan güncelle\" butonuyla açın, sonra yer imine tekrar tıklayın.", true);
  }
  var eslesme = location.pathname.match(/\/cp\/([0-9a-f-]{36})\//i);
  if (!eslesme) return bitir("Önce Mikro'ya giriş yapıp Gelen e-Faturalar sayfasını açın, sonra yer imine tekrar tıklayın.", true);
  var FIRMA = eslesme[1];

  function panele(mesaj) { mesaj.kaynak = KAYNAK; panel.postMessage(mesaj, PANEL); }

  // ─── Ayrıştırma (supabase/functions/mikro-fiyat-guncelle/ayristir.ts ile aynı kurallar) ─────
  function trSayi(m) {
    var s = String(m == null ? "" : m).replace(/[^\d,.\-]/g, "");
    if (!s) return null;
    var n = s.indexOf(",") >= 0 ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/\.(?=\d{3}(\D|$))/g, ""));
    return isFinite(n) ? n : null;
  }
  function adTemizle(ham) {
    var s = String(ham || "").split(/\\r\\n|\r|\n|Açıklama\s*:/)[0];
    s = s.replace(/[A-ZÇĞİÖŞÜ0-9]{3}20\d{2}\d{9}.*$/, "");
    return s.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
  }
  function birimTemizle(miktarMetni) {
    var s = String(miktarMetni || "").replace(/\\r\\n/g, " ").replace(/[\d.,]/g, " ").replace(/\s+/g, " ").trim();
    return s ? s.toLocaleUpperCase("tr-TR").slice(0, 12) : null;
  }
  var AD = /^(mal\s*\/\s*hizmet|mal hizmet|malzeme\s*\/\s*hizmet açıklaması|ürün adı)$/i;
  function kalemleriOku(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    // Bazı faturalarda (ör. HKS) kalem tablosu başka tabloların içinde: en içteki uygun tabloyu seç.
    var tablo = null;
    Array.prototype.forEach.call(doc.querySelectorAll("table"), function (t) {
      var m = t.textContent || "";
      if (/Miktar/.test(m) && /Birim Fiyat/.test(m) && (!tablo || m.length < (tablo.textContent || "").length)) tablo = t;
    });
    if (!tablo) return [];
    var tumSatirlar = Array.prototype.slice.call(tablo.querySelectorAll("tr"));
    var bas = -1;
    for (var b = 0; b < tumSatirlar.length; b++) if (/Birim Fiyat/.test(tumSatirlar[b].textContent || "")) { bas = b; break; }
    if (bas < 0) return [];
    var satirlar = tumSatirlar.slice(bas);
    if (satirlar.length < 2) return [];
    var baslik = Array.prototype.map.call(satirlar[0].querySelectorAll("th,td"), function (h) { return (h.textContent || "").replace(/\s+/g, " ").trim(); });
    var bul = function (re) { for (var i = 0; i < baslik.length; i++) if (re.test(baslik[i])) return i; return -1; };
    var iAd = bul(AD), iMiktar = bul(/^Miktar/i), iFiyat = bul(/Birim Fiyat/i), iKdv = bul(/KDV Oran/i),
        iIsk = bul(/İskonto Oran/i), iTutar = bul(/(Mal Hizmet|Malzeme \/ Hizmet) Tutarı|^Tutar$/i),
        iBirim = bul(/^Birim$/i); // HKS faturalarında birim ayrı sütunda
    if (iAd < 0 || iFiyat < 0) return [];
    var kalemler = [];
    for (var r = 1; r < satirlar.length; r++) {
      var h = Array.prototype.map.call(satirlar[r].querySelectorAll("td"), function (c) { return c.textContent || ""; });
      if (h.length <= Math.max(iAd, iFiyat)) continue;
      var ad = adTemizle(h[iAd]), fiyat = trSayi(h[iFiyat]);
      if (!ad || fiyat == null) continue;
      kalemler.push({
        sira: kalemler.length + 1, urun_adi: ad, ham_ad: h[iAd].trim().slice(0, 300),
        miktar: iMiktar >= 0 ? trSayi(h[iMiktar]) : null, birim: iBirim >= 0 ? birimTemizle(h[iBirim]) : iMiktar >= 0 ? birimTemizle(h[iMiktar]) : null,
        birim_fiyat: fiyat, kdv_orani: iKdv >= 0 ? (trSayi(h[iKdv]) || 0) : 0,
        iskonto_orani: iIsk >= 0 ? trSayi(h[iIsk]) : null, tutar: iTutar >= 0 ? trSayi(h[iTutar]) : null,
      });
    }
    return kalemler;
  }

  // ─── Mikro'dan okuma ─────────────────────────────────────────────────────
  var KOK = "/cp/" + FIRMA + "//inbox/";
  function getJSON(yol) {
    return fetch(yol, { credentials: "include", headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function liste(baslangic, bitis) {
    var tum = [];
    function sayfa(n) {
      var q = new URLSearchParams({
        FlagStatus: "All", cancelledStatus: "All", filterDateType: "DocumentDate",
        firstDate: baslangic.toISOString(), lastDate: bitis.toISOString(), folder: "", gibNumber: "", invoiceCurrency: "All",
        invoiceProfilesFilter: "TUMU", invoiceTypeCodesFilter: "TUMU", maxAmount: "", minAmount: "", readingState: "All",
        recordPerPage: "100", sortColumn: "", sortOrder: "", state: "Hepsi", taxNumber: "", titleMatchType: "StartsWith",
        titleValue: "", page: String(n),
      });
      return getJSON(KOK + "GetIncomingInvoiceList?" + q).then(function (j) {
        if (!j || !j.incomingInvoices) throw new Error("Fatura listesi okunamadı. Mikro oturumunuz kapanmış olabilir.");
        tum = tum.concat(j.incomingInvoices);
        durum("Fatura listesi okunuyor… " + tum.length, 0.05);
        return j.incomingInvoices.length === 100 && n < 30 ? sayfa(n + 1) : tum;
      });
    }
    return sayfa(1);
  }

  function aktar(baslangicTarihi) {
    var bas = new Date(baslangicTarihi + "T00:00:00+03:00"), bit = new Date(Date.now() + 86400000);
    return liste(bas, bit).then(function (faturalar) {
      faturalar = faturalar.filter(function (f) { return !f.CancelationReason; });
      var sonuc = [], i = 0, hatali = 0;
      durum(faturalar.length + " fatura bulundu, kalemler okunuyor…", 0.1);
      function isci() {
        if (i >= faturalar.length) return Promise.resolve();
        var f = faturalar[i++];
        return fetch(KOK + "GetDocumentAsHtml?id=" + encodeURIComponent(f.Id), { credentials: "include" })
          .then(function (r) { return r.ok ? r.text() : ""; })
          .then(function (html) {
            var kalemler = html ? kalemleriOku(html) : [];
            if (!html) hatali++;
            sonuc.push({
              gib_no: f.FormattedGibNumber, mikro_id: f.Id, vkn: f.UserTaxIdentification, tedarikci: f.UserTitle,
              tarih: String((f.Header && f.Header.DocumentDate) || "").slice(0, 10), tip: f.InvoiceTypeCode,
              toplam: f.SubTotals && f.SubTotals.PayableAmount != null ? f.SubTotals.PayableAmount : null, kalemler: kalemler,
            });
            durum("Faturalar okunuyor… " + sonuc.length + " / " + faturalar.length, 0.1 + 0.8 * sonuc.length / Math.max(1, faturalar.length));
            panele({ tip: "ilerleme", okunan: sonuc.length, toplam: faturalar.length });
          })
          .catch(function () { hatali++; })
          .then(isci);
      }
      var isciler = [];
      for (var k = 0; k < 5; k++) isciler.push(isci());
      return Promise.all(isciler).then(function () {
        sonuc = sonuc.filter(function (f) { return f.gib_no && f.tarih; });
        durum("Panele gönderiliyor… (" + sonuc.length + " fatura)", 0.92);
        panele({ tip: "veri", faturalar: sonuc, hatali: hatali, baslangic: baslangicTarihi });
      });
    });
  }

  // ─── Panelle konuşma ─────────────────────────────────────────────────────
  var zamanAsimi = setTimeout(function () {
    bitir("Panel cevap vermedi. Fiyat Listesi sayfasının açık olduğundan emin olup butona tekrar basın.", true);
  }, 15000);
  window.addEventListener("message", function (e) {
    if (e.origin !== PANEL || e.source !== panel || !e.data || e.data.kaynak !== "kebo-panel") return;
    var m = e.data;
    if (m.tip === "ayar") {
      clearTimeout(zamanAsimi);
      durum("Faturalar " + m.baslangic + " tarihinden itibaren okunacak…", 0.02);
      aktar(m.baslangic).catch(function (err) {
        panele({ tip: "hata", mesaj: String(err && err.message || err) });
        bitir("Hata: " + (err && err.message || err), true);
      });
    } else if (m.tip === "kaydedildi") {
      bitir("Tamam. " + (m.mesaj || "") + " Bu pencereyi kapatabilirsiniz.", false);
      setTimeout(function () { try { window.close(); } catch (_) { /* yoksay */ } }, 4000);
    } else if (m.tip === "hata") {
      bitir("Panel kaydedemedi: " + m.mesaj, true);
    }
  });
  durum("Panel bekleniyor…", 0.01);
  panele({ tip: "hazir", firma: FIRMA });
})();
