"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useParams } from "next/navigation";

import { supabase } from "@/lib/supabase";

import { Card } from "@/components/ui/card";

import {
  Globe,
  Truck,
  CreditCard,
  Receipt,
  User,
  Wallet,
  ArrowLeft,
  CalendarDays,
  TrendingUp,
  BadgeDollarSign,
} from "lucide-react";

export default function ReportDetailPage() {

  const params = useParams();

  const reportId =
    Array.isArray(params.id)
      ? params.id[0]
      : params.id;

  const [report, setReport] =
    useState<any>(null);

  const [loading, setLoading] =
    useState(true);

  const [errorText, setErrorText] =
    useState("");

  async function getReport() {

    if (!reportId) {

      setErrorText("Rapor ID bulunamadı");

      setLoading(false);

      return;
    }

    const { data, error } =
      await supabase
        .from("daily_reports")
        .select("*")
        .eq("id", Number(reportId))
        .limit(1);

    if (error) {

      setErrorText(
        JSON.stringify(error, null, 2)
      );

      setLoading(false);

      return;
    }

    if (!data || data.length === 0) {

      setErrorText(
        "Rapor bulunamadı"
      );

      setLoading(false);

      return;
    }

    setReport(data[0]);

    setLoading(false);
  }

  useEffect(() => {
    getReport();
  }, [reportId]);

  if (loading) {

    return (

      <main className="min-h-screen bg-[#07090d] text-white flex items-center justify-center">

        <div className="text-center">

          <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>

          <p className="text-sm text-gray-400 mt-4">
            Rapor yükleniyor...
          </p>

        </div>

      </main>

    );
  }

  if (errorText) {

    return (

      <main className="min-h-screen bg-[#07090d] text-white flex items-center justify-center p-6">

        <Card className="bg-[#111315] border border-red-500/30 rounded-2xl p-6 max-w-2xl w-full">

          <h1 className="text-3xl font-black text-red-400">
            HATA
          </h1>

          <pre className="text-sm text-gray-300 mt-5 whitespace-pre-wrap overflow-auto">
            {errorText}
          </pre>

        </Card>

      </main>

    );
  }

  const totalKasa =
    Number(report.total_online || 0) +
    Number(report.total_door || 0) +
    Number(report.cash || 0) +
    Number(report.credit_card || 0) +
    Number(report.edenred || 0);

  const totalSales =
    Number(report.total_online || 0) +
    Number(report.total_door || 0);

  return (

    <main className="min-h-screen bg-[#07090d] text-white p-4">

      {/* TOPBAR */}

      <div className="flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between mb-6">

        <div>

          <Link
            href="/raporlar"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-orange-400 transition-all"
          >

            <ArrowLeft size={16} />

            Raporlara Dön

          </Link>

          <p className="text-orange-400 text-[10px] uppercase tracking-[0.3em] font-bold mt-4">
            RAPOR DETAYI
          </p>

          <h1 className="text-4xl font-black mt-1">
            {report.report_date}
          </h1>

        </div>

        <Card className="bg-orange-500 border-0 rounded-2xl px-6 py-5 text-black">

          <p className="text-[10px] uppercase font-black opacity-70">
            Toplam Kasa
          </p>

          <h2 className="text-4xl font-black mt-1">
            {totalKasa} ₺
          </h2>

        </Card>

      </div>

      {/* KPI */}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-4">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-[10px] text-gray-400 uppercase">
                Günlük Ciro
              </p>

              <h2 className="text-3xl font-black mt-2">
                {totalSales} ₺
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">

              <TrendingUp
                size={20}
                className="text-green-400"
              />

            </div>

          </div>

        </Card>

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-4">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-[10px] text-gray-400 uppercase">
                Nakit
              </p>

              <h2 className="text-3xl font-black mt-2">
                {report.cash || 0} ₺
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">

              <Wallet
                size={20}
                className="text-blue-400"
              />

            </div>

          </div>

        </Card>

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-4">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-[10px] text-gray-400 uppercase">
                Kart
              </p>

              <h2 className="text-3xl font-black mt-2">
                {report.credit_card || 0} ₺
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">

              <CreditCard
                size={20}
                className="text-orange-400"
              />

            </div>

          </div>

        </Card>

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-4">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-[10px] text-gray-400 uppercase">
                Gider
              </p>

              <h2 className="text-3xl font-black mt-2">
                {report.expense_amount || 0} ₺
              </h2>

            </div>

            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">

              <Receipt
                size={20}
                className="text-red-400"
              />

            </div>

          </div>

        </Card>

      </div>

      {/* CONTENT */}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* ONLINE */}

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-5">

          <div className="flex items-center gap-2 mb-5">

            <Globe
              size={18}
              className="text-orange-400"
            />

            <h2 className="text-xl font-black">
              Online Satışlar
            </h2>

          </div>

          <div className="space-y-3 text-sm">

            <div className="flex items-center justify-between">
              <span className="text-gray-400">
                Online Toplam
              </span>

              <span className="font-black text-lg">
                {report.total_online || 0} ₺
              </span>
            </div>

          </div>

        </Card>

        {/* KAPIDA */}

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-5">

          <div className="flex items-center gap-2 mb-5">

            <Truck
              size={18}
              className="text-green-400"
            />

            <h2 className="text-xl font-black">
              Kapıda Ödeme
            </h2>

          </div>

          <div className="space-y-3 text-sm">

            <div className="flex items-center justify-between">
              <span className="text-gray-400">
                Kapıda Toplam
              </span>

              <span className="font-black text-lg">
                {report.total_door || 0} ₺
              </span>
            </div>

          </div>

        </Card>

        {/* ÖDEME */}

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-5">

          <div className="flex items-center gap-2 mb-5">

            <BadgeDollarSign
              size={18}
              className="text-blue-400"
            />

            <h2 className="text-xl font-black">
              Ödeme Tipleri
            </h2>

          </div>

          <div className="space-y-4">

            <div className="bg-[#0d1117] rounded-xl p-4 flex items-center justify-between">

              <span className="text-gray-400">
                Nakit
              </span>

              <span className="font-black text-lg">
                {report.cash || 0} ₺
              </span>

            </div>

            <div className="bg-[#0d1117] rounded-xl p-4 flex items-center justify-between">

              <span className="text-gray-400">
                Kredi Kartı
              </span>

              <span className="font-black text-lg">
                {report.credit_card || 0} ₺
              </span>

            </div>

            <div className="bg-[#0d1117] rounded-xl p-4 flex items-center justify-between">

              <span className="text-gray-400">
                Edenred
              </span>

              <span className="font-black text-lg">
                {report.edenred || 0} ₺
              </span>

            </div>

          </div>

        </Card>

        {/* GIDER */}

        <Card className="bg-[#111315] border border-white/5 rounded-2xl p-5">

          <div className="flex items-center gap-2 mb-5">

            <Receipt
              size={18}
              className="text-red-400"
            />

            <h2 className="text-xl font-black">
              Gider Detayı
            </h2>

          </div>

          <div className="space-y-4">

            <div className="bg-[#0d1117] rounded-xl p-4">

              <p className="text-xs text-gray-500 uppercase">
                Gider Türü
              </p>

              <h2 className="text-lg font-black mt-2">
                {report.expense_type || "-"}
              </h2>

            </div>

            <div className="bg-[#0d1117] rounded-xl p-4">

              <p className="text-xs text-gray-500 uppercase">
                Açıklama
              </p>

              <h2 className="text-lg font-black mt-2">
                {report.expense_note || "-"}
              </h2>

            </div>

          </div>

        </Card>

      </div>

      {/* FOOTER */}

      <Card className="bg-[#111315] border border-white/5 rounded-2xl p-5 mt-5">

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">

          <div className="flex items-center gap-4">

            <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center">

              <User
                size={22}
                className="text-orange-400"
              />

            </div>

            <div>

              <p className="text-xs text-gray-500 uppercase">
                Raporu Oluşturan
              </p>

              <h2 className="text-2xl font-black mt-1">
                {report.created_by || "-"}
              </h2>

            </div>

          </div>

          <div className="flex items-center gap-3">

            <CalendarDays
              size={16}
              className="text-gray-500"
            />

            <p className="text-sm text-gray-400">
              {report.report_date}
            </p>

          </div>

        </div>

      </Card>

    </main>
  );
}