import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

type StoreHostedStagingObjectInput = {
  body: ReadableStream<Uint8Array> | null
  checksumSha256: string
  objectKey: string
  rootDirectory: string
  sizeBytes: number
}

export type StoreHostedStagingObjectResult = {
  checksumSha256: string
  uploadedBytes: number
}

export async function storeHostedStagingObject(
  input: StoreHostedStagingObjectInput,
): Promise<StoreHostedStagingObjectResult> {
  if (!input.body) {
    throw new Error('Upload request body is required.')
  }

  const destinationPath = resolveHostedStagingObjectPath(input.rootDirectory, input.objectKey)
  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`
  await mkdir(path.dirname(destinationPath), { recursive: true })

  const hash = createHash('sha256')
  let uploadedBytes = 0
  const nodeReadable = Readable.fromWeb(input.body)

  try {
    await pipeline(
      nodeReadable,
      async function* (source) {
        for await (const chunk of source) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          uploadedBytes += buffer.byteLength

          if (uploadedBytes > input.sizeBytes) {
            throw new Error('Upload exceeds reserved object size.')
          }

          hash.update(buffer)
          yield buffer
        }
      },
      createWriteStream(temporaryPath, { flags: 'wx' }),
    )

    if (uploadedBytes !== input.sizeBytes) {
      throw new Error('Upload byte count does not match reservation.')
    }

    const checksumSha256 = hash.digest('hex')

    if (checksumSha256 !== input.checksumSha256) {
      throw new Error('Upload checksum does not match reservation.')
    }

    await rename(temporaryPath, destinationPath)
    return { checksumSha256, uploadedBytes }
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export function resolveHostedStagingObjectPath(rootDirectory: string, objectKey: string) {
  const normalizedObjectKey = path.posix.normalize(objectKey)

  if (
    normalizedObjectKey.startsWith('../') ||
    normalizedObjectKey === '..' ||
    normalizedObjectKey.startsWith('/')
  ) {
    throw new Error('Hosted staging object key is invalid.')
  }

  return path.join(rootDirectory, ...normalizedObjectKey.split('/'))
}
