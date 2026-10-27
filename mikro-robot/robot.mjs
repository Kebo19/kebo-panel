// ─── KEBO MİKRO ROBOTU ─────────────────────────────────────────────────────────
// Dükkân bilgisayarında her gün (Görev Zamanlayıcı, 11:15 ve oturum açılınca) çalışır:
//   1) Bilgisayardaki Google Chrome'u bu robota ayrılmış bir profille açar (Mikro oturumu bu profilde kalır).
//   2) Mikro e-Portal → Gelen e-Faturalar'a girer. Oturum kapanmışsa kayıtlı kullanıcıyla yeniden giriş yapmayı dener.
//   3) Panelin istediği tarihten bu yana gelen faturaları ve kalemlerini okur (Fiyat Listesi'ndeki "Kebo'ya aktar"
//      yer imiyle aynı kurallar; faturalar sadece okunur, "okundu" işaretlenmez).
//   4) Panele gönderir: faturalar carilere işlenir, stok fiyatları güncellenir. Sonuç panelde Fiyat Listesi'nde görünür.
// Mikro, sunuculardan (Vercel/Supabase) gelen girişleri engellediği için bu iş dükkânın kendi bilgisayarından yapılır.
//
// Kullanım:  node robot.mjs            → günlük aktarım (bugün başarıyla çalıştıysa tekrar çalışmaz)
//            node robot.mjs --zorla    → bugün çalışmış olsa da çalıştır
//            node robot.mjs --kurulum  → Chrome'u açar, Mikro'ya bir kez elle giriş yapılır (oturum kaydedilir)

import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
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

const MIKRO = process.env.KEBO_MIKRO_ADRES || "https://eportal.mikrogrup.com"; // ortam değişkeni sadece test içindir
const FIRMA = "9351d4b5-c397-48da-a383-d9da89b5dc9d"; // BCM Restoran firma kodu (lib/fiyatListesi.ts ile aynı)
const GELEN = `${MIKRO}/cp/${FIRMA}/inbox/newinbox`;

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

async function tarayiciAc(gorunur) {
  const ortak = { headless: false, viewport: { width: 1280, height: 860 }, args: gorunur ? [] : ["--start-minimized"] };
  for (const channel of ["chrome", "msedge"]) {
    try { return await chromium.launchPersistentContext(PROFIL, { ...ortak, channel }); }
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
    const AD = /^(mal\s*\/\s*hizmet|mal hizmet|malzeme\s*\/\s*hizmet açıklaması|ürün adı)$/i;
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
          const html = r.ok ? await r.text() : "";
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

async function kurulum() {
  log("Kurulum: Chrome açılıyor. Mikro'ya giriş yapın, Gelen e-Faturalar sayfası açılınca bu pencere kendiliğinden kapanır.");
  const tarayici = await tarayiciAc(true);
  const sayfa = tarayici.pages()[0] || await tarayici.newPage();
  await sayfa.goto(GELEN, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sayfa.waitForURL((u) => mikrodaMi(String(u)), { timeout: 10 * 60 * 1000 });
  await sayfa.waitForTimeout(3000);
  log("Mikro oturumu kaydedildi.");
  await tarayici.close();
}

async function aktarim() {
  if (!argv.has("--zorla") && existsSync(SON_CALISMA) && readFileSync(SON_CALISMA, "utf8").trim() === bugun()) {
    log("Bugün zaten başarıyla çalıştı, atlanıyor."); return;
  }
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
      throw new Error("Mikro oturumu kapalı ve otomatik giriş yapılamadı. Masaüstündeki \"Mikro robotu - giriş\" kısayoluyla bir kez giriş yapın.");
    }
    const { faturalar, hatali, toplam } = await faturalariOku(sayfa, baslangic);
    log(`${toplam} fatura bulundu, ${faturalar.length} tanesi okundu${hatali ? `, ${hatali} tanesi okunamadı` : ""}. Panele gönderiliyor…`);
    const sonuc = await rpc(ayar, "mikro_pc_aktar", { p_anahtar: ayar.anahtar, p: faturalar });
    log(sonuc?.mesaj || "Aktarıldı.");
    writeFileSync(SON_CALISMA, bugun());
  } catch (e) {
    const mesaj = String(e?.message || e);
    log("HATA: " + mesaj);
    await rpc(ayar, "mikro_pc_hata", { p_anahtar: ayar.anahtar, p_mesaj: mesaj }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await tarayici?.close().catch(() => {});
  }
}

(argv.has("--kurulum") ? kurulum() : aktarim()).catch((e) => { log("HATA: " + (e?.message || e)); process.exitCode = 1; });
