import { DashboardScreen } from '../components/dashboard-screen'
import { getControlPlaneSnapshot } from '../lib/control-plane'
import { webEnv } from '../lib/env'

export default async function HomePage() {
  const { snapshot, usingFallback } = await getControlPlaneSnapshot()

  return (
    <DashboardScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      snapshot={snapshot}
      usingFallback={usingFallback}
    />
  )
}
