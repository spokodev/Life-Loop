import { SettingsScreen } from '../../components/settings-screen'
import { getControlPlaneSnapshot } from '../../lib/control-plane'
import { webEnv } from '../../lib/env'

export default async function SettingsPage() {
  const pageData = await getControlPlaneSnapshot()

  return (
    <SettingsScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
