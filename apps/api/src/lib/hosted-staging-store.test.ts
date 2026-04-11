import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { storeHostedStagingObject } from './hosted-staging-store'

test('storeHostedStagingObject writes through a temporary file and verifies checksum', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'life-loop-staging-'))
  const payload = Buffer.from('staged iphone payload')
  const checksumSha256 = sha256(payload)

  try {
    const result = await storeHostedStagingObject({
      body: streamFromBuffer(payload),
      checksumSha256,
      objectKey: 'library-id/object-id',
      rootDirectory,
      sizeBytes: payload.byteLength,
    })

    assert.deepEqual(result, {
      checksumSha256,
      uploadedBytes: payload.byteLength,
    })
    assert.equal(
      await readFile(path.join(rootDirectory, 'library-id', 'object-id'), 'utf8'),
      payload.toString('utf8'),
    )
  } finally {
    await rm(rootDirectory, { force: true, recursive: true })
  }
})

test('storeHostedStagingObject removes temporary files after checksum mismatch', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'life-loop-staging-'))
  const payload = Buffer.from('tampered payload')
  const destinationPath = path.join(rootDirectory, 'library-id', 'object-id')

  try {
    const error = await captureError(() =>
      storeHostedStagingObject({
        body: streamFromBuffer(payload),
        checksumSha256: sha256(Buffer.from('expected payload')),
        objectKey: 'library-id/object-id',
        rootDirectory,
        sizeBytes: payload.byteLength,
      }),
    )

    assert.match(error.message, /checksum/)
    assert.equal(error.message.includes(rootDirectory), false)
    await assert.rejects(() => stat(destinationPath), /ENOENT/)
  } finally {
    await rm(rootDirectory, { force: true, recursive: true })
  }
})

test('storeHostedStagingObject rejects path traversal object keys', async () => {
  const rootDirectory = await mkdtemp(path.join(tmpdir(), 'life-loop-staging-'))

  try {
    const error = await captureError(() =>
      storeHostedStagingObject({
        body: streamFromBuffer(Buffer.from('payload')),
        checksumSha256: sha256(Buffer.from('payload')),
        objectKey: '../escape',
        rootDirectory,
        sizeBytes: 7,
      }),
    )

    assert.equal(error.message, 'Hosted staging object key is invalid.')
  } finally {
    await rm(rootDirectory, { force: true, recursive: true })
  }
})

function sha256(payload: Buffer) {
  return createHash('sha256').update(payload).digest('hex')
}

function streamFromBuffer(payload: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(payload)
      controller.close()
    },
  })
}

async function captureError(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    assert.ok(error instanceof Error)
    return error
  }

  assert.fail('Expected function to throw.')
}
