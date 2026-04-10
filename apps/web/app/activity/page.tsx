import { JobsScreen } from '../../components/jobs-screen'
import { getActivityPageData } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function ActivityPage() {
  const pageData = await getActivityPageData()

  return (
    <JobsScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
