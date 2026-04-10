const endpoints = [
  process.env.LIFE_LOOP_WEB_HEALTH_URL ?? 'http://localhost:3000/api/health',
  process.env.LIFE_LOOP_API_LIVE_URL ?? 'http://localhost:4000/health/live',
  process.env.LIFE_LOOP_API_READY_URL ?? 'http://localhost:4000/health/ready',
]

let failed = false

for (const endpoint of endpoints) {
  try {
    const response = await fetch(endpoint)
    if (!response.ok) {
      failed = true
      console.error(`${endpoint} returned ${response.status}`)
      continue
    }

    console.log(`${endpoint} ok`)
  } catch (error) {
    failed = true
    console.error(`${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failed) {
  process.exitCode = 1
}
