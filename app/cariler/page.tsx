"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Search, Building2, Phone, FileText, Trash2, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface Cari {
  id: string; cari_kodu: string; unvan: string; vergi_no: string;
  vergi_dairesi: string; telefon: string; adres: string; tip: string; created_at: string;
}

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";

export default function CarilerPage() {
  const supabase = createClient();
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [modalAcik, setModalAcik] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);

  const [form, setForm] = useState({
    cari_kodu: "", unvan: "", vergi_no: "", vergi_dairesi: "",
    telefon: "", adres: "", tip: "tedarikci",
  });

  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3000);
  };

  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    const { data } = await supabase.from("cariler").select("*").order("unvan");
    if (data) setCariler(data as Cari[]);
    setYukleniyor(false);
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  const kaydet = async () => {
    if (!form.unvan) { showToast("hata", "Ünvan zorunlu."); return; }
    setFormSaving(true);
    const { error } = await supabase.from("cariler").insert([form]);
    setFormSaving(false);
    if (error) { showToast("hata", "Kayıt hatası: " + error.message); return; }
    showToast("basari", "Cari kaydedildi.");
    setModalAcik(false);
    setForm({ cari_kodu: "", unvan: "", vergi_no: "", vergi_dairesi: "", telefon: "", adres: "", tip: "tedarikci" });
    veriCek();
  };

  const sil = async (id: string) => {
    if (!confirm("Bu cariyi silmek istiyor musunuz?")) return;
    await supabase.from("cariler").delete().eq("id", id);
    veriCek();
  };

  const filtreliCariler = cariler.filter(c =>
    c.unvan?.toLowerCase().includes(aramaMetni.toLowerCase()) ||
    c.vergi_no?.includes(aramaMetni) ||
    c.cari_kodu?.toLowerCase().includes(aramaMetni.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#060810] text-white font-sans antialiased pb-10">

      {toast && (
        <div className={`fixed top-5 right-5 z-[80] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-sm font-semibold ${toast.tip === "basari" ? "bg-emerald-950 border-emerald-500/30 text-emerald-400" : "bg-red-950 border-red-500/30 text-red-400"}`}>
          {toast.tip === "basari" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toast.mesaj}
        </div>
      )}

      {/* HEADER */}
      <div className="sticky top-0 z-40 border-b border-[#0f1624] bg-[#060810]/95 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">Cariler</h1>
              <p className="text-[10px] text-gray-600 mt-0.5">{cariler.length} cari</p>
            </div>
          </div>
          <button onClick={() => setModalAcik(true)}
            className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl transition-colors">
            <Plus size={14} /> Cari Ekle
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* ARAMA */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input value={aramaMetni} onChange={e => setAramaMetni(e.target.value)}
            placeholder="Ünvan, vergi no veya cari kodu ara..."
            className="w-full bg-[#0c0f1a] border border-[#1a2236] text-white text-xs h-9 pl-9 pr-3 rounded-xl outline-none focus:border-blue-500/40 placeholder:text-gray-700" />
        </div>

        {/* LİSTE */}
        {yukleniyor ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtreliCariler.length === 0 ? (
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl py-16 text-center text-gray-600 text-xs uppercase tracking-widest">
            Cari bulunamadı
          </div>
        ) : (
          <div className="space-y-2">
            {filtreliCariler.map(c => (
              <div key={c.id} className="bg-[#0c0f1a] border border-[#1a2236] hover:border-[#2a3550] rounded-2xl p-4 flex items-center justify-between gap-3 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <Building2 size={16} className="text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{c.unvan}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.cari_kodu && <span className="text-[11px] text-gray-600">{c.cari_kodu}</span>}
                      {c.vergi_no && <span className="text-[11px] text-gray-600">VN: {c.vergi_no}</span>}
                      {c.telefon && <span className="text-[11px] text-gray-600 flex items-center gap-1"><Phone size={9} />{c.telefon}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${c.tip === "tedarikci" ? "bg-orange-500/10 text-orange-400" : "bg-blue-500/10 text-blue-400"}`}>
                    {c.tip === "tedarikci" ? "Tedarikçi" : "Müşteri"}
                  </span>
                  <button onClick={() => sil(c.id)} className="text-gray-700 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL */}
      {modalAcik && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-black text-white">Yeni Cari</h3>
              <button onClick={() => setModalAcik(false)} className="text-gray-600 hover:text-white"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Cari Tipi</p>
                <select value={form.tip} onChange={e => setForm({ ...form, tip: e.target.value })} className={inputCls}>
                  <option value="tedarikci" className="bg-[#0c0f1a]">Tedarikçi</option>
                  <option value="musteri" className="bg-[#0c0f1a]">Müşteri</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Ünvan *</p>
                <input value={form.unvan} onChange={e => setForm({ ...form, unvan: e.target.value })}
                  placeholder="Firma adı..." className={inputCls} />
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Cari Kodu</p>
                <input value={form.cari_kodu} onChange={e => setForm({ ...form, cari_kodu: e.target.value })}
                  placeholder="Opsiyonel..." className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Vergi No</p>
                  <input value={form.vergi_no} onChange={e => setForm({ ...form, vergi_no: e.target.value })}
                    placeholder="1234567890" className={inputCls} />
                </div>
                <div>
                  <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Vergi Dairesi</p>
                  <input value={form.vergi_dairesi} onChange={e => setForm({ ...form, vergi_dairesi: e.target.value })}
                    placeholder="..." className={inputCls} />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Telefon</p>
                <input value={form.telefon} onChange={e => setForm({ ...form, telefon: e.target.value })}
                  placeholder="05xx..." className={inputCls} />
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Adres</p>
                <input value={form.adres} onChange={e => setForm({ ...form, adres: e.target.value })}
                  placeholder="Adres..." className={inputCls} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setModalAcik(false)}
                  className="flex-1 text-xs font-semibold text-gray-500 hover:text-white border border-[#1a2236] py-2.5 rounded-xl transition-colors">
                  İptal
                </button>
                <button onClick={kaydet} disabled={formSaving}
                  className="flex-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {formSaving ? <Loader2 size={12} className="animate-spin" /> : null} Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}