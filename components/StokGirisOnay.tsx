"use client";

// Faturadan gelen mal: Mikro'dan okunan her fatura kalemi burada "stoğa işlensin mi?" diye bekler.
// Eşleşmiş kalemde ürün ve çarpan hazır gelir; eşleşmeyende ürün seçilir (ya da kalem adıyla yeni ürün açılır).
// Seçim hatırlanır: aynı tedarikçinin aynı kalemi bir dahaki sefere otomatik eşleşir.
// "Takip etme": elektrik, internet gibi stokta tutulmayan kalemler bir daha sorulmaz.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtTarih } from "@/lib/tarih";
import { miktarOku } from "@/lib/stok";
import { PackageCheck, Loader2, Check, X, EyeOff, AlertTriangle, ChevronDown, ChevronUp, Link2 } from "lucide-react";
import type { IrsaliyeEslesme } from "@/lib/telegram/ozet";

interface Oneri {
  id: string; gib_no: string; sira: number | null; tarih: string; tedarikci: string | null; iade: boolean;
  kalem_adi: string; fatura_miktar: number | null; fatura_birim: string | null; fatura_birim_fiyat: number | null;
  urun_id: string | null; carpan: number;
}
interface Secim { urun_id: string; carpan: string }
export interface StokUrunuKisa { id: string; urun_adi: string; birim: string }

const sayi = (v: number, d = 2) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v || 0);
const inp = "bg-zemin border border-cizgi text-yazi text-[11px] h-8 px-2 rounded-lg outline-none";
const birimTahmin = (b: string | null) => {
  const s = (b || "").toLocaleLowerCase("tr-TR");
  if (/kg|kilo/.test(s)) return "kg"; if (/lt|litre/.test(s)) return "lt"; if (/koli/.test(s)) return "koli"; if (/paket/.test(s)) return "paket";
  return "adet";
};

