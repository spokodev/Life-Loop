import { AssetDetailScreen } from '../../../components/asset-detail-screen'
import { getAssetDetailPageData } from '../../../lib/control-plane'
import { webEnv } from '../../../lib/env'

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>
}) {
  const { assetId } = await params
  const pageData = await getAssetDetailPageData(assetId)

  return (
    <AssetDetailScreen
      apiBaseUrl={webEnv.NEXT_PUBLIC_API_URL}
      authEnabled={webEnv.clerkEnabled}
      {...pageData}
    />
  )
}
