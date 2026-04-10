import { StorageScreen } from '../../components/storage-screen'
import { getControlPlaneSnapshot } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function StoragePage() {
  const pageData = await getControlPlaneSnapshot()

  return (
    <StorageScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
