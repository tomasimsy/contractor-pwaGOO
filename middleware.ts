// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  const path = req.nextUrl.pathname

  // Allow static files (images, etc.) without authentication
  const staticExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.json', '.txt', '.css', '.js']
  const isStaticFile = staticExtensions.some(ext => path.endsWith(ext))
  
  // Public routes - no authentication needed
  const publicRoutes = ['/', '/public', '/login', '/signup']
  const isPublicRoute = publicRoutes.includes(path) || path.startsWith('/public/')
  
  // Also allow _next directory
  const isNextAsset = path.startsWith('/_next/')

  // Allow static files, public routes, and Next.js assets
  if (isStaticFile || isPublicRoute || isNextAsset) {
    return response
  }

  // Protect all other routes
  if (!session) {
    const redirectUrl = new URL('/login', req.url)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}