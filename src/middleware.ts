// Protect /chat route using a minimal edge-compatible auth config.
// We cannot use '@/auth' directly here because it imports env.ts which validates
// OPENAI_API_KEY etc. — those env vars may not be available in the Edge runtime,
// causing the middleware to crash and breaking sessions across all routes.
import NextAuth from 'next-auth'
import { edgeAuthConfig } from '@/lib/auth/edge-config'

export default NextAuth(edgeAuthConfig).auth

export const config = {
  matcher: ['/chat/:path*'],
}
