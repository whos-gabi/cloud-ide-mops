// Dev defaults match docker-compose.yml.
const isProduction = process.env.NODE_ENV === 'production'

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (url) return url
  if (isProduction) {
    throw new Error('DATABASE_URL is not set')
  }
  return 'postgres://cloudide:cloudide@localhost:5432/cloudide'
}

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: databaseUrl(),
  version: process.env.APP_VERSION ?? 'dev',
}
