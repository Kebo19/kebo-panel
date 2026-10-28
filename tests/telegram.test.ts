import { describe, it, expect, vi, beforeEach } from "vitest";
import { sabahOzeti, oglenUyarisi, odemeOzeti, buCuma, asistanBaglami, type TgVeri } from "@/lib/telegram/ozet";

const KEBO = "11111111-1111-1111-1111-111111111111";
const YS = "22222222-2222-2222-2222-222222222222";
const SUT = "33333333-3333-3333-3333-333333333333";
const DONER = "44444444-4444-4444-4444-444444444444";

const rapor = (tarih: string, kasa: number) => ({ tarih, kasa_nakit: kasa, kasa_pos: 0, kurye_raporlari: [] } as never);

function veri(): TgVeri {
  return {
    raporlar: [rapor("2026-10-19", 10000), rapor("2026-10-26", 12000)],
    acik_faturalar: [
      { id: "f1", cari_id: KEBO, cari_unvan: "Kebo Gıda", fatura_no: "K1", fatura_tarihi: "2026-10-10", vade_tarihi: "2026-10-25", toplam_tutar: 50000, durum: "bekliyor" },
      { id: "f2", cari_id: KEBO, cari_unvan: "Kebo Gıda", fatura_no: "K2", fatura_tarihi: "2026-10-14", vade_tarihi: "2026-10-29", toplam_tutar: 30000, durum: "bekliyor" },
      { id: "f3", cari_id: KEBO, cari_unvan: "Kebo Gıda", fatura_no: "K3", fatura_tarihi: "2026-10-20", vade_tarihi: "2026-11-04", toplam_tutar: 20000, durum: "bekliyor" },
      { id: "f4", cari_id: YS, cari_unvan: "Yemek Sepeti", fatura_no: "Y1", fatura_tarihi: "2026-10-20", vade_tarihi: null, toplam_tutar: 9000, durum: "bekliyor" },
      { id: "f5", cari_id: SUT, cari_unvan: "Sütaş Süt Ürünleri Anonim Şirketi", fatura_no: "S1", fatura_tarihi: "2026-10-26", vade_tarihi: null, toplam_tutar: 4000, durum: "bekliyor" },
    ] as never,
    bakiyeler: [
      { cari_id: KEBO, unvan: "Kebo Gıda", borc: 90000, odenmis: 10000, hakedisten: false },
      { cari_id: YS, unvan: "Yemek Sepeti", borc: 9000, odenmis: 0, hakedisten: true },
      { cari_id: SUT, unvan: "Sütaş", borc: 4000, odenmis: 0, hakedisten: false },
    ],
    stok_urunler: [{ id: DONER, urun_adi: "TAVUK DÖNER (1 KOLİ 10 KG)", birim: "kg", kategori: null, min_stok: 0, mevcut_stok: 12, sayim_periyodu: "gunluk", sira_no: 1 }],
    stok_hareketler: [
      { urun_id: DONER, tarih: "2026-10-24", tip: "sayim", miktar: 100, vakit: "sabah" },
      { urun_id: DONER, tarih: "2026-10-25", tip: "sayim", miktar: 70, vakit: "sabah" },
      { urun_id: DONER, tarih: "2026-10-26", tip: "sayim", miktar: 40, vakit: "sabah" },
      { urun_id: DONER, tarih: "2026-10-27", tip: "sayim", miktar: 12, vakit: "sabah" },
    ],
    bot_log: [{ bitti: "2026-10-27T08:20:00Z", durum: "basarili", mesaj: "Otomatik: 3 yeni fatura okundu", guncellenen: [{ urun: "TAVUK DÖNER", eski: 100, yeni: 112 }], kontrol: [] }],
    bekleyen_talepler: 2,
  };
}

