// ─── KEBO MİKRO ROBOTU ─────────────────────────────────────────────────────────
// Dükkân bilgisayarında her gün (Görev Zamanlayıcı, 11:15 ve oturum açılınca) çalışır:
//   1) Bilgisayardaki Google Chrome'u bu robota ayrılmış bir profille açar (Mikro oturumu bu profilde kalır).
//   2) Mikro e-Portal → Gelen e-Faturalar'a girer. Oturum kapanmışsa kayıtlı kullanıcıyla yeniden giriş yapmayı dener.
//   3) Panelin istediği tarihten bu yana gelen faturaları ve kalemlerini okur (Fiyat Listesi'ndeki "Kebo'ya aktar"
//      yer imiyle aynı kurallar; faturalar sadece okunur, "okundu" işaretlenmez).
//   4) Panele gönderir: faturalar carilere işlenir, stok fiyatları güncellenir. Sonuç panelde Fiyat Listesi'nde görünür.
// Mikro, sunuculardan (Vercel/Supabase) gelen girişleri engellediği için bu iş dükkânın kendi bilgisayarından yapılır.
//
// ROKET (29.10.2026): Aynı çalışmada Roket Adisyon'dan (Roadrunner kurye sistemi) son 7 günün Paket Raporu
// Excel'i indirilir, BU BİLGİSAYARDA okunur (roket-oku.mjs = panelin lib/roket.ts'i) ve panele sadece
// günlük kurye özetleri gönderilir; müşteri adı / telefon / adres gönderilmez, indirilen dosya hemen silinir.
// Roket de sunucudan girişe izin vermiyor (görünmez robot doğrulaması); bu yüzden dükkânın kendi Chrome'u kullanılır.
//
// Kullanım:  node robot.mjs --bekle   → Görev Zamanlayıcı 5 dakikada bir çağırır: panele "buradayım" der;
//                                       panelden/Telegram'dan "Mikro'dan çek" istenmişse hemen çalışır,
//                                       istenmemişse saat 11:00'den sonra günde bir kez çalışır. Yoksa hemen çıkar.
//            node robot.mjs            → günlük aktarım (bugün başarıyla çalıştıysa tekrar çalışmaz)
//            node robot.mjs --zorla    → bugün çalışmış olsa da çalıştır
//            node robot.mjs --kurulum  → Chrome'u açar, Mikro'ya ve Roket'e bir kez elle giriş yapılır (oturumlar kaydedilir)
//            node robot.mjs --roket    → sadece Roket raporunu çek (deneme için)
//            node robot.mjs --dinle    → oturum açılınca başlar, hep açık kalır: kasa raporunda "Roket'ten çek"e
//                                       basılınca 10 saniye içinde o günün raporunu Roket'ten çeker.
//                                       Bu, Roket'e giriş yapılmış her bilgisayarda (dükkân, ev) çalışabilir.
//            node robot.mjs --kurulum --sadece-roket → Mikro'suz kurulum (sadece Roket'e giriş)

import { chromium } from "playwright-core";
import xlsx from "xlsx";
import { roketExcelOku, varsayilanAtama, atamaBul } from "./roket-oku.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, statSync, unlinkSync, cpSync } from "node:fs";
import { hostname } from "node:os";
import { createServer, connect } from "node:net";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const KLASOR = dirname(fileURLToPath(import.meta.url));
const VERI = join(process.env.LOCALAPPDATA || KLASOR, "kebo-mikro-robot");
mkdirSync(VERI, { recursive: true });
const LOG = join(VERI, "robot.log");
const SON_CALISMA = join(VERI, "son-basarili.txt");
const KIMLIK = join(VERI, "mikro-kimlik.txt"); // Windows DPAPI ile şifreli (sadece bu Windows kullanıcısı çözebilir)
const PROFIL = join(VERI, "chrome-profil");
const ROKET_PROFIL = join(VERI, "roket-profil"); // Roket ayrı profilde: dinleyici tarayıcıyı hep açık tutar, Mikro'yu engellemez
const DINLE_PORT = 47613;                        // aynı bilgisayarda tek dinleyici + "dur" komutu
const KILIT = join(VERI, "calisiyor.kilit");   // aynı anda iki robot çalışmasın
const SON_HATA = join(VERI, "son-hata.txt");    // günlük çalışma hata verdiyse 1 saat sonra tekrar dener

const MIKRO = process.env.KEBO_MIKRO_ADRES || "https://eportal.mikrogrup.com"; // ortam değişkeni sadece test içindir
const FIRMA = "9351d4b5-c397-48da-a383-d9da89b5dc9d"; // BCM Restoran firma kodu (lib/fiyatListesi.ts ile aynı)
const GELEN = `${MIKRO}/cp/${FIRMA}/inbox/newinbox`;
const ROKET = "https://www.roketadisyon.com/RoketAdisyon";
const ROKET_GUN = 7; // her çalışmada son kaç gün yeniden çekilir (Roket'te sonradan yapılan düzeltmeler de gelsin)

