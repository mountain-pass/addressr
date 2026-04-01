import dotenv from 'dotenv'
import { version } from '../version'

dotenv.config()

export function printVersion () {
  let environment = process.env.NODE_ENV || 'development'
  if (environment === 'development') {
    environment = `${environment}|(set NODE_ENV to 'production' in production environments)`
  }
  const port = process.env.PORT || 8080
  console.log(`Version: ${version}`)
  console.log(`NODE_ENV: ${environment}`)
  console.log(`PORT: ${port}`)
}