describe("telegram özet", () => {
  it("bu Cuma doğru bulunur", () => {
    expect(buCuma("2026-10-27")).toBe("2026-10-30");  // Salı → Cuma
    expect(buCuma("2026-10-30")).toBe("2026-10-30");  // Cuma → aynı gün
    expect(buCuma("2026-10-31")).toBe("2026-11-06");  // Cumartesi → gelecek Cuma
  });

  it("Kebo Cuma ödemesi: vadesi Cuma'ya kadar gelenler, ödenmiş kısım en eskiden düşülür; hakediş carileri sayılmaz", () => {
    const o = odemeOzeti(veri(), "2026-10-27")!;
    // K1 50.000 − 10.000 ödenmiş = 40.000 (gecikmiş) + K2 30.000 (29.10) = 70.000; K3 (04.11) dahil değil
    expect(o.keboCuma).toBe(70000);
    expect(o.cariler.some(c => /Yemek/.test(c.ad))).toBe(false);
    expect(o.gecikmis).toBe(40000);
  });

  it("sabah özeti ciro, ödeme, stok ve bekleyenleri içerir", () => {
    const t = sabahOzeti(veri(), "Murat Can Çömüz", "2026-10-27");
    expect(t).toContain("Günaydın Murat");
    expect(t).toContain("12.000 ₺");
    expect(t).toContain("▲ %20");
    expect(t).toContain("Kebo");
    expect(t).toContain("70.000 ₺");
    expect(t).toContain("TAVUK DÖNER");
    expect(t).toContain("2 rapor değişikliği");
    expect(t).not.toContain("Yemek Sepeti");
  });

  it("yetkisi olmayan bölüm gösterilmez", () => {
    const t = sabahOzeti({ raporlar: veri().raporlar }, "Elif", "2026-10-27");
    expect(t).toContain("Ciro");
    expect(t).not.toContain("Ödemeler");
    expect(t).not.toContain("Stok");
  });

  it("dünün raporu yoksa uyarır", () => {
    const t = sabahOzeti({ raporlar: [rapor("2026-10-20", 5000)] }, "Murat", "2026-10-27");
    expect(t).toContain("kasa raporu girilmemiş");
  });

  it("öğlen uyarısı: robot bugün çalışmadıysa söyler, söylenecek yoksa null", () => {
    const v = veri();
    v.bot_log = [{ bitti: "2026-10-25T08:20:00Z", durum: "basarili", mesaj: "x" }];
    expect(oglenUyarisi(v, "2026-10-27")).toContain("Bugün çalışmadı");
    expect(oglenUyarisi({ raporlar: [] }, "2026-10-27")).toBeNull();
  });

  it("öğlen uyarısı zamları listeler", () => {
    const t = oglenUyarisi(veri(), "2026-10-27")!;
    expect(t).toContain("Zamlananlar");
    expect(t).toContain("+%12");
  });

  it("asistan bağlamı yetkiye göre bölüm içerir", () => {
    const b = asistanBaglami({ stok_urunler: veri().stok_urunler, stok_hareketler: veri().stok_hareketler }, "2026-10-27");
    expect(b).toContain("TAVUK DÖNER");
    expect(b).toContain("Kasa raporlarını görme yetkisi yok");
  });
});

