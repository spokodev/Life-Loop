import { CleanupScreen } from '../../components/cleanup-screen'
import { getCleanupPageData } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function CleanupPage() {
  const pageData = await getCleanupPageData()

  return (
    <CleanupScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
