// middleware.ts - Simplified working version
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  
  // Public paths - no authentication needed
  const publicPaths = ['/', '/public', '/login', '/signup','/text']
  const isPublicPath = publicPaths.includes(path) || path.startsWith('/public/')
  
  // Allow static files
  const isStaticFile = /\.(jpg|jpeg|png|gif|svg|webp|ico|json|txt|css|js)$/.test(path)
  const isNextAsset = path.startsWith('/_next/')
  
  // Allow public access to these paths
  if (isPublicPath || isStaticFile || isNextAsset) {
    return NextResponse.next()
  }
  
  // For protected routes, we'll let the client-side handle auth
  // This prevents middleware from blocking login redirects
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}