const argv = new Set(process.argv.slice(2));
const log = (m) => { const s = `${new Date().toLocaleString("tr-TR")}  ${m}`; console.log(s); appendFileSync(LOG, s + "\n"); };
const bugun = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

function ayarOku() {
  const yol = join(KLASOR, "ayar.json");
  if (!existsSync(yol)) throw new Error(`ayar.json bulunamadı (${yol}). Kurulum dosyasını tekrar çalıştırın.`);
  const a = JSON.parse(readFileSync(yol, "utf8"));
  for (const k of ["supabaseUrl", "anonKey", "anahtar"]) if (!a[k]) throw new Error(`ayar.json içinde "${k}" eksik.`);
  return a;
}

async function rpc(ayar, ad, govde) {
  const r = await fetch(`${ayar.supabaseUrl}/rest/v1/rpc/${ad}`, {
    method: "POST",
    headers: { apikey: ayar.anonKey, Authorization: `Bearer ${ayar.anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(govde),
  });
  const metin = await r.text();
  if (!r.ok) throw new Error(`Panel ${ad}: HTTP ${r.status} ${metin.slice(0, 300)}`);
  return metin ? JSON.parse(metin) : null;
}

/** Kayıtlı Mikro kullanıcı adı / parolası (kurulumda DPAPI ile şifrelenip saklanır). */
function kimlikOku() {
  if (!existsSync(KIMLIK)) return null;
  try {
    const ps = `$s = Get-Content -Raw '${KIMLIK.replace(/'/g, "''")}' | ConvertFrom-Json;` +
      `$p = $s.parola | ConvertTo-SecureString;` +
      `$d = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p));` +
      `@{ eposta = $s.eposta; parola = $d } | ConvertTo-Json -Compress`;
    return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
  } catch (e) {
    log("Kayıtlı Mikro kullanıcısı okunamadı: " + (e.message || e));
    return null;
  }
}

/** Roket profili yoksa (eski kurulum) Roket oturumunun bulunduğu eski ortak profilden bir kez kopyalanır. */
function roketProfilHazirla() {
  if (existsSync(ROKET_PROFIL) || !existsSync(PROFIL)) return;
  try {
    cpSync(PROFIL, ROKET_PROFIL, { recursive: true, filter: (y) => !/(Singleton\w*|lockfile|LOCK)$/i.test(y) });
    log("Roket oturumu yeni Roket profiline taşındı.");
  } catch (e) { log("Roket profili kopyalanamadı: " + (e?.message || e)); }
}

async function tarayiciAc(gorunur, profil = PROFIL) {
  if (profil === ROKET_PROFIL) roketProfilHazirla();
  // Roket'in ekran yazıları Türkçe aranır (Tamam, Önceki ay…): tarayıcı Türkçe açılır.
  // Görünmez çalışmada pencere ekranın dışında açılır (gerçek tarayıcı; Roket'in robot doğrulaması etkilenmez).
  const ortak = { headless: false, chromiumSandbox: true, viewport: { width: 1280, height: 860 }, locale: "tr-TR", acceptDownloads: true,
    args: gorunur ? ["--lang=tr-TR"] : ["--window-position=-32000,-32000", "--lang=tr-TR"] };
  for (const channel of ["chrome", "msedge"]) {
    try { return await chromium.launchPersistentContext(profil, { ...ortak, channel }); }
    catch (e) { log(`${channel} açılamadı: ${String(e.message || e).split("\n")[0]}`); }
  }
  throw new Error("Bu bilgisayarda Google Chrome ya da Microsoft Edge bulunamadı.");
}

const mikrodaMi = (url) => url.includes(`/cp/${FIRMA}/`);

/** Giriş sayfasındaysa kayıtlı kullanıcıyla giriş yapmayı dener. */
async function girisYap(sayfa) {
  const k = kimlikOku();
  if (!k?.eposta || !k?.parola) return false;
  log("Mikro oturumu kapalı, kayıtlı kullanıcıyla giriş deneniyor…");
  const eposta = sayfa.locator('input[type="email"], input[name*="mail" i], input[name*="user" i], input[id*="mail" i], input[id*="user" i]').first();
  const parola = sayfa.locator('input[type="password"]').first();
  await eposta.waitFor({ timeout: 20000 });
  await eposta.fill(k.eposta);
  await parola.fill(k.parola);
  await parola.press("Enter");
  await sayfa.waitForURL((u) => mikrodaMi(String(u)), { timeout: 45000 }).catch(() => {});
  if (!mikrodaMi(sayfa.url())) await sayfa.goto(GELEN, { waitUntil: "domcontentloaded" }).catch(() => {});
  return mikrodaMi(sayfa.url());
}

