import { StorageScreen } from '../../components/storage-screen'
import { getStoragePageData } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function StoragePage() {
  const pageData = await getStoragePageData()

  return (
    <StorageScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
