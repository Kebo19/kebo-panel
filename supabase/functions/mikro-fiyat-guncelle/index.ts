// Supabase Edge Function: mikro-fiyat-guncelle
// Her sabah pg_cron çağırır (bkz. migrations/20261002140000_mikro_fiyat_botu.sql).
// 1) Mikro e-Portal'a bot kullanıcısıyla girer (MIKRO_EPOSTA / MIKRO_PAROLA secret'ları)
// 2) Son GUN_SAYISI günün gelen faturalarından, stok_fiyatlar'daki tedarikçilere ait olanları okur
// 3) fatura_kalem_adi ile eşleşen ürünlerin fiyatını günceller (%30+ sıçramaları kontrole bırakır)
// 4) Sonucu stok_fiyat_bot_log'a yazar (panelde görünür)
// Faturaları sadece okur: portalın "okundu" işaretleyen MarkDocuments çağrısı yapılmaz.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { adTemizle, kalemleriOku, kararVer, type Aday, type Mevcut } from "./ayristir.ts";

const PORTAL = "https://eportal.mikrogrup.com";
const FIRMA = "9351d4b5-c397-48da-a383-d9da89b5dc9d"; // BCM Restoran firma kodu (portal adresindeki)
const GUN_SAYISI = 10;

// ─── Basit çerez kavanozu ────────────────────────────────────────────────────
class Oturum {
  private cerezler = new Map<string, string>();
  private cerezAl(r: Response) {
    for (const c of r.headers.getSetCookie()) {
      const [ad, ...v] = c.split(";")[0].split("=");
      if (ad) this.cerezler.set(ad.trim(), v.join("="));
    }
  }
  private baslik(ek: Record<string, string> = {}) {
    return {
      "User-Agent": "Mozilla/5.0 (KeboPanel fiyat botu)",
      "Accept": "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": [...this.cerezler].map(([k, v]) => `${k}=${v}`).join("; "),
      ...ek,
    };
  }
  async istek(yol: string, init: RequestInit = {}): Promise<Response> {
    let url = yol.startsWith("http") ? yol : PORTAL + yol;
    for (let i = 0; i < 6; i++) { // yönlendirmeleri elle izle ki çerezler kaybolmasın
      const r = await fetch(url, { ...init, headers: this.baslik(init.headers as Record<string, string>), redirect: "manual" });
      this.cerezAl(r);
      const yer = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && yer) {
        await r.body?.cancel();
        url = new URL(yer, url).toString();
        init = { method: "GET" };
        continue;
      }
      return r;
    }
    throw new Error("Mikro çok fazla yönlendirme yaptı");
  }
}

