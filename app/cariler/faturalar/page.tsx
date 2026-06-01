"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Search, FileText, Trash2, X, Loader2, CheckCircle2,
  AlertTriangle, Calendar, Building2, TrendingDown, Filter, Upload
} from "lucide-react";

interface Cari { id: string; unvan: string; cari_kodu: string; }
interface Fatura {
  id: string; cari_id: string; cari_unvan: string; fatura_no: string;
  fatura_tarihi: string; vade_tarihi: string; tutar: number; kdv: number;
  toplam_tutar: number; aciklama: string; durum: string; islendi: boolean; created_at: string;
}

const inputCls = "w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/50 text-white text-sm h-10 px-3 rounded-xl outline-none transition-all placeholder:text-gray-700";
const fmt = (v: number) => new Intl.NumberFormat("tr-TR").format(Math.round(v));
const fmtTarih = (t: string) => { if (!t) return "—"; const [y, m, d] = t.split("-"); return `${d}.${m}.${y}`; };

export default function FaturalarPage() {
  const supabase = createClient();
  const [faturalar, setFaturalar] = useState<Fatura[]>([]);
  const [cariler, setCariler] = useState<Cari[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [aramaMetni, setAramaMetni] = useState("");
  const [durumFiltre, setDurumFiltre] = useState<"hepsi" | "bekliyor" | "odendi" | "gecikti">("hepsi");
  const [modalAcik, setModalAcik] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [toast, setToast] = useState<{ tip: "basari" | "hata"; mesaj: string } | null>(null);
  const [seciliFatura, setSeciliFatura] = useState<Fatura | null>(null);

  const [form, setForm] = useState({
    cari_id: "", fatura_no: "",
    fatura_tarihi: new Date().toISOString().split("T")[0],
    vade_tarihi: "",
    tutar: "", kdv: "20", toplam_tutar: "",
    aciklama: "", durum: "bekliyor",
  });

  const showToast = (tip: "basari" | "hata", mesaj: string) => {
    setToast({ tip, mesaj });
    setTimeout(() => setToast(null), 3000);
  };

  const veriCek = useCallback(async () => {
    setYukleniyor(true);
    const [{ data: f }, { data: c }] = await Promise.all([
      supabase.from("faturalar").select("*").order("fatura_tarihi", { ascending: false }),
      supabase.from("cariler").select("id, unvan, cari_kodu").order("unvan"),
    ]);
    if (f) setFaturalar(f as Fatura[]);
    if (c) setCariler(c as Cari[]);
    setYukleniyor(false);
  }, []);

  useEffect(() => { veriCek(); }, [veriCek]);

  // KDV hesapla
  useEffect(() => {
    const tutar = parseFloat(form.tutar) || 0;
    const kdv = parseFloat(form.kdv) || 0;
    const toplam = tutar + (tutar * kdv / 100);
    setForm(prev => ({ ...prev, toplam_tutar: toplam.toFixed(2) }));
  }, [form.tutar, form.kdv]);

  const kaydet = async () => {
    if (!form.cari_id || !form.fatura_no || !form.tutar) {
      showToast("hata", "Cari, fatura no ve tutar zorunlu."); return;
    }
    setFormSaving(true);
    const cari = cariler.find(c => c.id === form.c