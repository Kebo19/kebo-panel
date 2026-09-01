import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Supabase soğuk başlangıç (cold start) yaşadığında ya da ağ gecikmesi
// olduğunda auth.getUser() çağrısı uzun süre cevap vermeyebilir. Bu durumda
// Vercel'in kendi platform zaman aşımı devreye girip 504
// MIDDLEWARE_INVOCATION_TIMEOUT hatası veriyordu. Bunu önlemek için auth
// kontrolüne kendi üst sınırımızı koyuyoruz: bu süre içinde cevap gelmezse
// isteği güvenli şekilde login'e yönlendiriyoruz, Vercel'in sert 504'üne
// düşmesine izin vermiyoruz.
const AUTH_CHECK_TIMEOUT_MS = 6000

async function getUserSafely(
  supabase: SupabaseClient
): Promise<{ user: User | null; timedOut: boolean }> {
  const timeoutMarker = Symbol('auth-timeout')

  const timeoutPromise = new Promise<typeof timeoutMarker>((resolve) => {
    setTimeout(() => resolve(timeoutMarker), AUTH_CHECK_TIMEOUT_MS)
  })

  try {
    const authPromise: Promise<User | null> = supabase.auth
      .getUser()
      .then((result) => result.data.user)

    const result = await Promise.race([authPromise, timeoutPromise])

    if (result === timeoutMarker) {
      return { user: null, timedOut: true }
    }

    return { user: result, timedOut: false }
  } catch (error) {
    // DNS hatası, ağ kopması vb. durumlarda da isteği güvenli şekilde geçir
    console.error('[middleware] Supabase auth kontrolü başarısız oldu:', error)
    return { user: null, timedOut: true }
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Gelen kişinin giriş yapıp yapmadığını kontrol et (zaman aşımı korumalı)
  const { user, timedOut } = await getUserSafely(supabase)

  if (timedOut) {
    // Supabase'den zamanında cevap alınamadı (muhtemelen cold start).
    // Vercel'in 504 MIDDLEWARE_INVOCATION_TIMEOUT ile çökmesindense isteği
    // login sayfasına yönlendiriyoruz. Supabase birkaç saniye içinde
    // uyanacağı için kullanıcı tekrar denediğinde sorun kalmayacak.
    if (!request.nextUrl.pathname.startsWith('/login')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('retry', '1')
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Eğer kişi giriş YAPMAMIŞSA ve şu an login sayfasında DEĞİLSE, onu login'e kovala
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Eğer kişi zaten GİRİŞ YAPMIŞSA ve tekrar login sayfasına gitmeye çalışıyorsa, onu ana sayfaya geri gönder
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Görseller, ikonlar, arka plan dosyaları ve tüm api/ uç noktaları
     * (chat, keepalive, rapor-tara — kendi hata/oturum kontrolünü kendileri
     * yapıyor, sayfa girişi gibi login'e yönlendirilmemeliler) hariç her
     * sayfada bu güvenliği çalıştır:
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
