"use client";

// FİRMA CARİ EKSTRESİ KARŞILAŞTIRMA (31.10.2026)
// Firmanın gönderdiği cari hesap ekstresi (PDF / fotoğraf) yüklenir, yapay zekâ satırları okur,
// sistemdeki faturalar ve ödemelerle karşılaştırılır: hangi fatura / ödeme sistemde yok, hangisi
// ekstrede yok, tutarı farklı olanlar ve bakiye farkı. Şimdilik SADECE GÖSTERİR, hiçbir şey yazmaz;
// sonuç "Sonucu kopyala" ile metin olarak alınabilir.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { yuklemeIcinHazirla, jsonCevap } from "@/lib/gorsel";
import { cariKarsilastir, cariBul, type EkstreOkuma, type SisFatura, type SisOdeme, type EkstreKalemi } from "@/lib/cariMutabakat";
import { fmt2 } from "@/lib/para";
import { fmtTarih } from "@/lib/tarih";
import { X, Loader2, FileUp, CheckCircle2, AlertTriangle, Copy } from "lucide-react";

// Liste kutusu ve satırı (bileşen dışında: her çizimde yeniden oluşturulmasın)
function Liste({ baslik, renk, satirlar }: { baslik: string; renk: string; satirlar: React.ReactNode[] }) {
  return satirlar.length ? (
  <div className="rounded-xl border border-cizgi bg-kart overflow-hidden">
    <p className={`px-4 py-2.5 border-b border-cizgi text-[14px] font-bold ${renk}`}>{baslik} ({satirlar.length})</p>
    <div className="divide-y divide-cizgi/60">{satirlar}</div>
  </div>
) : null;
}
function S({ sol, sag, alt, k: key }: { sol: string; sag: string; alt?: string | null; k: string }) {
  return (
  <div key={key} className="px-4 py-2 text-[14px]">
    <div className="flex justify-between gap-3"><span className="text-yazi">{sol}</span><span className="font-bold tabular-nums">{sag}</span></div>
    {alt && <p className="text-[12px] text-gray-500 truncate">{alt}</p>}
  </div>
);
}

interface CariOzet { id: string; unvan: string; vergi_no: string | null }

