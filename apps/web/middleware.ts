import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
)

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

const middleware = clerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      if (!isPublicRoute(request)) {
        await auth.protect()
      }
    })
  : function bootstrapMiddleware() {
      return NextResponse.next()
    }

export default middleware

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
