import { auth } from '@/auth'

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  // Only protect the ingest trigger — chat and the main UI are fully public
  const isProtectedRoute =
    nextUrl.pathname === '/api/ingest' ||
    nextUrl.pathname.startsWith('/api/ingest/')

  if (isProtectedRoute && !isLoggedIn) {
    return Response.redirect(new URL('/', nextUrl))
  }
})

export const config = {
  matcher: ['/api/ingest/:path*'],
}
