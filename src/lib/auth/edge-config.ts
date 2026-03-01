import type { NextAuthConfig } from 'next-auth'

// Minimal config for Edge middleware — must NOT import env.ts or any Node.js-only modules.
// The full authConfig (with GitHub provider + env validation) runs in the Node.js runtime.
// This config is only used to verify the JWT and protect routes.
export const edgeAuthConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: 'jwt' },
  pages: { signIn: '/' },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
  },
}
