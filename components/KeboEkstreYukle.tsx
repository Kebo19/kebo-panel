"use client";

// KEBO EKSTRESİ YÜKLE — Kebo'nun her cuma gönderdiği "Cari Hesap Ekstresi" PDF'i yüklenir,
// sistemdeki Kebo carisiyle karşılaştırılır ve onaylanınca:
//   1) ekstrede olup sistemde olmayan faturalar eklenir,
//   2) yeni tahsilatlar (havale, kredi kartı, platform virmanı, iade/gider faturası) ödeme olarak eklenir — kasaya yansımaz,
//   3) faturaların ödendi/bekliyor durumu, açık faturalar toplamı Kebo bakiyesine eşit olacak şekilde ayarlanır.
// Hiçbir şey önizleme onaylanmadan yazılmaz.

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, FileUp, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import {
  mutabakatPlani, varsayilanOdemeBaslangici, odemeYontemiAdi, ekstreAnahtar,
  EKSTRE_ONEK, DUZELTME_ACIKLAMA, type EkstreSonuc, type EkstreSatir, type SistemFatura, type SistemOdeme,
} from "@/lib/keboEkstre";
import { GIDER_HESAPLARI, HESAP_ETIKET, kartMi } from "@/lib/cari";
import { fmt2 } from "@/lib/para";
import { fmtTarih as fmtTarihOrtak } from "@/lib/tarih";

interface Props {
  cari: { id: string; unvan: string; varsayilan_kdv?: number | null };
  faturalar: SistemFatura[];
  odemeler: SistemOdeme[];
  onKapat: () => void;
  onTamam: (mesaj: string) => void;
}

const fmt = fmt2;
const fmtTarih = (t: string | null) => (t && fmtTarihOrtak(t)) || "—";
const inputCls = "w-full bg-alan border border-cizgi hover:border-cizgi-guclu focus:border-altin/50 text-yazi text-sm h-10 px-3 rounded-xl outline-none transition-all";

