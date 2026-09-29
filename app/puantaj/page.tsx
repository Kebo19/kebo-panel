"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useYetki } from "@/lib/useYetki";
import { bugun, fmtTarih } from "@/lib/tarih";
import { fmt, fmtEsnek } from "@/lib/para";
import {
  PUANTAJ_DURUMLARI, DURUM_ETIKET, DURUM_KISA, DURUM_RENK, durumGecerliMi,
  ayinGunleri, aylikOzet, puantajHaritasi, personelToplami, puantajCsv, calismaAraligindaMi,
  type AylikOzet, type PuantajDurum, type PuantajKaydi, type ParaKaydi,
} from "@/lib/puantaj";
import { ClipboardList, ChevronLeft, ChevronRight, FileDown, Loader2, RefreshCw, X, Info, Trash2 } from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Personel {
  id: number; isim: string; departman?: string | null; durum: string;
  ise_giris_tarihi?: string | null; isten_cikis_tarihi?: string | null;
}
interface Kayit extends PuantajKaydi { personel_id: number; aciklama?: string | null; ekleyen?: string | null; }

const AY_ADLARI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pz", "Pt", "Sa", "Ça", "Pe", "Cu", "Ct"];
const haftaGunu = (t: string) => { const [y, m, d] = t.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

function ayKaydir(ay: string, n: number): string {
  const [y, m] = ay.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── SAYFA ────────────────────────────────────────────────────────────────────

export default function PuantajPage() {
  const supabase = createClient();
  const { yukleniyor: yetkiYukleniyor, izin, kullaniciAdi } = useYetki();
  const gorebilir = izin("puantaj");
  const duzenleyebilir = izin("puantaj_duzenle");

  const [ay, setAy] = useState(() => bugun().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState("");
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [kayitlar, setKayitlar] = useState<Kayit[]>([]);
  const [avanslar, setAvanslar] = useState<ParaKaydi[]>([]);
  const [kesintiler, setKesintiler] = useState<ParaKaydi[]>([]);

  // Hücre düzenleme (puantaj_duzenle yetkisi)
  const [duzen, setDuzen] = useState<{ personel: Personel; gun: string; durum: PuantajDurum | null; fazla: string; aciklama: string } | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const yil = Number(ay.slice(0, 4));
  const ayNo = Number(ay.slice(5, 7));
  const gunler = useMemo(() => ayinGunleri(yil, ayNo), [yil, ayNo]);
  const ilkGun = gunler[0], sonGun = gunler[gunler.length - 1];
  const bugunStr = bugun();

  const veriCek = useCallback(async () => {
    setLoading(true); setHata("");
    const [pRes, kRes, aRes, keRes] = await Promise.all([
      supabase.from("personeller").select("id,isim,departman,durum,ise_giris_tarihi,isten_cikis_tarihi").order("isim"),
      supabase.from("puantaj").select("personel_id,tarih,durum,fazla_mesai_saat,aciklama,ekleyen").gte("tarih", ilkGun).lte("tarih", sonGun),
      supabase.from("avanslar").select("personel_id,personel_isim,tutar").gte("tarih", ilkGun).lte("tarih", sonGun),
      supabase.from("kesintiler").select("personel_id,personel_isim,tutar").gte("tarih", ilkGun).lte("tarih", sonGun),
    ]);
    if (pRes.error || kRes.error) setHata((pRes.error || kRes.error)?.message || "Veri alınamadı.");
    setPersoneller((pRes.data || []) as Personel[]);
    setKayitlar((kRes.data || []) as Kayit[]);
    setAvanslar((aRes.data || []) as ParaKaydi[]);
    setKesintiler((keRes.data || []) as ParaKaydi[]);
    setLoading(false);
  }, [supabase, ilkGun, sonGun]);

  useEffect(() => { if (!yetkiYukleniyor) veriCek(); }, [veriCek, yetkiYukleniyor]);

  const harita = useMemo(() => puantajHaritasi(kayitlar), [kayitlar]);

  // Satırlar: aktif personel (o ay işe girmiş olanlar) + o ay ayrılanlar + o ay kaydı olan herkes
  const satirlar = useMemo(() => personeller.filter(p => {
    if (harita[String(p.id)]) return true;
    const giris = p.ise_giris_tarihi && /^\d{4}-\d{2}-\d{2}/.test(p.ise_giris_tarihi) ? p.ise_giris_tarihi.slice(0, 10) : null;
    if (giris && giris > sonGun) return false;
    if (p.durum === "aktif") return true;
    const cikis = p.isten_cikis_tarihi?.slice(0, 10);
    return !!cikis && cikis >= ilkGun && cikis <= sonGun;
  }), [personeller, harita, ilkGun, sonGun]);

  const ozetler = useMemo(() => {
    const o: Record<string, AylikOzet> = {};
    for (const p of satirlar) {
      o[String(p.id)] = aylikOzet(Object.values(harita[String(p.id)] || {}), gunler,
        { giris: p.ise_giris_tarihi, cikis: p.isten_cikis_tarihi, sonGun: bugunStr });
    }
    return o;
  }, [satirlar, harita, gunler, bugunStr]);

  const avansToplam = useMemo(() => Object.fromEntries(satirlar.map(p => [String(p.id), personelToplami(avanslar, p)])), [satirlar, avanslar]);
  const kesintiToplam = useMemo(() => Object.fromEntries(satirlar.map(p => [String(p.id), personelToplami(kesintiler, p)])), [satirlar, kesintiler]);

  const genel = useMemo(() => {
    const t = { calisti: 0, izin: 0, rapor: 0, gelmedi: 0, ucretsiz_izin: 0, hafta_tatili: 0, fazlaMesai: 0, girilmemis: 0 };
    Object.values(ozetler).forEach(o => (Object.keys(t) as (keyof AylikOzet)[]).forEach(k => { t[k] += o[k]; }));
    return t;
  }, [ozetler]);

  const csvIndir = () => {
    const csv = puantajCsv(satirlar, gunler, harita, ozetler, avansToplam, kesintiToplam);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `puantaj-${ay}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const hucreAc = (p: Personel, gun: string) => {
    if (!duzenleyebilir) return;
    const k = harita[String(p.id)]?.[gun];
    setDuzen({
      personel: p, gun,
      durum: k && durumGecerliMi(k.durum) ? k.durum : null,
      fazla: k && Number(k.fazla_mesai_saat) ? String(k.fazla_mesai_saat).replace(".", ",") : "",
      aciklama: (k as Kayit | undefined)?.aciklama || "",
    });
  };

  const hucreKaydet = async () => {
    if (!duzen || !duzen.durum) return;
    setKaydediliyor(true);
    const fazla = Math.max(0, Number(duzen.fazla.replace(",", ".")) || 0);
    const { error } = await supabase.from("puantaj").upsert({
      personel_id: duzen.personel.id, tarih: duzen.gun, durum: duzen.durum,
      fazla_mesai_saat: fazla, aciklama: duzen.aciklama.trim() || null, ekleyen: kullaniciAdi || null,
    }, { onConflict: "personel_id,tarih" });
    setKaydediliyor(false);
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setDuzen(null); veriCek();
  };

  const hucreSil = async () => {
    if (!duzen) return;
    if (!confirm(`${duzen.personel.isim} · ${fmtTarih(duzen.gun)} puantaj kaydı silinsin mi?`)) return;
    setKaydediliyor(true);
    const { error } = await supabase.from("puantaj").delete().eq("personel_id", duzen.personel.id).eq("tarih", duzen.gun);
    setKaydediliyor(false);
    if (error) { alert("Silinemedi: " + error.message); return; }
    setDuzen(null); veriCek();
  };

  if (!yetkiYukleniyor && !gorebilir) {
    return <div className="min-h-screen bg-[#f4f5f7] flex items-center justify-center text-sm text-gray-500">Bu sayfayı görme yetkiniz yok.</div>;
  }

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] font-sans antialiased pb-10">
      {/* HEADER */}
      <div className="sticky top-0 z-30 border-b border-[#e2e5eb] bg-[#f4f5f7]/95 backdrop-blur-xl">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight leading-none">Puantaj</h1>
              <p className="text-[11px] text-gray-500 leading-none mt-1">{satirlar.length} personel · {AY_ADLARI[ayNo - 1]} {yil}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white border border-[#e2e5eb] rounded-xl">
              <button onClick={() => setAy(ayKaydir(ay, -1))} className="p-2 text-gray-500 hover:text-[#1a1f2e]" aria-label="Önceki ay"><ChevronLeft size={15} /></button>
              <input type="month" value={ay} onChange={e => e.target.value && setAy(e.target.value)}
                className="bg-transparent text-[13px] font-semibold outline-none h-8 px-1" />
              <button onClick={() => setAy(ayKaydir(ay, 1))} className="p-2 text-gray-500 hover:text-[#1a1f2e]" aria-label="Sonraki ay"><ChevronRight size={15} /></button>
            </div>
            <button onClick={veriCek} className="p-2 text-gray-600 hover:text-[#1a1f2e] border border-[#e2e5eb] bg-white rounded-xl" aria-label="Yenile">
              <RefreshCw size={14} />
            </button>
            <button onClick={csvIndir} disabled={loading || satirlar.length === 0}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-3 py-2 rounded-xl">
              <FileDown size={14} /> Excel&apos;e aktar (mali müşavir)
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="flex items-start gap-2 text-[12px] text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>Maaş hesabı yakında; bu tablo maaş hesabının temelidir. Günlük puantaj, günlük rapordaki &quot;Bugün Çalışanlar&quot; kartından girilir.
            {duzenleyebilir ? " Bir hücreye tıklayarak düzeltebilirsiniz." : " Düzeltme için puantaj düzenleme yetkisi gerekir."}</span>
        </div>

        {/* Lejant */}
        <div className="flex flex-wrap gap-1.5">
          {PUANTAJ_DURUMLARI.map(d => (
            <span key={d} className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${DURUM_RENK[d]}`}>{DURUM_KISA[d]} = {DURUM_ETIKET[d]}</span>
          ))}
          <span className="text-[11px] text-gray-500 px-2 py-0.5">Küçük sayı = fazla mesai (saat) · boş = girilmemiş</span>
        </div>

        {hata && <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{hata}</div>}

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-blue-600" /></div>
        ) : satirlar.length === 0 ? (
          <div className="bg-white border border-[#e2e5eb] rounded-2xl py-12 text-center text-gray-500 text-sm">Bu ay için personel yok.</div>
        ) : (
          <>
            {/* ── GÜNLÜK TABLO ── */}
            <div className="bg-white border border-[#e2e5eb] rounded-2xl overflow-x-auto">
              <table className="text-[11px] border-collapse">
                <thead>
                  <tr className="bg-[#f7f8fa]">
                    <th className="sticky left-0 z-10 bg-[#f7f8fa] text-left font-semibold text-gray-600 px-3 py-2 border-b border-r border-[#e2e5eb] min-w-[140px]">Personel</th>
                    {gunler.map(g => {
                      const hg = haftaGunu(g);
                      return (
                        <th key={g} className={`px-0.5 py-1.5 border-b border-[#e2e5eb] font-semibold text-center min-w-[30px] ${hg === 0 ? "text-red-500" : hg === 6 ? "text-orange-500" : "text-gray-600"} ${g === bugunStr ? "bg-blue-50" : ""}`}>
                          <div>{Number(g.slice(8, 10))}</div>
                          <div className="text-[9px] font-normal opacity-70">{GUN_KISA[hg]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map(p => {
                    const pid = String(p.id);
                    return (
                      <tr key={p.id} className="border-b border-[#f0f1f4] last:border-b-0">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-[#e2e5eb] whitespace-nowrap">
                          <Link href={`/personel/${p.id}`} className="font-semibold text-[#1a1f2e] hover:text-blue-600">{p.isim}</Link>
                          <div className="text-[10px] text-gray-500">{p.departman || "—"}{p.durum === "ayrildi" ? " · ayrıldı" : ""}</div>
                        </td>
                        {gunler.map(g => {
                          const k = harita[pid]?.[g];
                          const d = k && durumGecerliMi(k.durum) ? k.durum : null;
                          const fm = Number(k?.fazla_mesai_saat) || 0;
                          const aralikta = calismaAraligindaMi(g, p.ise_giris_tarihi, p.isten_cikis_tarihi);
                          const eksik = !d && aralikta && g <= bugunStr;
                          return (
                            <td key={g} className={`px-0.5 py-1 text-center ${g === bugunStr ? "bg-blue-50/60" : ""} ${!aralikta && !d ? "bg-[#f7f8fa]" : ""}`}>
                              <button type="button" onClick={() => hucreAc(p, g)} disabled={!duzenleyebilir}
                                title={d ? `${DURUM_ETIKET[d]}${fm ? ` · ${fm} sa fazla mesai` : ""}${k?.aciklama ? ` · ${k.aciklama}` : ""}` : eksik ? "Girilmemiş" : ""}
                                className={`relative w-7 h-7 rounded-md border text-[11px] font-bold inline-flex items-center justify-center ${duzenleyebilir ? "cursor-pointer hover:ring-1 hover:ring-blue-400" : "cursor-default"} ${
                                  d ? DURUM_RENK[d] : eksik ? "border-dashed border-gray-300 text-gray-300" : "border-transparent text-transparent"}`}>
                                {d ? DURUM_KISA[d] : eksik ? "·" : ""}
                                {fm > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-amber-500 text-white text-[8px] leading-[14px]">{fmtEsnek(fm)}</span>}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── AYLIK TOPLAMLAR ── */}
            <div className="bg-white border border-[#e2e5eb] rounded-2xl overflow-x-auto">
              <div className="px-4 py-3 border-b border-[#e2e5eb] text-[13px] font-bold">Aylık toplamlar</div>
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-[#f7f8fa] text-gray-600">
                    <th className="text-left font-semibold px-3 py-2">Personel</th>
                    {["Çalıştı", "İzin", "Rapor", "Gelmedi", "Ücretsiz izin", "Hafta tatili", "Fazla mesai (sa)", "Girilmemiş", "Avans", "Kesinti"].map(b => (
                      <th key={b} className="font-semibold px-2 py-2 text-right whitespace-nowrap">{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map(p => {
                    const pid = String(p.id);
                    const o = ozetler[pid];
                    return (
                      <tr key={p.id} className="border-t border-[#f0f1f4]">
                        <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{p.isim}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-700 font-semibold">{o.calisti}</td>
                        <td className="px-2 py-1.5 text-right">{o.izin || ""}</td>
                        <td className="px-2 py-1.5 text-right">{o.rapor || ""}</td>
                        <td className="px-2 py-1.5 text-right text-red-700">{o.gelmedi || ""}</td>
                        <td className="px-2 py-1.5 text-right">{o.ucretsiz_izin || ""}</td>
                        <td className="px-2 py-1.5 text-right">{o.hafta_tatili || ""}</td>
                        <td className="px-2 py-1.5 text-right text-amber-700">{o.fazlaMesai ? fmtEsnek(o.fazlaMesai) : ""}</td>
                        <td className={`px-2 py-1.5 text-right ${o.girilmemis ? "text-gray-500" : "text-gray-300"}`}>{o.girilmemis}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{avansToplam[pid] ? `₺${fmt(avansToplam[pid])}` : ""}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{kesintiToplam[pid] ? `₺${fmt(kesintiToplam[pid])}` : ""}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-[#e2e5eb] bg-[#f7f8fa] font-bold">
                    <td className="px-3 py-2">Toplam</td>
                    <td className="px-2 py-2 text-right">{genel.calisti}</td>
                    <td className="px-2 py-2 text-right">{genel.izin}</td>
                    <td className="px-2 py-2 text-right">{genel.rapor}</td>
                    <td className="px-2 py-2 text-right">{genel.gelmedi}</td>
                    <td className="px-2 py-2 text-right">{genel.ucretsiz_izin}</td>
                    <td className="px-2 py-2 text-right">{genel.hafta_tatili}</td>
                    <td className="px-2 py-2 text-right">{fmtEsnek(genel.fazlaMesai)}</td>
                    <td className="px-2 py-2 text-right">{genel.girilmemis}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">₺{fmt(Object.values(avansToplam).reduce((a, b) => a + b, 0))}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">₺{fmt(Object.values(kesintiToplam).reduce((a, b) => a + b, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── HÜCRE DÜZENLE (puantaj_duzenle) ── */}
      {duzen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !kaydediliyor && setDuzen(null)}>
          <div className="bg-white border border-[#e2e5eb] rounded-2xl p-5 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-bold">{duzen.personel.isim}</p>
                <p className="text-[12px] text-gray-500">{fmtTarih(duzen.gun)} · {GUN_KISA[haftaGunu(duzen.gun)]}</p>
              </div>
              <button onClick={() => setDuzen(null)} className="text-gray-500 hover:text-[#1a1f2e]" aria-label="Kapat"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {PUANTAJ_DURUMLARI.map(d => (
                <button key={d} type="button" onClick={() => setDuzen({ ...duzen, durum: d })}
                  className={`text-[12px] font-semibold h-9 rounded-lg border ${duzen.durum === d ? DURUM_RENK[d] : "bg-white text-gray-600 border-[#e2e5eb] hover:border-[#c9ced8]"}`}>
                  {DURUM_KISA[d]} · {DURUM_ETIKET[d]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-2 items-center mb-4">
              <label className="text-[12px] text-gray-600">Fazla mesai (sa)</label>
              <input type="text" inputMode="decimal" value={duzen.fazla} placeholder="0"
                onChange={e => setDuzen({ ...duzen, fazla: e.target.value.replace(/[^0-9,.]/g, "").slice(0, 5) })}
                className="h-9 bg-[#f7f8fa] border border-[#e2e5eb] rounded-lg px-2 text-[13px] outline-none focus:border-blue-500/40" />
              <label className="text-[12px] text-gray-600">Açıklama</label>
              <input type="text" value={duzen.aciklama} placeholder="Opsiyonel"
                onChange={e => setDuzen({ ...duzen, aciklama: e.target.value })}
                className="h-9 bg-[#f7f8fa] border border-[#e2e5eb] rounded-lg px-2 text-[13px] outline-none focus:border-blue-500/40" />
            </div>
            <div className="flex gap-2">
              {harita[String(duzen.personel.id)]?.[duzen.gun] && (
                <button onClick={hucreSil} disabled={kaydediliyor} className="flex items-center gap-1 text-[12px] font-semibold text-red-600 border border-red-200 px-3 rounded-lg hover:bg-red-50">
                  <Trash2 size={13} /> Sil
                </button>
              )}
              <button onClick={() => setDuzen(null)} className="flex-1 text-[12px] font-semibold text-gray-600 border border-[#e2e5eb] h-9 rounded-lg">İptal</button>
              <button onClick={hucreKaydet} disabled={kaydediliyor || !duzen.durum}
                className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 h-9 rounded-lg">
                {kaydediliyor && <Loader2 size={13} className="animate-spin" />} Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
