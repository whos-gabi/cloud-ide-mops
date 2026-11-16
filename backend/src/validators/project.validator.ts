import { z } from 'zod'
import { LANGUAGES } from '../models/project.model.js'

const NAME_REQUIRED = 'Introdu numele proiectului.'

export const createProjectSchema = z.object({
  name: z
    .string({ error: NAME_REQUIRED })
    .trim()
    .min(1, { error: NAME_REQUIRED })
    .max(100, { error: 'Numele poate avea cel mult 100 de caractere.' })
    .regex(/^\P{Cc}*$/u, { error: 'Numele nu poate conține caractere de control.' }),
  language: z.enum(LANGUAGES, { error: 'Alege limbajul: Python, JavaScript, Java sau C++.' }),
})

export type CreateProjectInput = z.output<typeof createProjectSchema>