function Bolum({ baslik, sayi, tutar, renk, children, acikBaslar = false }: {
  baslik: string; sayi: number; tutar?: number; renk: string; children: React.ReactNode; acikBaslar?: boolean;
}) {
  const [acik, setAcik] = useState(acikBaslar);
  return (
    <div className="rounded-xl border border-cizgi bg-alan/40 overflow-hidden">
      <button type="button" onClick={() => setAcik(a => !a)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-bold text-yazi">{baslik} <span className={`ml-1 text-xs font-black ${renk}`}>{sayi}</span></span>
        <span className="flex items-center gap-3">
          {tutar !== undefined && <span className={`text-sm font-black ${renk}`}>₺{fmt(tutar)}</span>}
          {sayi > 0 && (acik ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />)}
        </span>
      </button>
      {acik && sayi > 0 && <div className="border-t border-cizgi max-h-64 overflow-y-auto">{children}</div>}
    </div>
  );
}

const Satir = ({ s, tutar, sag }: { s: EkstreSatir; tutar: number; sag?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs border-b border-cizgi last:border-b-0">
    <div className="min-w-0">
      <p className="text-yazi font-semibold truncate">{fmtTarih(s.tarih)} · {s.evrakTuru} · {s.evrakNo}</p>
      {s.aciklama && <p className="text-gray-500 truncate">{s.aciklama}</p>}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {sag}
      <span className="font-black text-yazi">₺{fmt(tutar)}</span>
    </div>
  </div>
);

export default function KeboEkstreYukle({ cari, faturalar, odemeler, onKapat, onTamam }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [okunuyor, setOkunuyor] = useState(false);
  const [isleniyor, setIsleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [ekstre, setEkstre] = useState<EkstreSonuc | null>(null);
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [baslangic, setBaslangic] = useState(() => varsayilanOdemeBaslangici(odemeler));
  // Yeni tahsilat başına hesap seçimi (boş = kasaya yansımaz)
  const [hesaplar, setHesaplar] = useState<Record<string, string>>({});

  const plan = useMemo(() => ekstre ? mutabakatPlani(ekstre, faturalar, odemeler, baslangic) : null, [ekstre, faturalar, odemeler, baslangic]);
  const toplam = (a: EkstreSatir[], k: "borc" | "alacak") => a.reduce((t, s) => t + s[k], 0);
  const faturaNo = useMemo(() => new Map(faturalar.map(f => [f.id, f])), [faturalar]);

  const dosyaSec = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    setHata(null); setEkstre(null); setDosyaAdi(dosya.name); setOkunuyor(true);
    try {
      const fd = new FormData(); fd.append("dosya", dosya);
      const yanit = await fetch("/api/kebo-ekstre", { method: "POST", body: fd });
      const veri = await yanit.json();
      if (!yanit.ok) throw new Error(veri.error || "PDF okunamadı.");
      setEkstre(veri as EkstreSonuc);
    } catch (err) {
      setHata(err instanceof Error ? err.message : String(err));
    } finally {
      setOkunuyor(false);
      if (dosyaRef.current) dosyaRef.current.value = "";
    }
  };

  const kdvAyir = (toplamTutar: number) => {
    const oran = cari.varsayilan_kdv === null || cari.varsayilan_kdv === undefined ? 0 : Number(cari.varsayilan_kdv);
    const matrah = Math.round(toplamTutar / (1 + oran / 100) * 100) / 100;
    return { tutar: matrah, kdv: Math.round((toplamTutar - matrah) * 100) / 100, toplam_tutar: toplamTutar };
  };

  const isle = async () => {
    if (!ekstre || !plan) return;
    setIsleniyor(true); setHata(null);
    try {
      // 1) Yeni faturalar
      const yeniIdler = new Map<string, string>();
      if (plan.yeniFaturalar.length) {
        const { data, error } = await supabase.from("faturalar").insert(plan.yeniFaturalar.map(s => ({
          cari_id: cari.id, cari_unvan: cari.unvan, fatura_no: s.evrakNo, fatura_tarihi: s.tarih, vade_tarihi: s.vade,
          ...kdvAyir(s.borc), aciklama: [s.aciklama, "Kebo ekstresinden"].filter(Boolean).join(" · "),
          durum: "bekliyor", islendi: false,
        }))).select("id, fatura_no");
        if (error) throw new Error("Faturalar eklenemedi: " + error.message);
        (data || []).forEach(f => yeniIdler.set(`yeni:${f.fatura_no}`, f.id));
      }
      // 2) Tutar farkları: ekstredeki tutar esas
      for (const t of plan.tutarFarklari) {
        const { error } = await supabase.from("faturalar").update(kdvAyir(t.satir.borc)).eq("id", t.fatura.id);
        if (error) throw new Error(`${t.fatura.fatura_no} güncellenemedi: ` + error.message);
      }
      // 3) Yeni tahsilatlar — faturaya bağlanmaz (bakiye eşitleme durumu ayarlar), seçilmedikçe kasaya yansımaz
      if (plan.yeniOdemeler.length) {
        const { error } = await supabase.from("cari_odemeler").insert(plan.yeniOdemeler.map(s => {
          const hesap = hesaplar[ekstreAnahtar(s)] || null;
          return {
            cari_id: cari.id, cari_unvan: cari.unvan, tutar: s.alacak, tarih: s.tarih,
            odeme_yontemi: hesap ? (kartMi(hesap) ? `Kredi Kartı (${hesap})` : hesap === "Nakit" ? "Nakit" : `Banka (${hesap})`) : odemeYontemiAdi(s.grup),
            hesap, fatura_idleri: null,
            aciklama: [EKSTRE_ONEK, s.evrakTuru, ekstreAnahtar(s), s.aciklama].filter(Boolean).join(" · "),
          };
        }));
        if (error) throw new Error("Tahsilatlar eklenemedi: " + error.message);
      }
      // 4) Bakiye eşitleme: durumlar
      const acik = new Set(plan.acikKalacak.map(id => yeniIdler.get(id) ?? id));
      // Açık kalan faturalara ekstredeki vade tarihini yaz (Kebo: fatura + 15 gün; vade kartı bunu kullanır)
      const vadeNo = new Map(ekstre.satirlar.filter(s => s.grup === "fatura" && s.vade).map(s => [s.evrakNo.trim().toUpperCase(), s.vade as string]));
      for (const f of faturalar) {
        if (!acik.has(f.id)) continue;
        const vade = vadeNo.get(f.fatura_no.trim().toUpperCase());
        if (vade && vade !== (f as { vade_tarihi?: string | null }).vade_tarihi) {
          const { error } = await supabase.from("faturalar").update({ vade_tarihi: vade }).eq("id", f.id);
          if (error) throw new Error(`${f.fatura_no} vadesi yazılamadı: ` + error.message);
        }
      }
      const kapat = [...plan.kapanacak, ...[...yeniIdler.values()].filter(id => !acik.has(id))];
      if (kapat.length) {
        const { error } = await supabase.from("faturalar").update({ durum: "odendi", islendi: true }).in("id", kapat);
        if (error) throw new Error("Fatura durumları güncellenemedi: " + error.message);
      }
      if (plan.acilacak.length) {
        const { error } = await supabase.from("faturalar").update({ durum: "bekliyor", islendi: false }).in("id", plan.acilacak);
        if (error) throw new Error("Fatura durumları güncellenemedi: " + error.message);
      }
      // 5) Küsurat düzeltmesi (en eski açık faturanın ödenmiş kısmı) — tek kayıt, her yüklemede yenilenir
      if (duzeltmeDegisti) {
        const { error: silHata } = await supabase.from("cari_odemeler").delete().eq("cari_id", cari.id).eq("aciklama", DUZELTME_ACIKLAMA);
        if (silHata) throw new Error("Eski bakiye düzeltmesi silinemedi: " + silHata.message);
      }
      if (duzeltmeDegisti && plan.duzeltme > 0.01) {
        const { error } = await supabase.from("cari_odemeler").insert([{
          cari_id: cari.id, cari_unvan: cari.unvan, tutar: plan.duzeltme, tarih: ekstre.satirlar.at(-1)?.tarih,
          odeme_yontemi: "Diğer", hesap: null, fatura_idleri: [], aciklama: DUZELTME_ACIKLAMA,
        }]);
        if (error) throw new Error("Bakiye düzeltmesi yazılamadı: " + error.message);
      }
      onTamam(`Kebo ekstresi işlendi: ${plan.yeniFaturalar.length} fatura, ${plan.yeniOdemeler.length} tahsilat eklendi. Borç ₺${fmt(ekstre.sonBakiye)} ile eşitlendi.`);
    } catch (err) {
      setHata(err instanceof Error ? err.message : String(err));
    } finally {
      setIsleniyor(false);
    }
  };

  const mevcutDuzeltme = odemeler.find(o => o.aciklama === DUZELTME_ACIKLAMA);
  const duzeltmeDegisti = !!plan && Math.abs((Number(mevcutDuzeltme?.tutar) || 0) - plan.duzeltme) > 0.01;
  const degisiklikVar = !!plan && (plan.yeniFaturalar.length + plan.tutarFarklari.length + plan.yeniOdemeler.length
    + plan.kapanacak.length + plan.acilacak.length > 0 || duzeltmeDegisti);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-kart border border-cizgi rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-cizgi shrink-0">
          <div>
            <h3 className="text-base font-black text-yazi">Kebo Ekstresi Yükle</h3>
            <p className="text-[10px] text-gray-600 mt-0.5">Kebo&apos;nun gönderdiği &quot;Cari Hesap Ekstresi&quot; PDF&apos;i</p>
          </div>
          <button onClick={onKapat} className="text-gray-600 hover:text-yazi"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <input ref={dosyaRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={dosyaSec} />
          <button type="button" onClick={() => dosyaRef.current?.click()} disabled={okunuyor || isleniyor}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-cizgi hover:border-altin/40 rounded-xl py-6 text-sm font-bold text-gray-500 hover:text-yazi transition-colors disabled:opacity-40">
            {okunuyor ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            {okunuyor ? "PDF okunuyor…" : dosyaAdi ? `${dosyaAdi} — başka PDF seç` : "PDF seç"}
          </button>

          {hata && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 flex items-center gap-2"><AlertTriangle size={13} /> {hata}</p>}

          {ekstre && plan && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-blue-500/10 border border-blue-500/25 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wide">Ekstre borç</p>
                  <p className="text-base font-black text-blue-300">₺{fmt(ekstre.toplamBorc)}</p>
                </div>
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wide">Ekstre alacak</p>
                  <p className="text-base font-black text-emerald-300">₺{fmt(ekstre.toplamAlacak)}</p>
                </div>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5">
                  <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wide">Kebo bakiyesi</p>
                  <p className="text-base font-black text-amber-300">₺{fmt(ekstre.sonBakiye)}</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">
                {ekstre.satirlar.length} satır okundu · {fmtTarih(ekstre.satirlar[0]?.tarih)} – {fmtTarih(ekstre.satirlar.at(-1)?.tarih ?? null)}
                {ekstre.raporTarihi && <> · rapor tarihi {fmtTarih(ekstre.raporTarihi)}</>}
              </p>
              {ekstre.uyarilar.length > 0 ? (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 space-y-1">
                  <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> PDF tam okunamadı — işlemeden önce kontrol edin:</p>
                  {ekstre.uyarilar.map((u, i) => <p key={i}>• {u}</p>)}
                </div>
              ) : (
                <p className="text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={13} /> Toplamlar ve bakiye PDF&apos;teki &quot;Toplam Tutarlar&quot; satırıyla birebir tutuyor.</p>
              )}

              <Bolum baslik="Sisteme eklenecek faturalar" sayi={plan.yeniFaturalar.length} tutar={toplam(plan.yeniFaturalar, "borc")} renk="text-blue-300" acikBaslar>
                {plan.yeniFaturalar.map(s => <Satir key={s.evrakNo} s={s} tutar={s.borc} />)}
              </Bolum>

              {plan.tutarFarklari.length > 0 && (
                <Bolum baslik="Tutarı farklı faturalar (ekstredeki tutar yazılacak)" sayi={plan.tutarFarklari.length} renk="text-red-300" acikBaslar>
                  {plan.tutarFarklari.map(t => (
                    <Satir key={t.fatura.id} s={t.satir} tutar={t.satir.borc}
                      sag={<span className="text-gray-500 line-through">₺{fmt(Number(t.fatura.toplam_tutar))}</span>} />
                  ))}
                </Bolum>
              )}

              <Bolum baslik="Eklenecek tahsilatlar" sayi={plan.yeniOdemeler.length} tutar={toplam(plan.yeniOdemeler, "alacak")} renk="text-emerald-300" acikBaslar>
                <p className="px-4 pt-2 text-[10px] text-gray-500">Varsayılan olarak kasaya yansımaz. Ödemeyi bu sistemde Kasa&apos;dan da düşmek isterseniz hesabını seçin.</p>
                {plan.yeniOdemeler.map(s => {
                  const k = ekstreAnahtar(s);
                  return (
                    <Satir key={k} s={s} tutar={s.alacak} sag={
                      <select value={hesaplar[k] || ""} onChange={e => setHesaplar(h => ({ ...h, [k]: e.target.value }))}
                        className="bg-alan border border-cizgi text-yazi text-[11px] h-7 px-1.5 rounded-lg outline-none max-w-[150px]">
                        <option value="" className="bg-kart">{odemeYontemiAdi(s.grup)} · kasasız</option>
                        {GIDER_HESAPLARI.map(h => <option key={h} value={h} className="bg-kart">{HESAP_ETIKET[h] || h}</option>)}
                      </select>
                    } />
                  );
                })}
              </Bolum>

              <div className="rounded-xl border border-cizgi bg-alan/40 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">Bu tarihten önceki tahsilatlar sistemde toplu girildi sayılır, tek tek eklenmez:</p>
                  <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} className={`${inputCls} !w-40 !h-8 text-xs`} />
                </div>
                <p className="text-[11px] text-gray-600">{plan.atlananOdemeler.length} eski tahsilat atlandı (₺{fmt(toplam(plan.atlananOdemeler, "alacak"))}).</p>
              </div>

              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 space-y-1.5">
                <p className="text-sm font-bold text-amber-300">Bakiye eşitleme</p>
                <p className="text-xs text-gray-400">
                  Kebo hesabı tek bakiyeyle yürür: ödemeler en eski faturaları kapatır. En yeni <b className="text-yazi">{plan.acikKalacak.length}</b> fatura açık kalacak,
                  {" "}<b className="text-yazi">{plan.kapanacak.length}</b> fatura &quot;ödendi&quot; olacak{plan.acilacak.length > 0 && <>, <b className="text-yazi">{plan.acilacak.length}</b> fatura yeniden açılacak</>}.
                  {plan.duzeltme > 0.01 && <> En eski açık faturanın ödenmiş kısmı için ₺{fmt(plan.duzeltme)} düzeltme kaydı yazılır.</>}
                </p>
                <p className="text-xs text-gray-400">İşlemden sonra cari ekranındaki <b className="text-yazi">Toplam Borç = ₺{fmt(ekstre.sonBakiye)}</b> olur.</p>
                {plan.acikKalacak.length > 0 && (
                  <p className="text-[10px] text-gray-600 truncate">Açık kalacaklar: {plan.acikKalacak.map(id => id.startsWith("yeni:") ? id.slice(5) : faturaNo.get(id)?.fatura_no).join(", ")}</p>
                )}
              </div>

              {plan.ekstredeOlmayan.length > 0 && (
                <Bolum baslik="Sistemde olup ekstrede olmayan faturalar (dokunulmaz, kontrol edin)" sayi={plan.ekstredeOlmayan.length} renk="text-red-300">
                  {plan.ekstredeOlmayan.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-2 text-xs border-b border-cizgi last:border-b-0">
                      <span className="text-yazi">{fmtTarih(f.fatura_tarihi)} · {f.fatura_no}</span>
                      <span className="font-black text-yazi">₺{fmt(Number(f.toplam_tutar))}</span>
                    </div>
                  ))}
                </Bolum>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-cizgi shrink-0 flex gap-2">
          <button onClick={onKapat} className="flex-1 text-sm font-semibold text-gray-500 hover:text-yazi border border-cizgi py-3 rounded-xl transition-colors">Kapat</button>
          <button onClick={isle} disabled={!plan || !degisiklikVar || isleniyor || okunuyor}
            className="flex-1 text-sm font-bold text-[#1a1408] kebo-btn-altin hover:brightness-110 disabled:opacity-40 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {isleniyor ? <Loader2 size={14} className="animate-spin" /> : null}
            {plan && !degisiklikVar ? "Sistem ekstreyle uyumlu" : "Ekstreyi İşle"}
          </button>
        </div>
      </div>
    </div>
  );
}
