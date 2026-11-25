import sharp from 'sharp'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parseUploadInput } from '../../utils/upload-schema'

export default defineAuthHandler(async (event, { userId }) => {
  const form = await readFormData(event)
  const raw = {
    title: form.get('title') ?? undefined,
    file: form.get('file'),
  }

  const result = parseUploadInput(raw)
  if (!result.success) {
    throw createError({ statusCode: 400, data: { fieldErrors: result.fieldErrors } })
  }
  const { title, file } = result.data

  const buffer = Buffer.from(await file.arrayBuffer())
  const meta = await sharp(buffer).metadata()
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw createError({ statusCode: 400, message: '文件内容不是有效图片' })
  }

  const processed = await sharp(buffer)
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()

  const uploadDir = useRuntimeConfig().uploadDir
  await mkdir(uploadDir, { recursive: true })
  const filename = `${Date.now()}-${randomUUID()}.webp`
  await writeFile(join(uploadDir, filename), processed)

  return {
    filename,
    title,
    originalSize: file.size,
    compressedSize: processed.length,
    url: `/uploads/${filename}`,
  }
})