/** Mikro sayfasının içinde, kullanıcının oturumuyla çalışır (public/kebo-aktar.js ile aynı okuma kuralları). */
async function faturalariOku(sayfa, baslangic) {
  return sayfa.evaluate(async ({ baslangic, firma }) => {
    const trSayi = (m) => {
      const s = String(m == null ? "" : m).replace(/[^\d,.\-]/g, "");
      if (!s) return null;
      const n = s.indexOf(",") >= 0 ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/\.(?=\d{3}(\D|$))/g, ""));
      return isFinite(n) ? n : null;
    };
    const adTemizle = (ham) => {
      let s = String(ham || "").split(/\\r\\n|\r|\n|Açıklama\s*:/)[0];
      s = s.replace(/[A-ZÇĞİÖŞÜ0-9]{3}20\d{2}\d{9}.*$/, "");
      return s.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
    };
    const birimTemizle = (m) => { const s = String(m || "").replace(/\\r\\n/g, " ").replace(/[\d.,]/g, " ").replace(/\s+/g, " ").trim(); return s ? s.toLocaleUpperCase("tr-TR").slice(0, 12) : null; };
    const AD = /^(mal\s*\/\s*hizmet|mal hizmet|malzeme\s*\/\s*hizmet(\s*açıklaması)?|ürün adı)$/i;
    const kalemleriOku = (html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      let tablo = null;
      doc.querySelectorAll("table").forEach((t) => { const m = t.textContent || ""; if (/Miktar/.test(m) && /Birim Fiyat/.test(m) && (!tablo || m.length < (tablo.textContent || "").length)) tablo = t; });
      if (!tablo) return [];
      const tum = [...tablo.querySelectorAll("tr")];
      const bas = tum.findIndex((tr) => /Birim Fiyat/.test(tr.textContent || ""));
      if (bas < 0) return [];
      const satirlar = tum.slice(bas);
      if (satirlar.length < 2) return [];
      const hucreler = (tr, sec) => { const s = []; tr.querySelectorAll(sec).forEach((c) => { const n = Math.max(1, Math.min(10, parseInt(c.getAttribute("colspan") || "1", 10) || 1)); s.push(c.textContent || ""); for (let i = 1; i < n; i++) s.push(""); }); return s; };
      const baslik = hucreler(satirlar[0], "th,td").map((h) => h.replace(/\s+/g, " ").trim());
      const bul = (re) => baslik.findIndex((h) => re.test(h));
      const iAd = bul(AD), iMiktar = bul(/^Miktar/i), iFiyat = bul(/Birim Fiyat/i), iKdv = bul(/KDV Oran/i),
        iIsk = bul(/İskonto Oran/i), iTutar = bul(/(Mal Hizmet|Malzeme \/ Hizmet) Tutarı|^Tutar$/i), iBirim = bul(/^Birim$/i);
      if (iAd < 0 || iFiyat < 0) return [];
      const k = [];
      for (let r = 1; r < satirlar.length; r++) {
        const h = hucreler(satirlar[r], "td");
        if (h.length <= Math.max(iAd, iFiyat)) continue;
        const ad = adTemizle(h[iAd]), fiyat = trSayi(h[iFiyat]);
        if (!ad || fiyat == null) continue;
        k.push({ sira: k.length + 1, urun_adi: ad, ham_ad: h[iAd].trim().slice(0, 300),
          miktar: iMiktar >= 0 ? trSayi(h[iMiktar]) : null, birim: iBirim >= 0 ? birimTemizle(h[iBirim]) : iMiktar >= 0 ? birimTemizle(h[iMiktar]) : null,
          birim_fiyat: fiyat, kdv_orani: iKdv >= 0 ? (trSayi(h[iKdv]) || 0) : 0, iskonto_orani: iIsk >= 0 ? trSayi(h[iIsk]) : null, tutar: iTutar >= 0 ? trSayi(h[iTutar]) : null });
      }
      return k;
    };
    const KOK = `/cp/${firma}//inbox/`;
    const getJSON = async (yol) => { const r = await fetch(yol, { credentials: "include", headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
    const bas = new Date(baslangic + "T00:00:00+03:00"), bit = new Date(Date.now() + 86400000);
    let tum = [];
    for (let n = 1; n <= 30; n++) {
      const q = new URLSearchParams({ FlagStatus: "All", cancelledStatus: "All", filterDateType: "DocumentDate", firstDate: bas.toISOString(), lastDate: bit.toISOString(),
        folder: "", gibNumber: "", invoiceCurrency: "All", invoiceProfilesFilter: "TUMU", invoiceTypeCodesFilter: "TUMU", maxAmount: "", minAmount: "", readingState: "All",
        recordPerPage: "100", sortColumn: "", sortOrder: "", state: "Hepsi", taxNumber: "", titleMatchType: "StartsWith", titleValue: "", page: String(n) });
      const j = await getJSON(KOK + "GetIncomingInvoiceList?" + q);
      if (!j || !j.incomingInvoices) throw new Error("Fatura listesi okunamadı (Mikro oturumu kapanmış olabilir).");
      tum = tum.concat(j.incomingInvoices);
      if (j.incomingInvoices.length < 100) break;
    }
    tum = tum.filter((f) => !f.CancelationReason);
    const sonuc = []; let i = 0, hatali = 0;
    const isci = async () => {
      while (i < tum.length) {
        const f = tum[i++];
        try {
          const r = await fetch(KOK + "GetDocumentAsHtml?id=" + encodeURIComponent(f.Id), { credentials: "include" });
          let html = r.ok ? await r.text() : "";
          // Mikro önizlemeyi {"success":true,"html":"..."} olarak döndürüyor: içindeki HTML'i al.
          try { const o = JSON.parse(html); if (o && typeof o.html === "string") html = o.html; } catch { /* düz HTML */ }
          if (!html) hatali++;
          sonuc.push({ gib_no: f.FormattedGibNumber, mikro_id: f.Id, vkn: f.UserTaxIdentification, tedarikci: f.UserTitle,
            tarih: String((f.Header && f.Header.DocumentDate) || "").slice(0, 10), tip: f.InvoiceTypeCode,
            toplam: f.SubTotals && f.SubTotals.PayableAmount != null ? f.SubTotals.PayableAmount : null, kalemler: html ? kalemleriOku(html) : [] });
        } catch { hatali++; }
      }
    };
    await Promise.all([isci(), isci(), isci(), isci()]);
    return { faturalar: sonuc.filter((f) => f.gib_no && f.tarih), hatali, toplam: tum.length };
  }, { baslangic, firma: FIRMA });
}

// ─── ROKET ─────────────────────────────────────────────────────────────────────
// Roket Adisyon bir Flutter uygulaması: ekran çizim olarak gelir. Erişilebilirlik (ekran okuyucu) katmanı
// açılınca her düğme ve yazı <flt-semantics> olarak görünür; robot düğmeleri bu yazılarla bulur.
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

async function roketEtiketler(sayfa) {
  return sayfa.evaluate(() => [...document.querySelectorAll("flt-semantics")].map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim()));
}

