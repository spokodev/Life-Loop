import { DevicesScreen } from '../../components/devices-screen'
import { getControlPlaneSnapshot } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function DevicesPage() {
  const pageData = await getControlPlaneSnapshot()

  return (
    <DevicesScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
