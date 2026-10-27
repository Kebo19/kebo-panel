// ─── TELEGRAM ASİSTANI: GELEN MESAJLARI İŞLEME ───────────────────────────────
// Bir Telegram güncellemesi (mesaj, fotoğraf, buton) gelir; sohbet panele bağlıysa o kullanıcının
// yetkileriyle cevap verilir. Kayıt değiştiren her işlem butonla onaylanır.
//   /start <kod>  panelden alınan kodla hesabı bağlar
//   /ozet /odemeler /stok /robot /bildirim /ayril /yardim
//   düz yazı      → veriye dayanarak yapay zekâ cevaplar
//   fotoğraf      → kasa formu (Raporlar'a), sayım kağıdı (okunur, onayla kaydedilir), irsaliye (Stok'a)
import { geminiIstek } from "@/lib/gemini";
import { bugun, gunEkle, fmtTarih } from "@/lib/tarih";
import { grupUrunleri, PERIYOT_ADI, type SayimPeriyodu } from "@/lib/kasaFormu";
import { sayimKagidiOku, type SayimOkunanSatir } from "@/lib/sayimOku";
import { sabahOzeti, odemeBolumu, odemeOzeti, stokBolumu, robotBolumu, asistanBaglami, html, type TgVeri } from "@/lib/telegram/ozet";
import { rpc, mesajGonder, mesajDuzenle, tg, yaziyor, dosyaIndir, panelAdresi, type Buton } from "@/lib/telegram/sunucu";

