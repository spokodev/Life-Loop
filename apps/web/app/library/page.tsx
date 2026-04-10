import { LibraryScreen } from '../../components/library-screen'
import { getLibraryPageData } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function LibraryPage() {
  const pageData = await getLibraryPageData()

  return (
    <LibraryScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
