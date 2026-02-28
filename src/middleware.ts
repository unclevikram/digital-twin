// No middleware auth needed — route handlers enforce their own auth where required.
// Previously this blocked /api/ingest/status which broke the public status check.
export { auth as default } from '@/auth'

export const config = {
  matcher: [],
}
