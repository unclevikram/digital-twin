// No middleware auth — API routes enforce their own auth.
// Route-guard middleware was removed because the landing page redirects to /chat,
// creating an infinite redirect loop for unauthenticated users.
export { auth as default } from '@/auth'

export const config = {
  matcher: [],
}
