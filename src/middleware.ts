// Protect /chat route to ensure user is logged in
export { auth as default } from '@/auth'

export const config = {
  matcher: ['/chat/:path*'],
}