interface TgKullanici { user_id: string; ad: string; kisa_ad: string; rol: string; yetkiler: string[]; onayci: boolean }
interface TgMesaj {
  message_id: number; chat: { id: number; type: string }; from?: { first_name?: string; last_name?: string; username?: string };
  text?: string; caption?: string; media_group_id?: string;
  photo?: { file_id: string; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
}
export interface TgGuncelleme {
  update_id: number;
  message?: TgMesaj;
  callback_query?: { id: string; data?: string; from: { id: number }; message?: TgMesaj };
}
interface Bekleyen { islem: string; veri: Record<string, unknown> }

const izin = (k: TgKullanici, y: string) => k.yetkiler.includes(y);
const tl = (v: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(v);

const YARDIM = `<b>Neler yapabilirim?</b>
• Soru sorun: <i>"Dünkü ciro kaç?"</i>, <i>"Kalem'e borcum ne?"</i>, <i>"Bu Cuma Kebo'ya ne ödeyeceğim?"</i>, <i>"Döner kaç gün yeter?"</i>
• Fotoğraf gönderin: kasa formu, sayım kağıdı ya da irsaliye. Ne olduğunu sorarım.
  Açıklamaya <i>kasa</i>, <i>sayım</i> ya da <i>irsaliye</i> yazarsanız sormam.

<b>Komutlar</b>
/ozet — şimdiki özet
/odemeler — vadesi gelen ödemeler
/stok — bitmek üzere olanlar
/robot — Mikro faturaları ve zamlar
/mikro — dükkân bilgisayarından Mikro faturalarını şimdi çek
/bildirim — sabah özeti / öğlen uyarısı aç-kapat
/ayril — bu Telegram'ı panelden ayır`;

// ── Giriş noktası ──
export async function guncellemeIsle(g: TgGuncelleme): Promise<unknown> {
  if (g.callback_query) return butonIsle(g.callback_query);
  const m = g.message;
  if (!m || m.chat.type !== "private") return;   // gruplarda çalışmaz
  const chat = m.chat.id;
  const metin = (m.text || "").trim();

  if (metin.startsWith("/start")) {
    const kod = metin.split(/\s+/)[1];
    if (kod) {
      const ad = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "";
      const r = await rpc<{ ok: boolean; ad?: string }>("tg_baglan", { p_chat: chat, p_kod: kod, p_ad: ad });
      if (r.ok) return mesajGonder(chat, `✅ Hoş geldiniz <b>${html(r.ad || "")}</b>, Telegram hesabınız Kebo Panel'e bağlandı.\nHer sabah ~10:00'da özet, öğlen de önemli uyarılar gelecek.\n\n${YARDIM}`);
      return mesajGonder(chat, "❌ Bağlantı kodu geçersiz ya da süresi dolmuş (15 dk). Panelde <b>Ayarlar → Telegram → Bağla</b> ile yeni kod alın.");
    }
  }

  const k = await rpc<TgKullanici | null>("tg_kim", { p_chat: chat });
  if (!k) {
    return mesajGonder(chat, `Merhaba! Bu asistan Kebo Panel kullanıcıları içindir.\nBağlanmak için panelde <b>Ayarlar → Telegram → "Telegram'ı bağla"</b> butonuna basın.`,
      [[{ text: "Paneli aç", url: `${panelAdresi()}/ayarlar` }]]);
  }

  if (m.photo?.length || (m.document && /^(image\/|application\/pdf)/.test(m.document.mime_type || ""))) return fotografIsle(m, k);

  const komut = metin.split(/[\s@]/)[0].toLowerCase();
  if (komut === "/start" || komut === "/yardim" || komut === "/help") return mesajGonder(chat, YARDIM);
  if (komut === "/ayril") {
    await rpc("tg_ayril", { p_chat: chat });
    return mesajGonder(chat, "Bu Telegram hesabı panelden ayrıldı. Tekrar bağlamak için panelden yeni kod alın.");
  }
  if (komut === "/bildirim") return bildirimMenusu(chat);
  if (komut === "/mikro") {
    if (!izin(k, "stok") && !izin(k, "cari")) return mesajGonder(chat, "Bu işlem için panelde stok ya da cari yetkiniz olmalı.");
    const r = await rpc<{ yeni: boolean; pc_son_gorulme: string | null }>("tg_mikro_talep", { p_chat: chat });
    const dk = r.pc_son_gorulme ? Math.round((Date.now() - Date.parse(r.pc_son_gorulme)) / 60000) : null;
    const pc = dk === null ? "⚠️ Dükkân bilgisayarındaki robot henüz hiç bağlanmadı (kurulum yapılmamış olabilir)."
      : dk <= 10 ? "Dükkân bilgisayarı açık, birkaç dakika içinde başlar."
      : `⚠️ Dükkân bilgisayarı ${dk < 120 ? `${dk} dakikadır` : "uzun süredir"} görünmüyor; açılınca çalışır.`;
    return mesajGonder(chat, `${r.yeni ? "⏳ Mikro'dan çekme isteği alındı." : "⏳ Zaten bekleyen bir çekme isteği var."}\n${pc}\nBitince sonucu buraya yazacağım.`);
  }

  if (komut === "/ozet" || komut === "/odemeler" || komut === "/stok" || komut === "/robot") {
    await yaziyor(chat);
    const v = await rpc<TgVeri>("tg_veri", { p_chat: chat });
    const b = bugun();
    let t = "";
    if (komut === "/ozet") t = sabahOzeti(v, k.ad, b);
    if (komut === "/odemeler") t = odemeMetni(v, b) || "Cari/fatura görme yetkiniz yok.";
    if (komut === "/stok") t = stokBolumu(v, b, 25).join("\n") || "Stok görme yetkiniz yok.";
    if (komut === "/robot") t = robotBolumu(v, b).join("\n") || "Stok yetkiniz yok.";
    return mesajGonder(chat, t);
  }
  if (!metin) return;
  return soruCevapla(chat, k, metin);
}

function odemeMetni(v: TgVeri, b: string): string {
  const o = odemeOzeti(v, b); if (!o) return "";
  const s = odemeBolumu(v, b);
  const sirali = o.cariler.slice().sort((a, c) => (a.gecikmis === c.gecikmis ? c.tutar - a.tutar : a.gecikmis ? -1 : 1));
  return [...s.slice(0, s.findIndex(x => x.startsWith("•")) >= 0 ? s.findIndex(x => x.startsWith("•")) : s.length),
    "", "<b>Tüm liste</b>", ...sirali.map(c => `• ${html(c.ad)}: ${tl(c.tutar)} ₺${c.gecikmis ? " 🔴" : c.vade ? ` · ${fmtTarih(c.vade)}` : ""}`)].join("\n");
}

// ── Soru-cevap ──
async function soruCevapla(chat: number, k: TgKullanici, soru: string) {
  await yaziyor(chat);
  const v = await rpc<TgVeri>("tg_veri", { p_chat: chat });
  const baglam = asistanBaglami(v, bugun());
  const sonuc = await geminiIstek({
    system: `Sen Çorum'daki BCM Restoran'ın (markalar: Kebo, Chick'N Fride, Kıraloğlu) yönetim paneli asistanısın.
Konuştuğun kişi: ${k.ad} (${k.rol}). Sadece aşağıdaki VERİ'ye dayanarak cevap ver; veride olmayan bir şeyi uydurma,
"panelde bu bilgi yok" de. Hesap yapman gerekirse dikkatli yap ve nasıl hesapladığını tek cümleyle söyle.
Türkçe, kısa ve net yaz (telefonda okunacak). Tutarları "12.345 ₺" biçiminde yaz. Markdown tablo kullanma;
gerekirse kısa madde işaretleri (•) kullan, kalın için **…** kullanabilirsin.
Kayıt ekleyemez/değiştiremezsin; kullanıcı bir şey kaydetmek isterse panelden ya da fotoğraf göndererek yapabileceğini söyle.
Cari bakiyede eksi tutar "fazla ödeme / alacak" demektir. "hakediş" işaretli cariler (Yemeksepeti, Trendyol…) faturalarını
platform kendi hakedişinden keser, kasadan ödenmez.

VERİ:
${baglam}`,
    contents: [{ role: "user", parts: [{ text: soru.slice(0, 2000) }] }],
    maxOutputTokens: 2048,
  });
  if (!sonuc.ok) return mesajGonder(chat, `⚠️ Şu an cevap veremiyorum: ${html(sonuc.hata)}`);
  const cevap = html(sonuc.metin.trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#+\s*/gm, "");
  return mesajGonder(chat, cevap || "Cevap üretilemedi, soruyu farklı sorar mısınız?");
}

// ── Fotoğraf ──
function dosyaKimligi(m: TgMesaj): string | null {
  if (m.photo?.length) return m.photo.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0].file_id;
  return m.document?.file_id || null;
}

function turBul(aciklama: string): string | null {
  const a = aciklama.toLocaleLowerCase("tr-TR");
  if (/sayım|sayim/.test(a)) return /haftal/.test(a) ? "sayim_haftalik" : /ayl/.test(a) ? "sayim_aylik" : "sayim_gunluk";
  if (/kasa|rapor|form/.test(a)) return "kasa";
  if (/irsaliye|fatura|fiş|fis/.test(a)) return "irsaliye";
  return null;
}

const TUR_BUTONLARI: Buton[][] = [
  [{ text: "🧾 Kasa formu", callback_data: "tur:kasa" }, { text: "📋 Günlük sayım", callback_data: "tur:sayim_gunluk" }],
  [{ text: "📋 Haftalık sayım", callback_data: "tur:sayim_haftalik" }, { text: "📋 Aylık sayım", callback_data: "tur:sayim_aylik" }],
  [{ text: "🚚 İrsaliye / fatura", callback_data: "tur:irsaliye" }, { text: "✖️ Vazgeç", callback_data: "tur:iptal" }],
];

async function fotografIsle(m: TgMesaj, k: TgKullanici) {
  const chat = m.chat.id;
  const dosya = dosyaKimligi(m); if (!dosya) return;
  const grup = m.media_group_id || null;
  const once = await rpc<Bekleyen | null>("tg_bekleyen_oku", { p_chat: chat });
  // Aynı anda gönderilen fotoğraflar (ör. formun iki yüzü) tek iş sayılır
  if (grup && once?.islem === "foto" && once.veri.grup === grup) {
    const dosyalar = [...(once.veri.dosyalar as string[]), dosya];
    await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: "foto", p_veri: { ...once.veri, dosyalar } });
    if (once.veri.tur) return; // tür açıklamadan biliniyordu, ilk fotoğrafla işlem başladı
    return;
  }
  const tur = turBul(m.caption || "");
  await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: "foto", p_veri: { grup, dosyalar: [dosya], tur } });
  if (tur) return turIsle(chat, k, tur, null);
  return mesajGonder(chat, "📷 Fotoğraf geldi. Bu ne?", TUR_BUTONLARI);
}

