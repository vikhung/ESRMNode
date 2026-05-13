import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * 步驟一：暫時只做 pass-through
 * 步驟三（NextAuth.js 認證）完成後將替換為完整的路由保護邏輯
 */
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
}
