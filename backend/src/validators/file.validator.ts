import { z } from 'zod'

const MAX_PATH = 1024
const MAX_NAME_BYTES = 255 // Linux limit for one file name
const CONTROL = /\p{Cc}/u

function isValidName(name: string): boolean {
  return (
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('\\') &&
    !CONTROL.test(name) &&
    Buffer.byteLength(name) <= MAX_NAME_BYTES
  )
}

// A path relative to the project root, "a/b/c". "" is the root.
export function isValidPath(path: string): boolean {
  return path === '' || (path.length <= MAX_PATH && path.split('/').every(isValidName))
}

const INVALID_PATH = 'Calea nu este validă.'
const path = z.string({ error: INVALID_PATH }).refine(isValidPath, { error: INVALID_PATH })
const NAME_REQUIRED = 'Introdu un nume.'

export const listFilesQuerySchema = z.object({
  path: path.default(''),
})

export const createEntrySchema = z.object({
  // The directory to create in; "" is the project root.
  parent: path.default(''),
  name: z
    .string({ error: NAME_REQUIRED })
    .trim()
    // "ă" typed as one character or as "a" + accent is the same name.
    .normalize('NFC')
    .min(1, { error: NAME_REQUIRED })
    .refine((name) => !name.includes('/') && !name.includes('\\'), { error: 'Numele nu poate conține „/” sau „\\”.' })
    .refine((name) => name !== '.' && name !== '..', { error: 'Numele nu poate fi „.” sau „..”.' })
    .refine((name) => !CONTROL.test(name), { error: 'Numele nu poate conține caractere de control.' })
    .refine((name) => Buffer.byteLength(name) <= MAX_NAME_BYTES, { error: 'Numele este prea lung.' }),
  type: z.enum(['file', 'directory'], { error: 'Alege dacă e fișier sau director.' }),
})

export const deleteEntryQuerySchema = z.object({
  path: path.refine((value) => value !== '', { error: 'Alege ce ștergi.' }),
  type: z.enum(['file', 'directory'], { error: 'Alege dacă e fișier sau director.' }),
})

export type CreateEntryInput = z.output<typeof createEntrySchema>
export type DeleteEntryInput = z.output<typeof deleteEntryQuerySchema>