async function turIsle(chat: number, k: TgKullanici, tur: string, mesajId: number | null) {
  const b = await rpc<Bekleyen | null>("tg_bekleyen_oku", { p_chat: chat });
  const dosyalar = b?.islem === "foto" ? (b.veri.dosyalar as string[]) : [];
  const yaz = (t: string, btn?: Buton[][]) => mesajId ? mesajDuzenle(chat, mesajId, t, btn) : mesajGonder(chat, t, btn);
  if (tur === "iptal") { await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: null, p_veri: null }); return yaz("Tamam, vazgeçildi."); }
  if (!dosyalar.length) return yaz("Fotoğraf bulunamadı (süresi dolmuş olabilir). Lütfen tekrar gönderin.");

  if (tur === "kasa" || tur === "irsaliye") {
    if (!izin(k, tur === "kasa" ? "rapor_gir" : "stok")) return yaz("Bu işlem için panelde yetkiniz yok.");
    await yaz(`⏳ ${dosyalar.length} fotoğraf panele gönderiliyor…`);
    // Albümün geri kalanı birkaç saniye sonra gelebilir: kısa bekleyip listeyi yeniden oku
    if (b?.veri.grup) {
      await new Promise(r => setTimeout(r, 2500));
      const b2 = await rpc<Bekleyen | null>("tg_bekleyen_oku", { p_chat: chat });
      if (b2?.islem === "foto") dosyalar.splice(0, dosyalar.length, ...(b2.veri.dosyalar as string[]));
    }
    const grup = String(b?.veri.grup || dosyalar[0]).slice(0, 80);
    for (const d of dosyalar) {
      const f = await dosyaIndir(d);
      await rpc("tg_foto_kaydet", { p_chat: chat, p_tur: tur, p_grup: grup, p_mime: f.mime, p_veri: f.base64 });
    }
    await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: null, p_veri: null });
    const yer = tur === "kasa"
      ? `Panelde <b>Raporlar → Kasa Raporu → "Telegram'dan gelenler"</b> ile açıp kontrol ederek kaydedin.`
      : `Panelde <b>Stok → İrsaliye → "Telegram'dan gelenler"</b> ile açıp kontrol ederek kaydedin.`;
    return mesajGonder(chat, `✅ ${dosyalar.length} fotoğraf panele gönderildi.\n${yer}`,
      [[{ text: "Paneli aç", url: `${panelAdresi()}/${tur === "kasa" ? "raporlar" : "stok"}` }]]);
  }

  if (tur.startsWith("sayim_")) {
    if (!izin(k, "stok")) return yaz("Stok sayımı için panelde yetkiniz yok.");
    const periyot = tur.slice(6) as SayimPeriyodu;
    await yaz(`⏳ ${PERIYOT_ADI[periyot]} sayım kağıdı okunuyor… (10–30 sn)`);
    await yaziyor(chat);
    const v = await rpc<TgVeri>("tg_veri", { p_chat: chat });
    const liste = grupUrunleri((v.stok_urunler || []).map(u => ({ ...u, sira_no: u.sira_no ?? null })), periyot);
    const f = await dosyaIndir(dosyalar[0]);
    const s = await sayimKagidiOku(f.base64, f.mime, liste.map(u => ({ id: u.id, no: u.no, ad: u.urun_adi, birim: u.birim })), PERIYOT_ADI[periyot]);
    if (!s.ok) { await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: null, p_veri: null }); return mesajGonder(chat, `❌ ${html(s.hata)}`); }
    const tarih = s.veri.tarih && s.veri.tarih <= bugun() && s.veri.tarih >= gunEkle(bugun(), -31) ? s.veri.tarih : bugun();
    const eslesen = s.veri.satirlar.filter(x => x.urun_id);
    const eslesmeyen = s.veri.satirlar.filter(x => !x.urun_id);
    if (!eslesen.length) { await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: null, p_veri: null }); return mesajGonder(chat, "Kağıtta dolu satır bulamadım. Tüm tablo görünecek şekilde, gölgesiz ve düz çekip tekrar gönderin."); }
    await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: "sayim", p_veri: { tarih, satirlar: eslesen } });
    const adlar = new Map(liste.map(u => [u.id, u]));
    return mesajGonder(chat, sayimMetni(tarih, eslesen, adlar, eslesmeyen, s.veri.belirsiz, s.veri.genel_not), sayimButonlari(tarih));
  }
}