export default function StokGirisOnay({ urunler, onDegisti }: { urunler: StokUrunuKisa[]; onDegisti: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [oneriler, setOneriler] = useState<Oneri[]>([]);
  const [cift, setCift] = useState<Map<string, string>>(new Map());
  const [irsaliye, setIrsaliye] = useState<Record<string, IrsaliyeEslesme>>({});
  const [farkIsle, setFarkIsle] = useState<Record<string, boolean>>({});
  const [elleBag, setElleBag] = useState<Record<string, string>>({});
  const [secim, setSecim] = useState<Record<string, Secim>>({});
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState(true);
  const urunMap = useMemo(() => new Map(urunler.map(u => [u.id, u])), [urunler]);
  const sirali = useMemo(() => [...urunler].sort((a, b) => a.urun_adi.localeCompare(b.urun_adi, "tr")), [urunler]);

  const yukle = useCallback(async () => {
    const [{ data }, { data: c }, { data: ie }] = await Promise.all([
      supabase.from("stok_giris_onerileri").select("id,gib_no,sira,tarih,tedarikci,iade,kalem_adi,fatura_miktar,fatura_birim,fatura_birim_fiyat,urun_id,carpan")
        .eq("durum", "bekliyor").order("tarih").order("gib_no").order("sira"),
      supabase.rpc("stok_giris_cift_kontrol"),
      supabase.rpc("irsaliye_eslesmeleri"),
    ]);
    setIrsaliye((ie || {}) as Record<string, IrsaliyeEslesme>);
    setOneriler((data || []) as Oneri[]);
    const m = new Map<string, string>();
    ((c || []) as { oneri_id: string; hareket_tarihi: string; miktar: number; kaynak: string }[])
      .forEach(x => m.set(x.oneri_id, `${fmtTarih(x.hareket_tarihi)} tarihinde ${x.kaynak === "irsaliye" ? "irsaliyeden" : "elle"} ${sayi(x.miktar)} giriş var`));
    setCift(m);
  }, [supabase]);
  useEffect(() => { yukle(); }, [yukle]);

  const faturalar = useMemo(() => {
    const m = new Map<string, Oneri[]>();
    oneriler.forEach(o => { if (!m.has(o.gib_no)) m.set(o.gib_no, []); m.get(o.gib_no)!.push(o); });
    return [...m.entries()];
  }, [oneriler]);

  const sec = (o: Oneri): Secim => secim[o.id] ?? { urun_id: o.urun_id || "", carpan: String(o.carpan).replace(".", ",") };
  const degistir = (id: string, alan: Partial<Secim>, o: Oneri) => setSecim(s => ({ ...s, [id]: { ...sec(o), ...alan } }));

  const yeniUrun = async (o: Oneri) => {
    if (mesgul) return;
    const ad = o.kalem_adi.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ").trim();
    // Aynı adla ürün zaten varsa yenisini açma, onu seç (çift kayıt olmasın)
    const var_ = urunler.find(u => u.urun_adi.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ").trim() === ad);
    if (var_) { degistir(o.id, { urun_id: var_.id, carpan: "1" }, o); return; }
    setMesgul(o.id); setHata(null);
    const { data, error } = await supabase.from("stok_urunler")
      .insert({ urun_adi: ad, birim: birimTahmin(o.fatura_birim), kategori: null, min_stok: 0, mevcut_stok: 0, durum: "aktif", sayim_periyodu: "haftalik" })
      .select("id").single();
    setMesgul(null);
    if (error || !data) { setHata(error?.message || "Ürün eklenemedi."); return; }
    onDegisti();
    degistir(o.id, { urun_id: data.id as string, carpan: "1" }, o);
  };

  const [bilgi, setBilgi] = useState<string | null>(null);
  const karar = async (liste: { o: Oneri; karar: "onayla" | "reddet" | "takip_etme" }[], anahtar: string, bekleyen = 0) => {
    setBilgi(null);
    if (!liste.length) { setHata("Bu faturada stok ürünü seçilmiş kalem yok. Her satırda ürünü seçin, stokta tutmadıklarınız için \"Takip etme\" deyin."); return; }
    const eksik = liste.filter(x => x.karar === "onayla" && !sec(x.o).urun_id);
    if (eksik.length) { setHata(`Önce stok ürünü seçin: ${eksik.map(x => x.o.kalem_adi).join(", ")}`); return; }
    setMesgul(anahtar); setHata(null);
    const { data, error } = await supabase.rpc("stok_giris_karar", {
      p_kararlar: liste.map(({ o, karar }) => ({ id: o.id, karar, urun_id: sec(o).urun_id || null, carpan: miktarOku(sec(o).carpan) || 1, hatirla: true })),
    });
    setMesgul(null);
    if (error) { setHata(error.message); return; }
    const r = data as { onaylanan: number; urunu_eksik: number };
    if (r.urunu_eksik) setHata(`${r.urunu_eksik} kalem miktarı olmadığı için işlenmedi.`);
    if (r.onaylanan) setBilgi(`${r.onaylanan} kalem stoğa işlendi.${bekleyen ? ` ${bekleyen} kalemde ürün seçilmediği için bekliyor.` : ""}`);
    setSecim({});
    await yukle();
    if (r.onaylanan) onDegisti();
  };

  const bagla = async (baglar: { oneri_id: string; irsaliye_kalem_id: string; fark_isle: boolean }[], anahtar: string) => {
    if (!baglar.length) return;
    setMesgul(anahtar); setHata(null);
    const { error } = await supabase.rpc("irsaliye_bagla", { p_baglar: baglar });
    setMesgul(null);
    if (error) { setHata(error.message); return; }
    await yukle(); onDegisti();
  };

  if (!oneriler.length) return null;
  return (
    <div className="rounded-2xl border border-sky-500/30 bg-kart p-4 space-y-3">
      <button onClick={() => setAcik(!acik)} className="w-full flex items-center justify-between gap-2">
        <h2 className="text-xs font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
          <PackageCheck size={14} className="text-sky-400" /> Faturadan gelen mal · stoğa işlensin mi? <span className="text-sky-300">({faturalar.length} fatura, {oneriler.length} kalem)</span>
        </h2>
        {acik ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {hata && <p className="text-[13px] text-red-400">{hata}</p>}
      {bilgi && <p className="text-[13px] text-emerald-300">{bilgi}</p>}
      {acik && faturalar.map(([gib, kalemler]) => {
        const f = kalemler[0];
        const acikKalemler = kalemler.filter(o => !irsaliye[gib]?.satirlar.some(x => x.oneri_id === o.id));
        const eslesen = acikKalemler.filter(o => sec(o).urun_id);
        const eslesmeyen = acikKalemler.filter(o => !sec(o).urun_id);
        return (
          <div key={gib} className="rounded-xl border border-cizgi p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-bold">
                {f.iade && <span className="text-orange-300">İADE · </span>}{f.tedarikci} <span className="text-gray-500 font-normal">· {fmtTarih(f.tarih)} · {gib}</span>
              </p>
              <div className="flex gap-1.5">
                <button disabled={!!mesgul || !eslesen.length} title={eslesen.length ? "" : "Önce satırlarda stok ürünü seçin"}
                  onClick={() => karar(eslesen.map(o => ({ o, karar: "onayla" as const })), gib, eslesmeyen.length)}
                  className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg">
                  {mesgul === gib ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {eslesen.length ? `Eşleşenleri stoğa işle (${eslesen.length})` : "Eşleşen kalem yok"}
                </button>
                {eslesmeyen.length > 0 && (
                  <button disabled={!!mesgul} title="Stokta tutmadığınız kalemler (sebze, temizlik…): bu kalem adları bir daha sorulmaz"
                    onClick={() => { if (confirm(`${eslesmeyen.length} kalem (${eslesmeyen.slice(0, 4).map(o => o.kalem_adi).join(", ")}${eslesmeyen.length > 4 ? "…" : ""}) stokta takip edilmesin mi? Bu adlar bir daha sorulmaz.`)) karar(eslesmeyen.map(o => ({ o, karar: "takip_etme" as const })), gib + "-t"); }}
                    className="text-[11px] font-semibold text-gray-500 hover:text-yazi border border-cizgi px-2.5 py-1.5 rounded-lg">
                    {mesgul === gib + "-t" ? "…" : `Seçilmeyenleri takip etme (${eslesmeyen.length})`}
                  </button>
                )}
                <button disabled={!!mesgul} onClick={() => karar(kalemler.map(o => ({ o, karar: "reddet" as const })), gib + "-r")}
                  className="text-[11px] font-semibold text-gray-500 hover:text-red-300 border border-cizgi px-2.5 py-1.5 rounded-lg">Faturayı işleme</button>
              </div>
            </div>
            {irsaliye[gib] && irsaliye[gib].satirlar.length > 0 && (() => {
              const ie = irsaliye[gib];
              return (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 space-y-1.5">
                  <p className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5"><Link2 size={12} />
                    İrsaliyesi bulundu: {ie.belge_no || "numarasız"} · {ie.tarih ? fmtTarih(ie.tarih) : ""} {ie.teslim ? "(teslim alındı, stokta)" : "(henüz teslim alınmadı)"}
                  </p>
                  <table className="w-full text-[11px]">
                    <thead><tr className="text-gray-500"><th className="text-left font-semibold">Ürün</th><th className="text-right font-semibold">İrsaliye</th><th className="text-right font-semibold">Fatura</th><th className="text-right font-semibold">Fark</th></tr></thead>
                    <tbody>
                      {ie.satirlar.map(x => (
                        <tr key={x.oneri_id} className="border-t border-cizgi/50">
                          <td className="py-1">{x.urun}</td>
                          <td className="py-1 text-right">{sayi(x.irsaliye_miktar)} {x.birim}</td>
                          <td className="py-1 text-right">{sayi(x.fatura_miktar)} {x.birim}</td>
                          <td className={`py-1 text-right font-bold ${Math.abs(x.fark) < 0.001 ? "text-emerald-400" : "text-amber-300"}`}>{Math.abs(x.fark) < 0.001 ? "✓" : `${x.fark > 0 ? "+" : ""}${sayi(x.fark)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ie.faturada_olmayan.length > 0 && <p className="text-[10px] text-amber-300">İrsaliyede olup faturada olmayan: {ie.faturada_olmayan.map(x => `${x.urun} ${sayi(x.miktar)} ${x.birim || ""}`).join(", ")}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {ie.satirlar.some(x => Math.abs(x.fark) >= 0.001) && ie.teslim && (
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        <input type="checkbox" checked={!!farkIsle[gib]} onChange={e => setFarkIsle(f => ({ ...f, [gib]: e.target.checked }))} /> Farkları faturaya göre stokta düzelt
                      </label>
                    )}
                    <button disabled={!!mesgul} onClick={() => bagla(ie.satirlar.map(x => ({ oneri_id: x.oneri_id, irsaliye_kalem_id: x.irsaliye_kalem_id, fark_isle: !!farkIsle[gib] })), gib + "-b")}
                      className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-3 py-1.5 rounded-lg">
                      {mesgul === gib + "-b" ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} İrsaliyeye bağla ({ie.satirlar.length} kalem)
                    </button>
                    <span className="text-[10px] text-gray-500">{ie.teslim ? "Stoğa tekrar girmez." : "Fatura miktarıyla stoğa girer."}</span>
                  </div>
                </div>
              );
            })()}
            {kalemler.filter(o => !irsaliye[gib]?.satirlar.some(x => x.oneri_id === o.id)).map(o => {
              const s = sec(o); const u = urunMap.get(s.urun_id);
              const bosIrs = irsaliye[gib]?.faturada_olmayan || [];
              const carpan = miktarOku(s.carpan) || 1;
              return (
                <div key={o.id} className={`grid grid-cols-1 lg:grid-cols-[1.2fr_1.3fr_80px_1fr_auto] gap-2 items-center rounded-lg p-2 ${s.urun_id ? "bg-alan/50" : "bg-amber-500/5 border border-amber-500/20"}`}>
                  <div className="text-[11px] min-w-0">
                    <p className="font-semibold truncate" title={o.kalem_adi}>{o.kalem_adi}</p>
                    <p className="text-gray-500">{sayi(Number(o.fatura_miktar))} {(o.fatura_birim || "").toLowerCase()}{o.fatura_birim_fiyat != null ? ` · ${sayi(o.fatura_birim_fiyat)} ₺/${(o.fatura_birim || "birim").toLowerCase()}` : ""}</p>
                  </div>
                  <select value={s.urun_id} onChange={e => e.target.value === "__yeni" ? yeniUrun(o) : degistir(o.id, { urun_id: e.target.value }, o)} className={inp + " w-full"}>
                    <option value="">— Stok ürünü seçin —</option>
                    <option value="__yeni">➕ Yeni ürün olarak ekle: {o.kalem_adi.slice(0, 40)}</option>
                    {sirali.map(x => <option key={x.id} value={x.id}>{x.urun_adi}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[10px] text-gray-500" title="1 fatura birimi kaç stok birimi? Ör. 1 koli = 10 kg">
                    × <input inputMode="decimal" value={s.carpan} onChange={e => degistir(o.id, { carpan: e.target.value }, o)} className={inp + " w-16"} />
                  </label>
                  <p className="text-[11px]">
                    {u ? <>= <b>{sayi(Number(o.fatura_miktar) * carpan)} {u.birim}</b> {o.iade ? "stoktan düşer" : "stoğa girer"}</> : <span className="text-amber-300">Ürün seçilmedi</span>}
                    {cift.get(o.id) && <span className="flex items-center gap-1 text-orange-300 mt-0.5"><AlertTriangle size={11} /> Çift giriş olabilir: {cift.get(o.id)}</span>}
                  </p>
                  <div className="flex gap-1 justify-end">
                    {bosIrs.length > 0 && (
                      <span className="flex items-center gap-1">
                        <select value={elleBag[o.id] || ""} onChange={e => setElleBag(b => ({ ...b, [o.id]: e.target.value }))} className={inp + " max-w-[150px]"} title="Bu kalem irsaliyedeki hangi ürün?">
                          <option value="">İrsaliyedeki…</option>
                          {bosIrs.map(x => <option key={x.irsaliye_kalem_id} value={x.irsaliye_kalem_id}>{x.urun} {sayi(x.miktar)} {x.birim || ""}</option>)}
                        </select>
                        <button disabled={!!mesgul || !elleBag[o.id]} onClick={() => bagla([{ oneri_id: o.id, irsaliye_kalem_id: elleBag[o.id], fark_isle: false }], o.id + "-b")} title="İrsaliyedeki kaleme bağla (çarpan öğrenilir)"
                          className="p-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 disabled:opacity-30"><Link2 size={13} /></button>
                      </span>
                    )}
                    <button disabled={!!mesgul || !s.urun_id} onClick={() => karar([{ o, karar: "onayla" }], o.id)} title="Stoğa işle"
                      className="p-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30">
                      {mesgul === o.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    </button>
                    <button disabled={!!mesgul} onClick={() => karar([{ o, karar: "reddet" }], o.id + "-r")} title="Bu sefer işleme"
                      className="p-1.5 rounded-lg border border-cizgi text-gray-500 hover:text-red-300"><X size={13} /></button>
                    <button disabled={!!mesgul} onClick={() => karar([{ o, karar: "takip_etme" }], o.id + "-t")} title="Bu kalemi stokta takip etme (bir daha sorma)"
                      className="p-1.5 rounded-lg border border-cizgi text-gray-500 hover:text-yazi"><EyeOff size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {acik && <p className="text-[10px] text-gray-600">Seçtiğiniz ürün ve çarpan hatırlanır; aynı tedarikçiden aynı kalem bir dahaki sefere otomatik eşleşir. <EyeOff size={10} className="inline" /> = stokta takip edilmeyen kalem (elektrik, internet…), bir daha sorulmaz.</p>}
    </div>
  );
}