/** Erişilebilirlik katmanını açar ve uygulamanın yüklenmesini bekler. Giriş ekranındaysa false. */
async function roketHazirla(sayfa, sure = 90000) {
  const bas = Date.now();
  while (Date.now() - bas < sure) {
    const d = await sayfa.evaluate(() => {
      const p = document.querySelector("flt-semantics-placeholder");
      if (p) p.click();
      const et = [...document.querySelectorAll("flt-semantics")].map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim());
      // Dar ekranda "Menü" düğmesi, geniş ekranda sol menü (Kontrol Paneli, Paket Raporu, Çıkış Yap) görünür
      const menu = et.some((t) => t === "Menü" || /Paket Raporu|Çıkış Yap|Kontrol Paneli/.test(t));
      return { menu, giris: !!document.querySelector('input[type="password"]') || et.some((t) => /^Giriş yap$/.test(t)) };
    }).catch(() => ({ menu: false, giris: false }));
    if (d.giris) return false;
    if (d.menu) return true;
    await sayfa.waitForTimeout(1500);
  }
  throw new Error("Roket Adisyon açılmadı (internet bağlantısını kontrol edin).");
}

/** Yazısı tam (ya da düzenli ifadeyle) eşleşen ilk düğmeye tıklar; çıkana kadar bekler. */
async function roketTikla(sayfa, aranan, { duzenli = false, sure = 20000 } = {}) {
  const bas = Date.now();
  while (Date.now() - bas < sure) {
    const ok = await sayfa.evaluate(({ aranan, duzenli }) => {
      const re = duzenli ? new RegExp(aranan) : null;
      const e = [...document.querySelectorAll("flt-semantics")].find((x) => {
        const t = (x.getAttribute("aria-label") || x.textContent || "").trim();
        return re ? re.test(t) : t === aranan;
      });
      if (!e) return false;
      e.click();
      return true;
    }, { aranan, duzenli });
    if (ok) { await sayfa.waitForTimeout(350); return; }
    await sayfa.waitForTimeout(250);
  }
  throw new Error(`Roket ekranında "${aranan}" bulunamadı (Roket'in ekranı değişmiş olabilir).`);
}

/** Açık tarih seçicide günü seçer (gerekirse önceki aya geçer), sonra tarih ve saat için "Tamam". */
async function roketTarihSec(sayfa, iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const ay = `${AYLAR[m - 1]} ${y}`;
  const hedef = y * 12 + (m - 1);
  for (let i = 0; i < 25; i++) {
    const baslik = (await roketEtiketler(sayfa)).find((t) => t.startsWith("Yılı seçin"));
    if (!baslik || baslik.includes(ay)) break;
    // Başlıktaki ayı bul ("… Eylül 2026"); hedeften sonraysa geri, önceyse ileri git
    const bul = AYLAR.map((a, j) => { const r = new RegExp(`${a} (\\d{4})`).exec(baslik); return r ? Number(r[1]) * 12 + j : null; }).find((x) => x !== null);
    await roketTikla(sayfa, bul != null && bul < hedef ? "Sonraki ay" : "Önceki ay");
  }
  await roketTikla(sayfa, `^${d}, ${d} ${AYLAR[m - 1]} ${y}`, { duzenli: true });
  await roketTikla(sayfa, "Tamam");      // tarih
  await roketTikla(sayfa, "Tamam");      // saat (o anki saat kalır)
}

