// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. STATİK DOSYALARI VE RESİMLERİ EN BAŞTAN MUAF TUT (Performans için kritik)
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('favicon.ico') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
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

  // 2. Ağ yükünü azaltmak için getUser() yerine session kontrolü yapıyoruz
  const { data: { session } } = await supabase.auth.getSession()
  const isLoggedIn = !!session

  // 3. Giriş yapmamış kullanıcı login sayfasında değilse login'e gönder
  if (!isLoggedIn && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 4. Giriş yapmış kullanıcı tekrar login'e gitmeye çalışırsa ana sayfaya at
  if (isLoggedIn && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Güvenlik önlemi olarak matcher'ı da temiz tutuyoruz
export const config = {
  matcher: ['/((?!.*\\.).*)'],
}