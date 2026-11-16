import { z } from 'zod'
import { LANGUAGES } from '../models/project.model.js'

const NAME_REQUIRED = 'Introdu numele proiectului.'

export const createProjectSchema = z.object({
  name: z
    .string({ error: NAME_REQUIRED })
    .trim()
    // "ă" typed as one character or as "a" + accent is the same name.
    .normalize('NFC')
    .min(1, { error: NAME_REQUIRED })
    .max(100, { error: 'Numele poate avea cel mult 100 de caractere.' })
    // Control and invisible characters (zero-width space, right-to-left
    // override, line separators) would let two names look the same. The
    // zero-width joiner stays allowed: emoji like 👩‍💻 need it.
    .regex(/^(?:[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]|\u200D)*$/u, {
      error: 'Numele nu poate conține caractere de control sau invizibile.',
    }),
  language: z.enum(LANGUAGES, { error: 'Alege limbajul: Python, JavaScript, Java sau C++.' }),
})

export type CreateProjectInput = z.output<typeof createProjectSchema>