/** Sayfayı Roket → Paket Raporu ekranına getirir (zaten oradaysa hiçbir şey yapmaz). */
async function roketPaketSayfasi(sayfa) {
  const paketEkrani = () => sayfa.evaluate(() => {
    document.querySelector("flt-semantics-placeholder")?.click();
    return [...document.querySelectorAll("input")].some((e) => (e.getAttribute("aria-label") || "").includes("Başlangıç"));
  }).catch(() => false);
  if (sayfa.url().includes("roketadisyon") && await paketEkrani()) return;
  await sayfa.goto(ROKET, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!(await roketHazirla(sayfa))) {
    throw new Error("Roket oturumu kapalı. Masaüstündeki \"Kebo robotu - giriş\" kısayoluyla Roket'e bir kez giriş yapın.");
  }
  // (Menü →) Raporlama → Paket Raporu. Geniş ekranda sol menü hep açık, dar ekranda "Menü" düğmesi var.
  const var_ = async (re) => (await roketEtiketler(sayfa)).some((t) => re.test(t));
  if (!(await var_(/^Paket Raporu$/)) && !(await var_(/^Raporlama$/))) await roketTikla(sayfa, "Menü");
  if (!(await var_(/^Paket Raporu$/))) await roketTikla(sayfa, "Raporlama");
  await roketTikla(sayfa, "Paket Raporu");
  for (let i = 0; i < 40 && !(await paketEkrani()); i++) await sayfa.waitForTimeout(250);
}

/** Roket'ten Paket Raporu'nu indirir, okur, panele gönderir (tarih yoksa son ROKET_GUN gün). Sonuç mesajını döner.
 *  hazirSayfa verilirse (dinleyicinin hep açık sayfası) o kullanılır ve kapatılmaz. */
async function roketAktar(tarayici, ayar, { tarih = null, hazirSayfa = null } = {}) {
  const sayfa = hazirSayfa || await tarayici.newPage();
  const dosya = join(VERI, "roket-paket-raporu.xlsx");
  try {
    await roketPaketSayfasi(sayfa);

    // Roket'in tarih seçicisinde saat o anki saat kalır; bu yüzden istenen günün bir gün öncesinden bir gün
    // sonrasına kadar çekilir ve sadece istenen iş günü (09:45–23:59 dahil bütün gün) alınır.
    const gunEkle = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
    const bugunIso = tarih ? [gunEkle(tarih, 1), bugun()].sort()[0] : bugun();
    const basIso = tarih ? gunEkle(tarih, -1) : gunEkle(bugunIso, -ROKET_GUN);
    // Başlangıç tarihi kutusu gerçek bir <input>: fareyle tıklanınca tarih seçici açılır
    const kutu = async (ad) => {
      const r = await sayfa.evaluate((ad) => {
        const i = [...document.querySelectorAll("input")].find((e) => (e.getAttribute("aria-label") || "").includes(ad));
        if (!i) return null;
        const b = i.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }, ad);
      if (!r) throw new Error(`Roket Paket Raporu'nda "${ad}" kutusu bulunamadı.`);
      await sayfa.mouse.click(r.x, r.y);
      await sayfa.waitForTimeout(400);
    };
    await kutu("Başlangıç");
    await roketTarihSec(sayfa, basIso);
    await sayfa.waitForTimeout(400);
    // Bitiş seçicisi genelde kendiliğinden açılır; açılmadıysa kutuya tıkla
    if (!(await roketEtiketler(sayfa)).some((t) => t.startsWith("Tarih seçin"))) await kutu("Bitiş");
    await roketTarihSec(sayfa, bugunIso);

    const toplamYazisi = async () => (await roketEtiketler(sayfa)).find((x) => /^Toplam Paket: \d+/.test(x)) || "";
    const eskiYazi = await toplamYazisi();   // açık kalan sayfada önceki sorgunun sonucu
    await roketTikla(sayfa, "Filtrele");
    // "Toplam Paket: N" yazısı değişip 1,5 saniye sabit kalana kadar bekle (veriler canlı geliyor).
    // Yazı değişmezse (iki sorgunun paket sayısı aynıysa) en az 3 saniye beklenir.
    const filtreBas = Date.now();
    let onceki = "", ayni = 0, degisti = !eskiYazi;
    for (let i = 0; i < 80 && !(ayni >= 3 && (degisti || Date.now() - filtreBas > 3000)); i++) {
      await sayfa.waitForTimeout(500);
      const t = await toplamYazisi();
      if (t && t !== eskiYazi) degisti = true;
      ayni = t && t === onceki ? ayni + 1 : 0;
      onceki = t;
    }
    log(`Roket: ${basIso} – ${bugunIso} ${onceki || "(paket sayısı okunamadı)"}`);

    const [indirme] = await Promise.all([
      sayfa.waitForEvent("download", { timeout: 60000 }),
      roketTikla(sayfa, "Excel olarak indir"),
    ]);
    await indirme.saveAs(dosya);
    const wb = xlsx.read(readFileSync(dosya), { type: "buffer" });
    const satirlar = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null, blankrows: false });
    const okuma = roketExcelOku(satirlar);
    // İlk gün yarım (başlangıç saati o anki saat) → gönderilmez; bugün yarım ama gönderilir, yarın düzelir.
    const gunler = okuma.gunler.filter((g) => tarih ? g.tarih === tarih : g.tarih > basIso);
    if (!gunler.length) return tarih ? `Roket: ${tarih.split("-").reverse().join(".")} için teslim edilmiş paket yok.` : "Roket: bu aralıkta teslim edilmiş paket yok.";

    // Sabit kurye seçimleri: aynı gün daha önce seçildiyse korunur; yoksa bir önceki günün sabitleri.
    const { mevcut = {}, onceki: oncekiGun = null } = await rpc(ayar, "roket_pc_atamalar",
      { p_anahtar: ayar.anahtar, p_bas: gunler[0].tarih, p_bit: gunler[gunler.length - 1].tarih }) || {};
    const sabitAdlari = (g) => g ? {
      s1: g.kuryeler.filter((k) => atamaBul(g, k) === "s1").map((k) => k.ad),
      s2: g.kuryeler.filter((k) => atamaBul(g, k) === "s2").map((k) => k.ad),
    } : {};
    let ref = sabitAdlari(oncekiGun);
    const gonder = gunler.map((g) => {
      const eski = mevcut[g.tarih];
      const kuryeler = varsayilanAtama(g.kuryeler, eski ? sabitAdlari(eski) : ref).map((k) => {
        const e = eski?.kuryeler?.find((x) => x.ad === k.ad);
        return e ? { ...k, atama: atamaBul(eski, e) } : k;
      });
      const yeni = { ...g, kuryeler };
      ref = sabitAdlari(yeni);
      return yeni;
    });
    const n = await rpc(ayar, "roket_pc_yukle", { p_anahtar: ayar.anahtar, p_gunler: gonder });
    const paket = gonder.reduce((t, g) => t + g.toplamPaket, 0);
    return `Roket: ${n} gün güncellendi (${paket} paket).${okuma.uyari.length ? " " + okuma.uyari.join(" ") : ""}`;
  } finally {
    try { unlinkSync(dosya); } catch { /* yok */ }   // müşteri bilgisi içeren dosya bilgisayarda kalmasın
    if (!hazirSayfa) await sayfa.close().catch(() => {});
  }
}

