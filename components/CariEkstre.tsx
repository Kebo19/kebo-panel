"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bugun, fmtTarih } from "@/lib/tarih";
import { fmt2 } from "@/lib/para";
import { cariEkstre, csvMetni, csvIndir, type EkstreFatura, type EkstreOdeme } from "@/lib/cariEkstre";
import { FileSpreadsheet, Printer, X, Loader2, ScrollText } from "lucide-react";

// CARİ EKSTRE — seçili tarih aralığında faturalar (borç) ve ödemeler (alacak), devreden bakiye ve
// yürüyen bakiye. Yazdır/PDF yeni pencerede yazdırma dostu sayfa açar; CSV Excel'de Türkçe açılır.

const inputCls = "bg-[#f7f8fa] border border-[#e2e5eb] text-[#1a1f2e] text-xs h-9 px-3 rounded-xl outline-none focus:border-blue-500/40";
const kacis = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export default function CariEkstre({ cari, onKapat }: {
  cari: { id: string; unvan: string; vergi_no?: string | null; vergi_dairesi?: string | null };
  onKapat: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [bas, setBas] = useState(() => `${bugun().slice(0, 4)}-01-01`);
  const [bit, setBit] = useState(() => bugun());
  const [faturalar, setFaturalar] = useState<EkstreFatura[]>([]);
  const [odemeler, setOdemeler] = useState<EkstreOdeme[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let iptal = false;
    (async () => {
      const [{ data: f }, { data: o }] = await Promise.all([
        supabase.from("faturalar").select("id, fatura_no, fatura_tarihi, toplam_tutar, aciklama").eq("cari_id", cari.id),
        supabase.from("cari_odemeler").select("id, tarih, tutar, aciklama, odeme_yontemi").eq("cari_id", cari.id),
      ]);
      if (iptal) return;
      setFaturalar((f || []) as EkstreFatura[]);
      setOdemeler((o || []) as EkstreOdeme[]);
      setYukleniyor(false);
    })();
    return () => { iptal = true; };
  }, [cari.id, supabase]);

  const ekstre = useMemo(() => cariEkstre(faturalar, odemeler, bas, bit), [faturalar, odemeler, bas, bit]);
  const bakiyeYazi = (b: number) => `₺${fmt2(Math.abs(b))}${b > 0.004 ? " (B)" : b < -0.004 ? " (A)" : ""}`;
  const dosyaAdi = `ekstre-${cari.unvan.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40)}-${bas}_${bit}`;

  const csv = () => {
    csvIndir(`${dosyaAdi}.csv`, csvMetni([
      ["Cari", cari.unvan], ["Vergi No", cari.vergi_no || ""], ["Dönem", `${fmtTarih(bas)} - ${fmtTarih(bit)}`], [],
      ["Tarih", "Tür", "Belge / Yöntem", "Açıklama", "Borç", "Alacak", "Bakiye"],
      [fmtTarih(bas), "", "", "Devreden bakiye", null, null, ekstre.devreden],
      ...ekstre.satirlar.map(s => [fmtTarih(s.tarih), s.tur === "fatura" ? "Fatura" : "Ödeme", s.belge, s.aciklama, s.borc || null, s.alacak || null, s.bakiye]),
      ["", "", "", "Toplam", ekstre.toplamBorc, ekstre.toplamAlacak, ekstre.kapanis],
    ]));
  };

  const yazdir = () => {
    const w = window.open("", "_blank"); if (!w) { alert("Açılır pencere engellendi; tarayıcıda izin verin."); return; }
    const satirlar = ekstre.satirlar.map(s => `<tr><td>${fmtTarih(s.tarih)}</td><td>${s.tur === "fatura" ? "Fatura" : "Ödeme"}</td><td>${kacis(s.belge)}</td><td>${kacis(s.aciklama)}</td>
      <td class="r">${s.borc ? fmt2(s.borc) : ""}</td><td class="r">${s.alacak ? fmt2(s.alacak) : ""}</td><td class="r b">${bakiyeYazi(s.bakiye)}</td></tr>`).join("");
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>${kacis(dosyaAdi)}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;font-size:11px;color:#111;background:#fff;padding:28px}
    .ust{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1f2e;padding-bottom:12px;margin-bottom:16px}
    h1{font-size:18px;font-weight:900}.k{color:#555;line-height:1.7;text-align:right}
    table{width:100%;border-collapse:collapse}th{background:#1a1f2e;color:#fff;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase}
    td{padding:6px 8px;border-bottom:1px solid #e5e7eb}.r{text-align:right;white-space:nowrap}.b{font-weight:700}
    .dev td{background:#f3f4f6;font-style:italic}tfoot td{background:#1a1f2e;color:#fff;font-weight:700}
    .not{margin-top:14px;color:#777;font-size:9px}@media print{@page{margin:14mm;size:A4}}</style></head><body>
    <div class="ust"><div><h1>Cari Hesap Ekstresi</h1><div style="font-size:13px;font-weight:700;margin-top:4px">${kacis(cari.unvan)}</div>
    <div style="color:#555">${cari.vergi_no ? `VN: ${kacis(cari.vergi_no)}` : ""}${cari.vergi_dairesi ? ` · ${kacis(cari.vergi_dairesi)}` : ""}</div></div>
    <div class="k"><div><strong>KEBO</strong></div><div>Dönem: ${fmtTarih(bas)} – ${fmtTarih(bit)}</div><div>Oluşturma: ${new Date().toLocaleString("tr-TR")}</div></div></div>
    <table><thead><tr><th>Tarih</th><th>Tür</th><th>Belge / Yöntem</th><th>Açıklama</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th></tr></thead>
    <tbody><tr class="dev"><td>${fmtTarih(bas)}</td><td></td><td></td><td>Devreden bakiye</td><td></td><td></td><td class="r b">${bakiyeYazi(ekstre.devreden)}</td></tr>${satirlar}</tbody>
    <tfoot><tr><td colspan="4">Toplam (${ekstre.satirlar.length} hareket)</td><td class="r">${fmt2(ekstre.toplamBorc)}</td><td class="r">${fmt2(ekstre.toplamAlacak)}</td><td class="r">${bakiyeYazi(ekstre.kapanis)}</td></tr></tfoot></table>
    <p class="not">Borç: tedarikçi faturası · Alacak: yapılan ödeme · (B) tedarikçiye borç bakiyesi, (A) alacak bakiyesi.</p>
    </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-[#ffffff] border border-[#e2e5eb] rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#e2e5eb]">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-[#1a1f2e] flex items-center gap-2"><ScrollText size={15} className="text-blue-600" /> Cari Ekstre</h3>
            <p className="text-[11px] text-gray-500 truncate">{cari.unvan}{cari.vergi_no ? ` · VN ${cari.vergi_no}` : ""}</p>
          </div>
          <button onClick={onKapat} className="p-1 text-gray-600 hover:text-[#1a1f2e]"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b border-[#e2e5eb] flex flex-wrap items-center gap-2">
          <input type="date" value={bas} onChange={e => setBas(e.target.value)} className={inputCls} />
          <span className="text-gray-500 text-xs">—</span>
          <input type="date" value={bit} onChange={e => setBit(e.target.value)} className={inputCls} />
          <div className="flex gap-1.5">
            <button onClick={() => { setBas(`${bugun().slice(0, 4)}-01-01`); setBit(bugun()); }} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-black/[0.04] text-gray-600 hover:bg-blue-600 hover:text-white">Bu yıl</button>
            <button onClick={() => { const y = Number(bugun().slice(0, 4)) - 1; setBas(`${y}-01-01`); setBit(`${y}-12-31`); }} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-black/[0.04] text-gray-600 hover:bg-blue-600 hover:text-white">Geçen yıl</button>
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={csv} disabled={yukleniyor} className="flex items-center gap-1.5 text-xs font-bold text-gray-700 border border-[#e2e5eb] hover:bg-black/[0.03] disabled:opacity-40 px-3 py-2 rounded-xl"><FileSpreadsheet size={13} /> CSV</button>
            <button onClick={yazdir} disabled={yukleniyor} className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-3 py-2 rounded-xl"><Printer size={13} /> Yazdır / PDF</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {yukleniyor ? (
            <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
          ) : (
            <table className="w-full text-xs min-w-[640px]">
              <thead className="sticky top-0 bg-[#ffffff]">
                <tr className="border-b border-[#e2e5eb] text-[10px] text-gray-500 uppercase tracking-widest">
                  <th className="text-left px-4 py-2.5">Tarih</th>
                  <th className="text-left px-3 py-2.5">Tür</th>
                  <th className="text-left px-3 py-2.5">Belge / Açıklama</th>
                  <th className="text-right px-3 py-2.5 text-red-600">Borç</th>
                  <th className="text-right px-3 py-2.5 text-emerald-600">Alacak</th>
                  <th className="text-right px-4 py-2.5">Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef0f3]">
                <tr className="bg-[#f7f8fa] italic">
                  <td className="px-4 py-2.5 text-gray-600">{fmtTarih(bas)}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-gray-600">Devreden bakiye</td>
                  <td /><td />
                  <td className="px-4 py-2.5 text-right font-bold">{bakiyeYazi(ekstre.devreden)}</td>
                </tr>
                {ekstre.satirlar.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-gray-500">Bu aralıkta hareket yok</td></tr>
                ) : ekstre.satirlar.map((s, i) => (
                  <tr key={i} className="hover:bg-black/[0.02]">
                    <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{fmtTarih(s.tarih)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${s.tur === "fatura" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>{s.tur === "fatura" ? "Fatura" : "Ödeme"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[#1a1f2e]">
                      <span className="font-semibold">{s.belge}</span>{s.belge && s.aciklama ? <span className="text-gray-500"> · {s.aciklama}</span> : s.aciklama}
                    </td>
                    <td className="px-3 py-2.5 text-right text-red-600 font-semibold whitespace-nowrap">{s.borc ? `₺${fmt2(s.borc)}` : ""}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-600 font-semibold whitespace-nowrap">{s.alacak ? `₺${fmt2(s.alacak)}` : ""}</td>
                    <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap">{bakiyeYazi(s.bakiye)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0">
                <tr className="bg-[#1a1f2e] text-white font-bold">
                  <td colSpan={3} className="px-4 py-3">Toplam · {ekstre.satirlar.length} hareket</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">₺{fmt2(ekstre.toplamBorc)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">₺{fmt2(ekstre.toplamAlacak)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{bakiyeYazi(ekstre.kapanis)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <p className="px-5 py-2.5 border-t border-[#e2e5eb] text-[10px] text-gray-500">
          (B) tedarikçiye borç, (A) alacak bakiyesi. Ekstre tüm fatura ve ödemeleri içerir; eski kayıtlarda ödeme–fatura bağı bilinmediğinden kartlardaki &quot;Toplam Borç&quot;tan farklı olabilir.
        </p>
      </div>
    </div>
  );
}
