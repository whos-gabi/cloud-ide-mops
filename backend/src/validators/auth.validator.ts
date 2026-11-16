import { z } from 'zod'

const email = z
  .string({ error: 'Introdu adresa de email.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Adresa de email nu este validă.' }).max(254, { error: 'Adresa de email este prea lungă.' }))

const password = z
  .string({ error: 'Introdu parola.' })
  .min(8, { error: 'Parola trebuie să aibă cel puțin 8 caractere.' })
  .max(128, { error: 'Parola poate avea cel mult 128 de caractere.' })

export const registerSchema = z.object({ email, password })

export type RegisterInput = z.output<typeof registerSchema>

// Only checks presence: a malformed email is just wrong credentials (US02).
export const loginSchema = z.object({
  email: z.string({ error: 'Introdu adresa de email.' }).trim().toLowerCase().min(1, { error: 'Introdu adresa de email.' }),
  password: z.string({ error: 'Introdu parola.' }).min(1, { error: 'Introdu parola.' }),
})

export type LoginInput = z.output<typeof loginSchema>
