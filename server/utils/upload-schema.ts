import {z} from 'zod'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_SIZE = 5 * 1024 * 1024

export const uploadSchema = z.object({
  title: z
    .string()
    .trim()
    .max(100, '标题不能超过 100 字')
    .optional()
    .default(''),

  file: z
    .instanceof(File, { message: '请选择文件' })
    .refine((f) => f.size > 0, '文件不能为空')
    .refine((f) => f.size <= MAX_SIZE, '文件不能超过 5MB')
    .refine(
      (f) => ALLOWED_MIME.includes(f.type as (typeof ALLOWED_MIME)[number]),
      '仅支持 JPEG/PNG/WebP'
    ),
})

export type UploadInput = z.infer<typeof uploadSchema>

export function parseUploadInput(raw: unknown) {
  const parsed = uploadSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false as const, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }
  return { success: true as const, data: parsed.data }
}