async function kurulum() {
  if (argv.has("--sadece-roket")) return roketKurulum();
  log("Kurulum: Chrome açılıyor. Mikro'ya giriş yapın, Gelen e-Faturalar sayfası açılınca bu pencere kendiliğinden kapanır.");
  const tarayici = await tarayiciAc(true);
  const sayfa = tarayici.pages()[0] || await tarayici.newPage();
  await sayfa.goto(GELEN, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sayfa.waitForURL((u) => mikrodaMi(String(u)), { timeout: 10 * 60 * 1000 });
  await sayfa.waitForTimeout(3000);
  log("Mikro oturumu kaydedildi.");
  await tarayici.close();
  return roketKurulum();
}

const dinleyiciAcikMi = () => new Promise((ok) => {
  const c = connect(DINLE_PORT, "127.0.0.1", () => { c.end(); ok(true); });
  c.on("error", () => ok(false));
});

/** Bu bilgisayarda çalışan dinleyiciye "dur" der (Roket profili boşalsın diye). Görev Zamanlayıcı 5 dk içinde yeniden açar. */
async function dinleyiciyiDurdur() {
  const vardi = await new Promise((ok) => {
    const c = connect(DINLE_PORT, "127.0.0.1", () => { c.end("dur\n"); ok(true); });
    c.on("error", () => ok(false));
  });
  if (vardi) await new Promise((r) => setTimeout(r, 4000));
}

/** Sadece Roket'e giriş (Mikro'suz bilgisayarlar, ör. ev bilgisayarı). */
async function roketKurulum() {
  await dinleyiciyiDurdur();
  log("Kurulum: Roket Adisyon açılıyor. Roket'e giriş yapın; Kontrol Paneli açılınca pencere kendiliğinden kapanır.");
  const tarayici = await tarayiciAc(true, ROKET_PROFIL);
  const sayfa = tarayici.pages()[0] || await tarayici.newPage();
  await sayfa.goto(ROKET, { waitUntil: "domcontentloaded" }).catch(() => {});
  const bas = Date.now();
  while (Date.now() - bas < 10 * 60 * 1000) {
    if (await roketHazirla(sayfa, 15000).catch(() => false)) break;
    await sayfa.waitForTimeout(2000);
  }
  await sayfa.waitForTimeout(3000);
  log("Roket oturumu kaydedildi.");
  await tarayici.close();
}

async function sadeceRoket() {
  const ayar = ayarOku();
  await dinleyiciyiDurdur();
  const tarayici = await tarayiciAc(false, ROKET_PROFIL);
  try { log(await roketAktar(tarayici, ayar)); }
  catch (e) { log("HATA: Roket: " + (e?.message || e)); process.exitCode = 1; }
  finally { await tarayici.close().catch(() => {}); }
}

const bugunCalisti = () => existsSync(SON_CALISMA) && readFileSync(SON_CALISMA, "utf8").trim() === bugun();

async function aktarim({ zorla = argv.has("--zorla"), talep = null } = {}) {
  if (!zorla && bugunCalisti()) { log("Bugün zaten başarıyla çalıştı, atlanıyor."); return; }
  const ayar = ayarOku();
  let tarayici;
  try {
    const baslangic = await rpc(ayar, "mikro_pc_baslangic", { p_anahtar: ayar.anahtar });
    log(`Faturalar ${baslangic} tarihinden itibaren okunacak.`);
    tarayici = await tarayiciAc(false);
    const sayfa = tarayici.pages()[0] || await tarayici.newPage();
    await sayfa.goto(GELEN, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sayfa.waitForTimeout(4000);
    if (!mikrodaMi(sayfa.url()) && !(await girisYap(sayfa))) {
      throw new Error("Mikro oturumu kapalı ve otomatik giriş yapılamadı. Masaüstündeki \"Kebo robotu - giriş\" kısayoluyla bir kez giriş yapın.");
    }
    const { faturalar, hatali, toplam } = await faturalariOku(sayfa, baslangic);
    log(`${toplam} fatura bulundu, ${faturalar.length} tanesi okundu${hatali ? `, ${hatali} tanesi okunamadı` : ""}. Panele gönderiliyor…`);
    const sonuc = await rpc(ayar, "mikro_pc_aktar", { p_anahtar: ayar.anahtar, p: faturalar });
    log(sonuc?.mesaj || "Aktarıldı.");
    await tarayici.close().catch(() => {});
    tarayici = null;
    // Roket ayrı denenir: Roket'te sorun olsa da Mikro aktarımı başarılı sayılır.
    // Bu bilgisayarda Roket dinleyicisi açıksa Roket'i o zaten düzenli çekiyor; burada atlanır.
    let roketMesaj = "";
    if (await dinleyiciAcikMi()) roketMesaj = "";
    else try {
      tarayici = await tarayiciAc(false, ROKET_PROFIL);
      roketMesaj = await roketAktar(tarayici, ayar); log(roketMesaj);
    } catch (e) {
      roketMesaj = "Roket alınamadı: " + String(e?.message || e);
      log("HATA: " + roketMesaj);
      await rpc(ayar, "mikro_pc_hata", { p_anahtar: ayar.anahtar, p_mesaj: roketMesaj }).catch(() => {});
    }
    writeFileSync(SON_CALISMA, bugun());
    const mesaj = [sonuc?.mesaj || "Aktarıldı.", roketMesaj].filter(Boolean).join(" ");
    if (talep) await rpc(ayar, "mikro_pc_talep_bitir", { p_anahtar: ayar.anahtar, p_id: talep, p_durum: "bitti",
      p_mesaj: mesaj, p_sonuc: { ...(sonuc || {}), bulunan: toplam, okunamayan: hatali } }).catch((e) => log("Talep kapatılamadı: " + e.message));
  } catch (e) {
    const mesaj = String(e?.message || e);
    log("HATA: " + mesaj);
    await rpc(ayar, "mikro_pc_hata", { p_anahtar: ayar.anahtar, p_mesaj: mesaj }).catch(() => {});
    writeFileSync(SON_HATA, String(Date.now()));
    if (talep) await rpc(ayar, "mikro_pc_talep_bitir", { p_anahtar: ayar.anahtar, p_id: talep, p_durum: "hata", p_mesaj: mesaj, p_sonuc: null }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await tarayici?.close().catch(() => {});
  }
}

/** 5 dakikada bir: talep var mı, günlük çalışma zamanı geldi mi? İş yoksa tarayıcı açılmadan çıkar. */
async function bekle() {
  if (existsSync(KILIT) && Date.now() - statSync(KILIT).mtimeMs < 25 * 60 * 1000) return;   // önceki çalışma sürüyor
  const ayar = ayarOku();
  const { talep } = await rpc(ayar, "mikro_pc_nabiz", { p_anahtar: ayar.anahtar, p_bilgisayar: hostname() });
  const saat = Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }));
  const yeniHata = existsSync(SON_HATA) && Date.now() - Number(readFileSync(SON_HATA, "utf8")) < 60 * 60 * 1000;
  if (!talep && (bugunCalisti() || saat < 11 || yeniHata)) return;
  writeFileSync(KILIT, String(process.pid));
  try {
    if (talep) log("Panelden \"Mikro'dan çek\" istendi.");
    await aktarim({ zorla: !!talep, talep });
  } finally {
    try { unlinkSync(KILIT); } catch { /* yok */ }
  }
}