function sayimMetni(tarih: string, satirlar: SayimOkunanSatir[], adlar: Map<string, { urun_adi: string; birim: string; no: number }>,
  eslesmeyen: SayimOkunanSatir[], belirsiz: string[], not: string | null): string {
  const d = (x: number | null) => (x === null ? "–" : tl(x));
  const s = [`📋 <b>Okunan sayım — ${fmtTarih(tarih)}</b>`, "<i>No · ürün: sabah / akşam / fire</i>"];
  satirlar.slice().sort((a, b) => (adlar.get(a.urun_id!)?.no ?? 99) - (adlar.get(b.urun_id!)?.no ?? 99)).forEach(x => {
    const u = adlar.get(x.urun_id!);
    s.push(`${u?.no ?? "?"} · ${html((u?.urun_adi || "").replace(/\s*\(.*$/, ""))}: <b>${d(x.sabah)}</b> / <b>${d(x.aksam)}</b> / ${d(x.fire)} ${u?.birim || ""}${x.not ? ` <i>(${html(x.not)})</i>` : ""}`);
  });
  if (eslesmeyen.length) s.push("", `⚠️ Listede olmayan ${eslesmeyen.length} satır kaydedilmeyecek: ${eslesmeyen.map(x => html(x.yazilan_ad || "?")).join(", ")}`);
  if (belirsiz.length) s.push("", "<b>Emin olamadıklarım:</b>", ...belirsiz.slice(0, 8).map(b => "• " + html(b)));
  if (not) s.push("", `Not: ${html(not)}`);
  s.push("", "Rakamlar doğruysa <b>Kaydet</b>'e basın. Yanlış varsa panelden <b>Stok → Sayım kağıdı tara</b> ile düzelterek girin.");
  return s.join("\n");
}

