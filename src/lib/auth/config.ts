import type { NextAuthConfig } from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { env } from '@/lib/env'

export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      authorization: {
        params: {
          scope: 'repo read:user user:email',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token as string
      }
      if (profile) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.login = (profile as any).login as string
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      if (session.user) {
        session.user.login = token.login as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
}
