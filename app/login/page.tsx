"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Lock, Mail, Eye, EyeOff, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("E-posta veya şifre hatalı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060810] flex items-center justify-center p-4 font-sans antialiased">

      {/* Arka plan efekti */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/8 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[200px] bg-indigo-600/6 blur-[80px] rounded-full" />
        {/* Grid */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }} />
      </div>

      <div className="relative w-full max-w-sm">

        {/* Logo & Başlık */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-2xl shadow-blue-900/50 mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2h18l-2 7H5L3 2z"/>
              <path d="M5 9v13h14V9"/>
              <path d="M9 13h6"/>
              <path d="M9 17h6"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            KEBO<span className="text-blue-500">.</span>ERP
          </h1>
          <p className="text-gray-500 text-sm mt-1.5">Yönetim Paneline Giriş</p>
        </div>

        {/* Kart */}
        <div className="bg-[#0c0f1a] border border-[#1a2236] rounded-2xl shadow-2xl overflow-hidden">

          {/* Üst şerit */}
          <div className="h-0.5 bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

          <div className="p-7">
            <form onSubmit={handleLogin} className="space-y-4">

              {/* E-posta */}
              <div>
                <label className="block text-[11px] text-gray-500 uppercase tracking-widest font-medium mb-2">
                  E-posta
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <input
                    type="email"
                    placeholder="ornek@kebo.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 text-white text-sm h-11 pl-10 pr-4 rounded-xl outline-none transition-all placeholder:text-gray-700"
                  />
                </div>
              </div>

              {/* Şifre */}
              <div>
                <label className="block text-[11px] text-gray-500 uppercase tracking-widest font-medium mb-2">
                  Şifre
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full bg-[#080b14] border border-[#1a2236] hover:border-[#243050] focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 text-white text-sm h-11 pl-10 pr-11 rounded-xl outline-none transition-all placeholder:text-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors p-0.5"
                    tabIndex={-1}
                  >
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />
                    }
                  </button>
                </div>
              </div>

              {/* Hata mesajı */}
              {error && (
                <div className="flex items-center gap-2.5 bg-red-500/8 border border-red-500/20 text-red-400 text-xs px-4 py-3 rounded-xl">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Giriş butonu */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full h-11 mt-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Giriş yapılıyor...
                  </>
                ) : (
                  "Giriş Yap"
                )}
              </button>

            </form>
          </div>
        </div>

        {/* Alt not */}
        <p className="text-center text-[11px] text-gray-700 mt-6">
          Erişim sorununuz varsa yöneticinizle iletişime geçin.
        </p>

      </div>
    </div>
  );
}