// ── Asistan akışı: Telegram, veritabanı ve Gemini istekleri sahte ──
describe("telegram asistan akışı", () => {
  const giden: { yol: string; govde: Record<string, unknown> }[] = [];
  let bekleyen: { islem: string; veri: Record<string, unknown> } | null = null;
  let bagli = true;

  beforeEach(() => {
    giden.length = 0; bekleyen = null; bagli = true;
    process.env.TELEGRAM_BOT_TOKEN = "123:test";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.GEMINI_API_KEY = "g";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const govde = init?.body ? JSON.parse(String(init.body)) : {};
      giden.push({ yol: url, govde });
      const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });
      if (url.startsWith("https://db.test/rest/v1/rpc/")) {
        const ad = url.split("/").pop();
        if (ad === "tg_kim") return json(bagli ? { user_id: "u", ad: "Murat Can", kisa_ad: "murat", rol: "Tam Yetkili", yetkiler: ["stok", "rapor_gir", "cari"], onayci: true } : null);
        if (ad === "tg_veri") return json(veri());
        if (ad === "tg_bekleyen_oku") return json(bekleyen);
        if (ad === "tg_bekleyen_yaz") { bekleyen = govde.p_islem ? { islem: govde.p_islem, veri: govde.p_veri } : null; return json(null); }
        if (ad === "tg_sayim_kaydet") return json({ kayit: 2, atlanan_fire: 0 });
        if (ad === "tg_foto_kaydet") return json("id");
        if (ad === "tg_baglan") return json({ ok: govde.p_kod === "dogru", ad: "Murat Can" });
        return json(null);
      }
      if (url.includes("api.telegram.org/bot123:test/getFile")) return json({ ok: true, result: { file_path: "photos/a.jpg", file_size: 1000 } });
      if (url.includes("api.telegram.org/file/")) return new Response(new Uint8Array([1, 2, 3]));
      if (url.includes("api.telegram.org")) return json({ ok: true, result: { message_id: 5 } });
      if (url.includes("generativelanguage")) {
        const sayim = JSON.stringify(govde).includes("Sayım Listesi");
        const metin = sayim
          ? JSON.stringify({ tarih: "2026-10-27", sayan: "Ali", satirlar: [{ no: 1, urun_id: DONER, sabah: null, aksam: 15, fire: 1, not: null }], genel_not: null, belirsiz: [] })
          : "Dünkü ciro **12.000 ₺**.";
        return json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: metin }] } }] });
      }
      return new Response("bulunamadı", { status: 404 });
    }));
  });

  const telegramMesajlari = () => giden.filter(g => g.yol.includes("api.telegram.org") && /sendMessage|editMessageText/.test(g.yol)).map(g => String(g.govde.text));

  it("bağlı olmayan kullanıcıya bağlanma yolu gösterilir, /start kod ile bağlanır", async () => {
    const { guncellemeIsle } = await import("@/lib/telegram/asistan");
    bagli = false;
    await guncellemeIsle({ update_id: 1, message: { message_id: 1, chat: { id: 7, type: "private" }, text: "merhaba" } });
    expect(telegramMesajlari().pop()).toContain("Ayarlar → Telegram");
    await guncellemeIsle({ update_id: 2, message: { message_id: 2, chat: { id: 7, type: "private" }, text: "/start dogru" } });
    expect(telegramMesajlari().pop()).toContain("bağlandı");
    await guncellemeIsle({ update_id: 3, message: { message_id: 3, chat: { id: 7, type: "private" }, text: "/start yanlis" } });
    expect(telegramMesajlari().pop()).toContain("geçersiz");
  });

  it("soru veriye dayanarak cevaplanır", async () => {
    const { guncellemeIsle } = await import("@/lib/telegram/asistan");
    await guncellemeIsle({ update_id: 4, message: { message_id: 4, chat: { id: 7, type: "private" }, text: "dünkü ciro kaç?" } });
    const gem = giden.find(g => g.yol.includes("generativelanguage"))!;
    expect(JSON.stringify(gem.govde)).toContain("Kebo Gıda");
    expect(telegramMesajlari().pop()).toBe("Dünkü ciro <b>12.000 ₺</b>.");
  });

  it("sayım kağıdı: fotoğraf → tür seçimi → okuma → Kaydet", async () => {
    const { guncellemeIsle } = await import("@/lib/telegram/asistan");
    await guncellemeIsle({ update_id: 5, message: { message_id: 5, chat: { id: 7, type: "private" }, photo: [{ file_id: "F1", width: 800, height: 1200 }] } });
    expect(telegramMesajlari().pop()).toContain("Bu ne?");
    await guncellemeIsle({ update_id: 6, callback_query: { id: "c1", data: "tur:sayim_gunluk", from: { id: 7 }, message: { message_id: 9, chat: { id: 7, type: "private" } } } });
    const okunan = telegramMesajlari().pop()!;
    expect(okunan).toContain("Okunan sayım");
    expect(okunan).toContain("TAVUK DÖNER");
    expect(bekleyen?.islem).toBe("sayim");
    await guncellemeIsle({ update_id: 7, callback_query: { id: "c2", data: "sayim:kaydet", from: { id: 7 }, message: { message_id: 10, chat: { id: 7, type: "private" } } } });
    const kayit = giden.find(g => g.yol.endsWith("/tg_sayim_kaydet"))!;
    expect(kayit.govde.p_satirlar).toEqual([{ no: 1, urun_id: DONER, yazilan_ad: null, sabah: null, aksam: 15, fire: 1, not: null }]);
    expect(telegramMesajlari().pop()).toContain("kaydedildi");
  });

  it("açıklamada 'kasa' yazan fotoğraf doğrudan panele gönderilir", async () => {
    const { guncellemeIsle } = await import("@/lib/telegram/asistan");
    await guncellemeIsle({ update_id: 8, message: { message_id: 8, chat: { id: 7, type: "private" }, caption: "kasa raporu", photo: [{ file_id: "F2", width: 800, height: 1200 }] } });
    const foto = giden.find(g => g.yol.endsWith("/tg_foto_kaydet"))!;
    expect(foto.govde.p_tur).toBe("kasa");
    expect(foto.govde.p_veri).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(telegramMesajlari().pop()).toContain("Telegram'dan gelenler");
  });

  it("gruplarda çalışmaz", async () => {
    const { guncellemeIsle } = await import("@/lib/telegram/asistan");
    await guncellemeIsle({ update_id: 9, message: { message_id: 9, chat: { id: -5, type: "group" }, text: "ciro?" } });
    expect(giden.length).toBe(0);
  });
});