function tarihISO(d: Date) { return d.toISOString(); }

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Çağrı anahtarı (pg_cron vault'tan gönderir)
  const anahtar = req.headers.get("x-bot-anahtar") ?? "";
  const { data: anahtarDogru } = await db.rpc("mikro_bot_anahtar_dogrula", { p_anahtar: anahtar });
  if (!anahtarDogru) return new Response("yetkisiz", { status: 401 });

  const { data: log } = await db.from("stok_fiyat_bot_log").insert({}).select("id").single();
  const bitir = async (durum: "basarili" | "hata", alanlar: Record<string, unknown>) => {
    await db.from("stok_fiyat_bot_log").update({ durum, bitti: new Date().toISOString(), ...alanlar }).eq("id", log!.id);
    return new Response(JSON.stringify({ durum, ...alanlar }), { status: durum === "hata" ? 500 : 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const eposta = Deno.env.get("MIKRO_EPOSTA");
    const parola = Deno.env.get("MIKRO_PAROLA");
    if (!eposta || !parola) return await bitir("hata", { mesaj: "Bot kullanıcısı tanımlı değil: Supabase → Edge Functions → Secrets'a MIKRO_EPOSTA ve MIKRO_PAROLA girin." });

    // 1) Giriş — tek deneme (hatalı denemeler hesabı kilitler)
    const o = new Oturum();
    await o.istek("/");
    const g = await o.istek("/home/loginEmikro", {
      method: "POST",
      // Portalın kendi giriş ekranı (Ng/login.js) tam olarak böyle gönderiyor: JSON gövde + bu başlık
      headers: { "Content-Type": "multipart/form-data" },
      body: JSON.stringify({ email: eposta, password: parola }),
    });
    const gj = await g.json().catch(() => null) as { Success?: boolean; IsTwoFactorRequired?: boolean; IsAccountLocked?: boolean; Message?: string } | null;
    if (!gj?.Success) {
      const neden = gj?.IsAccountLocked ? "Mikro bot hesabı kilitli." : `Mikro girişi başarısız (HTTP ${g.status}${gj?.Message ? ", " + gj.Message : ""}). E-posta/parolayı kontrol edin.`;
      return await bitir("hata", { mesaj: neden });
    }
    if (gj.IsTwoFactorRequired) return await bitir("hata", { mesaj: "Bot kullanıcısında SMS doğrulaması açık. Mikro'da bu kullanıcı için iki aşamalı doğrulamayı kapatın." });
    await o.istek("/accounts");

    // 2) Eşleşme listesi
    const { data: fiyatlar, error: fe } = await db.from("stok_fiyatlar").select("urun_id, fatura_kalem_adi, tedarikci_vkn, fatura_birim_fiyat, fatura_tarihi");
    if (fe) throw fe;
    const mevcut = (fiyatlar ?? []) as Mevcut[];
    const vknler = new Set(mevcut.map(m => m.tedarikci_vkn).filter(Boolean) as string[]);
    const adaIndeks = new Map<string, Mevcut[]>(); // "VKN|AD" → ürünler
    for (const m of mevcut) {
      const k = `${m.tedarikci_vkn}|${adTemizle(m.fatura_kalem_adi)}`;
      adaIndeks.set(k, [...(adaIndeks.get(k) ?? []), m]);
    }

    // 3) Fatura listesi
    const bitis = new Date(); const baslangic = new Date(bitis.getTime() - GUN_SAYISI * 86400_000);
    const faturalar: Array<{ Id: string; UserTitle: string; UserTaxIdentification: string; FormattedGibNumber: string; InvoiceTypeCode: string; CancelationReason: string | null; Header: { DocumentDate: string } }> = [];
    for (let sayfa = 1; sayfa <= 10; sayfa++) {
      const q = new URLSearchParams({
        FlagStatus: "All", cancelledStatus: "All", filterDateType: "DocumentDate",
        firstDate: tarihISO(baslangic), lastDate: tarihISO(bitis), folder: "", gibNumber: "", invoiceCurrency: "All",
        invoiceProfilesFilter: "TUMU", invoiceTypeCodesFilter: "TUMU", maxAmount: "", minAmount: "", readingState: "All",
        recordPerPage: "100", sortColumn: "", sortOrder: "", state: "Hepsi", taxNumber: "", titleMatchType: "StartsWith",
        titleValue: "", page: String(sayfa),
      });
      const r = await o.istek(`/cp/${FIRMA}//inbox/GetIncomingInvoiceList?${q}`);
      const j = await r.json().catch(() => null);
      if (!j?.incomingInvoices) throw new Error(`Fatura listesi alınamadı (HTTP ${r.status}). Oturum açılmamış olabilir.`);
      faturalar.push(...j.incomingInvoices);
      if (j.incomingInvoices.length < 100) break;
    }
    const ilgili = faturalar.filter(f => vknler.has(f.UserTaxIdentification) && !f.CancelationReason && !/IADE/i.test(f.InvoiceTypeCode ?? ""));

    // 4) Kalemleri oku → her ürün için en yeni fatura
    const enYeni = new Map<string, Aday>();
    const eslesmeyen: Record<string, { ad: string; fiyat: number; tedarikci: string; fatura: string }> = {};
    for (const f of ilgili) {
      const r = await o.istek(`/cp/${FIRMA}//inbox/GetDocumentAsHtml?id=${f.Id}`, { headers: { Accept: "text/html" } });
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc) continue;
      const tarih = f.Header.DocumentDate.slice(0, 10);
      for (const k of kalemleriOku(doc as unknown as Parameters<typeof kalemleriOku>[0])) {
        const urunler = adaIndeks.get(`${f.UserTaxIdentification}|${k.ad}`);
        if (!urunler) { eslesmeyen[k.ad] = { ad: k.ad, fiyat: k.birimFiyat, tedarikci: f.UserTitle, fatura: f.FormattedGibNumber }; continue; }
        for (const u of urunler) {
          const onceki = enYeni.get(u.urun_id);
          if (!onceki || tarih > onceki.tarih)
            enYeni.set(u.urun_id, { urun_id: u.urun_id, fiyat: k.birimFiyat, kdv: k.kdv, faturaNo: f.FormattedGibNumber, tarih, kalemAdi: k.ad });
        }
      }
    }

    // 5) Uygula
    const guncellenen: unknown[] = []; const kontrol: unknown[] = [];
    for (const m of mevcut) {
      const a = enYeni.get(m.urun_id); if (!a) continue;
      const karar = kararVer({ ...m, fatura_birim_fiyat: Number(m.fatura_birim_fiyat) }, a);
      if (karar.tip === "guncelle") {
        const { error } = await db.from("stok_fiyatlar").update({
          fatura_birim_fiyat: a.fiyat, kdv_orani: a.kdv, fatura_no: a.faturaNo, fatura_tarihi: a.tarih,
          guncellendi: new Date().toISOString(), guncelleyen: "otomatik (Mikro botu)",
        }).eq("urun_id", m.urun_id);
        if (error) throw error;
        guncellenen.push({ urun: a.kalemAdi, eski: karar.eski, yeni: a.fiyat, fatura: a.faturaNo });
      } else if (karar.tip === "kontrol") {
        kontrol.push({ urun: a.kalemAdi, eski: karar.eski, yeni: a.fiyat, oran: Math.round(karar.oran * 100), fatura: a.faturaNo });
      }
    }

    const mesaj = ilgili.length === 0 ? "Son günlerde yeni tedarikçi faturası yok."
      : `${ilgili.length} fatura okundu, ${guncellenen.length} fiyat güncellendi` + (kontrol.length ? `, ${kontrol.length} değişim kontrol bekliyor.` : ".");
    return await bitir("basarili", {
      okunan_fatura: ilgili.length, guncellenen: guncellenen.length, kontrol_gereken: kontrol.length, mesaj,
      detay: { guncellenen, kontrol, eslesmeyen: Object.values(eslesmeyen).slice(0, 50), toplam_fatura: faturalar.length },
    });
  } catch (e) {
    return await bitir("hata", { mesaj: `Beklenmeyen hata: ${e instanceof Error ? e.message : String(e)}` });
  }
});
