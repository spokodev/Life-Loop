import { RestoreScreen } from '../../components/restore-screen'
import { getRestorePageData } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function RestorePage() {
  const pageData = await getRestorePageData()

  return (
    <RestoreScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
