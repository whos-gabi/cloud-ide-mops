export type Language = 'python' | 'javascript' | 'java' | 'cpp'

export interface Project {
  id: string
  name: string
  language: Language
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  name: string
  language: Language
}

export interface LanguageOption {
  value: Language
  label: string
  starterFile: string
}

export const LANGUAGES: readonly LanguageOption[] = [
  { value: 'python', label: 'Python', starterFile: 'main.py' },
  { value: 'javascript', label: 'JavaScript', starterFile: 'index.js' },
  { value: 'java', label: 'Java', starterFile: 'Main.java' },
  { value: 'cpp', label: 'C++', starterFile: 'main.cpp' },
]

export const PROJECT_NAME_MAX_LENGTH = 100

export function findLanguage(value: string): LanguageOption | undefined {
  return LANGUAGES.find((option) => option.value === value)
}