/** Hep açık kalır. Roket'i ekran dışında açık bir pencerede Paket Raporu ekranında hazır tutar:
 *  - 3 saniyede bir panelde "Roket'ten çek" isteği var mı bakar; varsa o günü hemen çeker (~10-15 sn),
 *  - 20 dakikada bir (09:00–03:00) son 7 günü kendiliğinden yeniler; böylece çoğu zaman veri panelde hazırdır. */
async function dinle() {
  // Aynı bilgisayarda ikinci dinleyici açılmasın; "dur" gelirse (giriş kısayolu) tarayıcıyı kapatıp çık
  let tarayici = null, sayfa = null, kapaniyor = false;
  const kapat = async () => { const t = tarayici; tarayici = null; sayfa = null; await t?.close().catch(() => {}); };
  const tek = createServer((c) => c.on("data", async (v) => {
    if (String(v).trim() === "dur") { kapaniyor = true; log("Dinleyici durduruluyor (giriş yapılacak)."); await kapat(); process.exit(0); }
  }));
  try { await new Promise((ok, red) => { tek.once("error", red); tek.listen(DINLE_PORT, "127.0.0.1", ok); }); }
  catch { log("Dinleyici zaten çalışıyor."); return; }
  const ayar = ayarOku();
  const bilgisayar = hostname();
  log(`Roket dinleyicisi başladı (${bilgisayar}).`);

  const hazirla = async () => {
    if (!tarayici) {
      tarayici = await tarayiciAc(false, ROKET_PROFIL);
      tarayici.on("close", () => { tarayici = null; sayfa = null; });
      sayfa = tarayici.pages()[0] || await tarayici.newPage();
    }
    await roketPaketSayfasi(sayfa);
  };
  /** İş yapar; hata olursa tarayıcıyı baştan açıp bir kez daha dener. */
  const calistir = async (tarih) => {
    try { await hazirla(); return await roketAktar(tarayici, ayar, { tarih, hazirSayfa: sayfa }); }
    catch (e) {
      if (/oturumu kapalı/.test(String(e?.message))) throw e;
      log("Roket yeniden açılıyor: " + String(e?.message || e).split("\n")[0]);
      await kapat();
      await hazirla();
      return await roketAktar(tarayici, ayar, { tarih, hazirSayfa: sayfa });
    }
  };

  let hataSayisi = 0, sonYenileme = 0, oturumHatasi = 0;
  const saat = () => Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }));
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    if (kapaniyor) continue;
    let talep, tarih;
    try {
      ({ talep, tarih } = await rpc(ayar, "roket_pc_talep_al", { p_anahtar: ayar.anahtar, p_bilgisayar: bilgisayar }) || {});
      hataSayisi = 0;
    } catch (e) {
      if (hataSayisi++ % 100 === 0) log("Panele ulaşılamadı: " + (e?.message || e));   // internet yoksa log dolmasın
      continue;
    }
    if (talep) {
      const bas = Date.now();
      log(`Panelden "Roket'ten çek" istendi: ${tarih}`);
      try {
        const mesaj = await calistir(tarih);
        log(`${mesaj} (${Math.round((Date.now() - bas) / 1000)} sn)`);
        oturumHatasi = 0;
        await rpc(ayar, "roket_pc_talep_bitir", { p_anahtar: ayar.anahtar, p_id: talep, p_durum: "bitti", p_mesaj: mesaj }).catch((e) => log("İstek kapatılamadı: " + e.message));
      } catch (e) {
        const mesaj = String(e?.message || e);
        log("HATA: Roket: " + mesaj);
        await rpc(ayar, "roket_pc_talep_bitir", { p_anahtar: ayar.anahtar, p_id: talep, p_durum: "hata", p_mesaj: mesaj }).catch(() => {});
      }
      continue;
    }
    // Düzenli yenileme (oturum kapalıysa saatte bir dener)
    const s = saat();
    const bekleme = oturumHatasi ? 60 * 60 * 1000 : 20 * 60 * 1000;
    if ((s >= 9 || s < 3) && Date.now() - sonYenileme > bekleme) {
      sonYenileme = Date.now();
      try { log(await calistir(null)); oturumHatasi = 0; }
      catch (e) { oturumHatasi++; log("HATA: Roket (düzenli yenileme): " + (e?.message || e)); }
    }
  }
}

(argv.has("--kurulum") ? kurulum() : argv.has("--dinle") ? dinle() : argv.has("--bekle") ? bekle() : argv.has("--roket") ? sadeceRoket() : aktarim())
  .catch((e) => { log("HATA: " + (e?.message || e)); process.exitCode = 1; });