const sayimButonlari = (tarih: string): Buton[][] => [
  [{ text: `✅ Kaydet (${fmtTarih(tarih).slice(0, 5)})`, callback_data: "sayim:kaydet" }],
  [{ text: "📅 Dünün sayımı", callback_data: "sayim:dun" }, { text: "📅 Bugünün", callback_data: "sayim:bugun" }],
  [{ text: "✖️ İptal", callback_data: "sayim:iptal" }],
];

// ── Butonlar ──
async function butonIsle(q: NonNullable<TgGuncelleme["callback_query"]>) {
  const chat = q.message?.chat.id ?? q.from.id;
  const mesajId = q.message?.message_id ?? null;
  const data = q.data || "";
  await tg("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
  const k = await rpc<TgKullanici | null>("tg_kim", { p_chat: chat });
  if (!k) return mesajGonder(chat, "Bu Telegram hesabı panele bağlı değil.");

  if (data.startsWith("tur:")) return turIsle(chat, k, data.slice(4), mesajId);

  if (data.startsWith("sayim:")) {
    const b = await rpc<Bekleyen | null>("tg_bekleyen_oku", { p_chat: chat });
    if (b?.islem !== "sayim") return mesajId ? mesajDuzenle(chat, mesajId, "Bu sayım zaten işlendi ya da süresi doldu.") : undefined;
    const ac = data.slice(6);
    if (ac === "iptal") { await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: null, p_veri: null }); return mesajId ? mesajDuzenle(chat, mesajId, "✖️ Sayım kaydedilmedi.") : undefined; }
    if (ac === "dun" || ac === "bugun") {
      const tarih = ac === "dun" ? gunEkle(bugun(), -1) : bugun();
      await rpc("tg_bekleyen_yaz", { p_chat: chat, p_islem: "sayim", p_veri: { ...b.veri, tarih } });
      return tg("editMessageReplyMarkup", { chat_id: chat, message_id: mesajId, reply_markup: { inline_keyboard: sayimButonlari(tarih) } }).catch(() => {});
    }
    if (ac === "kaydet") {
      const r = await rpc<{ kayit: number; atlanan_fire: number }>("tg_sayim_kaydet", { p_chat: chat, p_tarih: b.veri.tarih, p_satirlar: b.veri.satirlar });
      if (mesajId) await tg("editMessageReplyMarkup", { chat_id: chat, message_id: mesajId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      return mesajGonder(chat, `✅ ${fmtTarih(String(b.veri.tarih))} sayımı kaydedildi: ${r.kayit} kayıt.` +
        (r.atlanan_fire ? `\n${r.atlanan_fire} ürünün o günkü firesi zaten girilmişti, tekrar düşülmedi.` : ""));
    }
  }

  if (data.startsWith("bil:")) {
    const [, alan, deger] = data.split(":");
    await rpc("tg_bildirim_ayarla", { p_chat: chat, p_sabah: alan === "sabah" ? deger === "1" : null, p_oglen: alan === "oglen" ? deger === "1" : null });
    return bildirimMenusu(chat, mesajId);
  }
}

async function bildirimMenusu(chat: number, mesajId: number | null = null) {
  const v = await rpc<{ sabah: boolean; oglen: boolean } | null>("tg_bildirim_durum", { p_chat: chat }).catch(() => null);
  const sabah = v?.sabah ?? true, oglen = v?.oglen ?? true;
  const t = `<b>Bildirimler</b>\n☀️ Sabah özeti (~10:00): ${sabah ? "açık" : "kapalı"}\n🕛 Öğlen uyarısı (~12:00): ${oglen ? "açık" : "kapalı"}`;
  const btn: Buton[][] = [[
    { text: sabah ? "☀️ Sabahı kapat" : "☀️ Sabahı aç", callback_data: `bil:sabah:${sabah ? 0 : 1}` },
    { text: oglen ? "🕛 Öğleni kapat" : "🕛 Öğleni aç", callback_data: `bil:oglen:${oglen ? 0 : 1}` },
  ]];
  return mesajId ? mesajDuzenle(chat, mesajId, t, btn) : mesajGonder(chat, t, btn);
}