export default function CariEkstreKarsilastir({ cariId, onKapat }: { cariId?: string; onKapat: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const girdi = useRef<HTMLInputElement>(null);
  const [cariler, setCariler] = useState<CariOzet[]>([]);
  const [secili, setSecili] = useState<string>(cariId || "");
  const [okuma, setOkuma] = useState<EkstreOkuma | null>(null);
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [okunuyor, setOkunuyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [veri, setVeri] = useState<{ faturalar: SisFatura[]; odemeler: SisOdeme[] } | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  useEffect(() => {
    supabase.from("cariler").select("id, unvan, vergi_no").order("unvan").then(({ data }) => setCariler((data || []) as CariOzet[]));
  }, [supabase]);

  useEffect(() => {
    if (!secili) { setVeri(null); return; }
    let iptal = false;
    (async () => {
      const [f, o] = await Promise.all([
        supabase.from("faturalar").select("id, fatura_no, fatura_tarihi, toplam_tutar").eq("cari_id", secili).order("fatura_tarihi"),
        supabase.from("cari_odemeler").select("id, tarih, tutar, odeme_yontemi, aciklama").eq("cari_id", secili).order("tarih"),
      ]);
      if (!iptal) setVeri({ faturalar: (f.data || []) as SisFatura[], odemeler: (o.data || []) as SisOdeme[] });
    })();
    return () => { iptal = true; };
  }, [secili, supabase]);

  const oku = async (file: File) => {
    setHata(null); setOkuma(null); setOkunuyor(true); setDosyaAdi(file.name);
    try {
      const dosya = file.type === "application/pdf"
        ? { base64: await new Promise<string>((ok, red) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = red; r.readAsDataURL(file); }), mediaType: "application/pdf" }
        : await yuklemeIcinHazirla(file);
      const res = await fetch("/api/cari-ekstre-tara", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dosyaBase64: dosya.base64, mediaType: dosya.mediaType }) });
      const { veri: v, hata: h } = await jsonCevap(res);
      if (h) { setHata(h); return; }
      const ok = v as unknown as EkstreOkuma;
      setOkuma(ok);
      if (!cariId) { const c = cariBul(ok, cariler); if (c) setSecili(c.id); }
    } catch (e) { setHata(e instanceof Error ? e.message : String(e)); }
    finally { setOkunuyor(false); }
  };

  const k = useMemo(() => okuma && veri ? cariKarsilastir(okuma, veri.faturalar, veri.odemeler) : null, [okuma, veri]);
  const cari = cariler.find(c => c.id === secili);
  const temiz = k && !k.eksikFatura.length && !k.eksikOdeme.length && !k.fazlaFatura.length && !k.fazlaOdeme.length && !k.tutarFarkli.length && (k.bakiyeFarki == null || Math.abs(k.bakiyeFarki) < 1);

  const ekSatir = (e: EkstreKalemi) => `${fmtTarih(e.tarih)} · ${e.evrak_no || "—"} · ₺${fmt2(e.tutar)}${e.aciklama ? ` · ${e.aciklama}` : ""}`;
  const metin = () => {
    if (!k || !okuma) return "";
    const s = [`${cari?.unvan || okuma.firma} — cari ekstre karşılaştırması (${fmtTarih(k.bas)} – ${fmtTarih(k.bit)})`,
      `Ekstre bakiyesi: ${k.ekstreBakiye == null ? "—" : "₺" + fmt2(k.ekstreBakiye)} · Sistem: ₺${fmt2(k.sistemBakiye)}${k.bakiyeFarki != null ? ` · Fark: ₺${fmt2(k.bakiyeFarki)}` : ""}`];
    const blok = (b: string, l: string[]) => { if (l.length) s.push("", `${b} (${l.length}):`, ...l.map(x => "• " + x)); };
    blok("Sistemde OLMAYAN faturalar", k.eksikFatura.map(ekSatir));
    blok("Sistemde OLMAYAN ödemeler", k.eksikOdeme.map(ekSatir));
    blok("Tutarı farklı faturalar", k.tutarFarkli.map(x => `${x.sistem.fatura_no} · ekstre ₺${fmt2(x.ekstre.tutar)} · sistem ₺${fmt2(Number(x.sistem.toplam_tutar))}`));
    blok("Ekstrede OLMAYAN faturalar (sistemde fazla)", k.fazlaFatura.map(f => `${fmtTarih(f.fatura_tarihi)} · ${f.fatura_no || "—"} · ₺${fmt2(Number(f.toplam_tutar))}`));
    blok("Ekstrede OLMAYAN ödemeler (sistemde fazla)", k.fazlaOdeme.map(o => `${fmtTarih(o.tarih)} · ₺${fmt2(Number(o.tutar))} · ${o.odeme_yontemi || ""}`));
    return s.join("\n");
  };
  const kopyala = async () => { try { await navigator.clipboard.writeText(metin()); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); } catch { /* izin yok */ } };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-2 sm:p-6" onClick={onKapat}>
      <div className="w-full max-w-3xl max-h-[95vh] flex flex-col rounded-2xl border border-cizgi bg-zemin" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-cizgi">
          <h2 className="text-[18px] font-black text-yazi flex items-center gap-2"><FileUp size={18} /> Firma ekstresi karşılaştır</h2>
          <button onClick={onKapat} aria-label="Kapat" className="p-2 text-gray-500 hover:text-yazi"><X size={18} /></button>
        </div>

        <div className="px-4 py-3 space-y-3 border-b border-cizgi">
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={girdi} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) oku(f); e.target.value = ""; }} />
            <button type="button" onClick={() => girdi.current?.click()} disabled={okunuyor}
              className="h-11 px-4 rounded-xl text-[14px] font-black text-[#1a1408] kebo-btn-altin disabled:opacity-40 flex items-center gap-2">
              {okunuyor ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} {okunuyor ? "Okunuyor…" : okuma ? "Başka PDF" : "Ekstre PDF'i seç"}
            </button>
            {dosyaAdi && <span className="text-[13px] text-gray-600 truncate max-w-[16rem]">{dosyaAdi}</span>}
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <span className="text-gray-600 shrink-0">Firma</span>
            <select value={secili} onChange={e => setSecili(e.target.value)}
              className="flex-1 bg-alan border border-cizgi-guclu text-yazi h-11 px-3 rounded-lg outline-none focus:border-altin">
              <option value="">{okuma?.firma ? `Seçin (ekstrede: ${okuma.firma})` : "Seçin"}</option>
              {cariler.map(c => <option key={c.id} value={c.id}>{c.unvan}</option>)}
            </select>
          </label>
          {hata && <p className="text-[14px] text-red-400">{hata}</p>}
          {!okuma && !okunuyor && <p className="text-[13px] text-gray-500">Firmanın gönderdiği cari hesap ekstresini (PDF ya da fotoğraf) seçin. Okunur, sistemdeki faturalar ve ödemelerle karşılaştırılır. Hiçbir şey değiştirilmez.</p>}
        </div>

        {k && okuma && (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-cizgi bg-kart px-4 py-3"><p className="text-[12px] text-gray-500">Ekstre bakiyesi ({fmtTarih(k.bit)})</p><p className="text-[20px] font-black">{k.ekstreBakiye == null ? "—" : `₺${fmt2(k.ekstreBakiye)}`}</p></div>
              <div className="rounded-xl border border-cizgi bg-kart px-4 py-3"><p className="text-[12px] text-gray-500">Sistemdeki borç</p><p className="text-[20px] font-black">₺{fmt2(k.sistemBakiye)}</p></div>
              <div className={`rounded-xl border px-4 py-3 ${k.bakiyeFarki != null && Math.abs(k.bakiyeFarki) >= 1 ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                <p className="text-[12px] text-gray-500">Fark</p>
                <p className={`text-[20px] font-black ${k.bakiyeFarki != null && Math.abs(k.bakiyeFarki) >= 1 ? "text-amber-300" : "text-emerald-300"}`}>{k.bakiyeFarki == null ? "—" : `₺${fmt2(k.bakiyeFarki)}`}</p>
              </div>
            </div>
            <p className="text-[13px] text-gray-600">Dönem {fmtTarih(k.bas)} – {fmtTarih(k.bit)} · {okuma.satirlar.length} satır okundu · {k.faturaEslesen.length} fatura ve {k.odemeEslesen.length} ödeme tuttu
              {k.acilisVar && " · ekstrede devir satırı var (karşılaştırmaya girmedi)"}</p>
            {temiz && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-[15px] font-bold text-emerald-300 flex items-center gap-2"><CheckCircle2 size={16} /> Ekstre sistemle tamamen tutuyor.</p>}
            <Liste baslik="Sistemde OLMAYAN faturalar" renk="text-amber-300" satirlar={k.eksikFatura.map((e, i) => <S key={i} k={`ef${i}`} sol={`${fmtTarih(e.tarih)} · ${e.evrak_no || "—"}`} sag={`₺${fmt2(e.tutar)}`} alt={e.aciklama} />)} />
            <Liste baslik="Sistemde OLMAYAN ödemeler" renk="text-amber-300" satirlar={k.eksikOdeme.map((e, i) => <S key={i} k={`eo${i}`} sol={`${fmtTarih(e.tarih)} · ${e.tur === "iade" ? "iade" : "ödeme"}${e.evrak_no ? " · " + e.evrak_no : ""}`} sag={`₺${fmt2(e.tutar)}`} alt={e.aciklama} />)} />
            <Liste baslik="Tutarı farklı faturalar" renk="text-amber-300" satirlar={k.tutarFarkli.map((x, i) => <S key={i} k={`tf${i}`} sol={`${fmtTarih(x.ekstre.tarih)} · ${x.sistem.fatura_no || "—"}`} sag={`ekstre ₺${fmt2(x.ekstre.tutar)} · sistem ₺${fmt2(Number(x.sistem.toplam_tutar))}`} />)} />
            <Liste baslik="Ekstrede OLMAYAN faturalar (sistemde fazla)" renk="text-sky-300" satirlar={k.fazlaFatura.map((f, i) => <S key={i} k={`ff${i}`} sol={`${fmtTarih(f.fatura_tarihi)} · ${f.fatura_no || "—"}`} sag={`₺${fmt2(Number(f.toplam_tutar))}`} />)} />
            <Liste baslik="Ekstrede OLMAYAN ödemeler (sistemde fazla)" renk="text-sky-300" satirlar={k.fazlaOdeme.map((o, i) => <S key={i} k={`fo${i}`} sol={`${fmtTarih(o.tarih)} · ${o.odeme_yontemi || "ödeme"}`} sag={`₺${fmt2(Number(o.tutar))}`} alt={o.aciklama} />)} />
          </div>
        )}
        {okuma && !secili && <p className="px-4 py-3 text-[14px] text-amber-300 flex items-center gap-2"><AlertTriangle size={15} /> Firmayı seçin, karşılaştırma yapılsın.</p>}

        {k && (
          <div className="px-4 py-3 border-t border-cizgi flex justify-end gap-2">
            <button type="button" onClick={kopyala} className="h-11 px-4 rounded-xl border border-cizgi text-[14px] text-gray-700 hover:text-yazi flex items-center gap-2">
              <Copy size={15} /> {kopyalandi ? "Kopyalandı" : "Sonucu kopyala"}
            </button>
            <button type="button" onClick={onKapat} className="h-11 px-5 rounded-xl border border-cizgi text-[14px] text-gray-700 hover:text-yazi">Kapat</button>
          </div>
        )}
      </div>
    </div>
  );
}