describe("mikro raporu", () => {
  it("eklenen faturaları ve fiyat değişimlerini yazar", async () => {
    const { mikroRaporMetni } = await import("@/lib/telegram/ozet");
    const t = mikroRaporMetni({ durum: "bitti", mesaj: "ok", istendi: "", basladi: "", bitti: "", isteyen_ad: "murat",
      sonuc: { bulunan: 40, yeni_cari: 1 },
      faturalar: [{ cari: "Sütaş Süt Ürünleri Anonim Şirketi", no: "S1", tarih: "2026-10-27", tutar: 4000 }],
      fiyat: { guncellenen: [{ urun: "NUGGET", eski: 100, yeni: 110 }], kontrol: [] } });
    expect(t).toContain("Faturalar'a eklenen 1 fatura");
    expect(t).toContain("Sütaş");
    expect(t).toContain("+%10");
    expect(t).toContain("1 yeni cari");
    expect(mikroRaporMetni({ durum: "hata", mesaj: "Mikro oturumu kapalı", istendi: "", basladi: null, bitti: null, isteyen_ad: null, sonuc: null, faturalar: [], fiyat: null }))
      .toContain("başarısız");
  });
});

describe("faturadan stok girişi mesajı", () => {
  it("irsaliyesi bulunan faturada karşılaştırma ve fark gösterilir", async () => {
    const { stokFaturaMetni } = await import("@/lib/telegram/ozet");
    const { stokFaturaButonlari } = await import("@/lib/telegram/asistan");
    const m = stokFaturaMetni({ gib_no: "KME2026000000001", tarih: "2026-10-27", tedarikci: "Kalem Meşrubat Gıda", iade: false, kalemler: [],
      irsaliye: { belge: "b", belge_no: "IRS-55", tarih: "2026-10-25", teslim: true,
        satirlar: [
          { oneri_id: "1", kalem: "AYRAN", urun: "AYRAN (1 KOLİ 20 ADET)", birim: "adet", irsaliye_kalem_id: "i1", irsaliye_miktar: 20, fatura_miktar: 24, fark: 4, teslim: true },
          { oneri_id: "2", kalem: "KOLA", urun: "KOLA", birim: "adet", irsaliye_kalem_id: "i2", irsaliye_miktar: 12, fatura_miktar: 12, fark: 0, teslim: true }],
        faturada_olmayan: [], irsaliyede_olmayan: [] } });
    expect(m.metin).toContain("IRS-55");
    expect(m.metin).toContain("20 / 24");
    expect(m.metin).toContain("+4");
    expect(m.fark).toBe(true);
    const b = stokFaturaButonlari("KME2026000000001", m.eslesen, m.eslesmeyen, m.irsaliye, m.fark);
    expect(b[0].map(x => x.callback_data)).toEqual(["sgi:f:KME2026000000001", "sgi:i:KME2026000000001"]);
  });

  it("irsaliyesi olmayan faturada eşleşen/eşleşmeyen kalemler", async () => {
    const { stokFaturaMetni } = await import("@/lib/telegram/ozet");
    const m = stokFaturaMetni({ gib_no: "X1", tarih: "2026-10-27", tedarikci: "Sütaş", iade: false, irsaliye: null, kalemler: [
      { id: "a", kalem: "AYRAN 200ML", miktar: 20, birim: "ADET", urun: "AYRAN", urun_birim: "adet", stok_miktar: 20, durum: "bekliyor" },
      { id: "b", kalem: "YOĞURT 9KG", miktar: 2, birim: "KOVA", urun: null, urun_birim: null, stok_miktar: 2, durum: "bekliyor" }] });
    expect(m.metin).toContain("stoğa işlensin mi");
    expect(m.eslesen).toBe(1);
    expect(m.eslesmeyen).toBe(1);
  });
});
