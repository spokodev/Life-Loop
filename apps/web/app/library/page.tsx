import { LibraryScreen } from '../../components/library-screen'
import { getControlPlaneSnapshot } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function LibraryPage() {
  const pageData = await getControlPlaneSnapshot()

  return (
    <LibraryScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
