import CFonts from 'cfonts'
import dotenv from 'dotenv'
import { version } from '../version'

dotenv.config()

export function printVersion () {
  const smallBannerOptions = {
    font: 'console',
    align: 'center',
    colors: ['yellowBright', 'blue'],
    background: 'blue',
    letterSpacing: 0,
    lineHeight: 0,
    space: true
  }
  let environment = process.env.NODE_ENV || 'development'
  if (environment === 'development') {
    environment = `${environment}|(set NODE_ENV to 'production' in production environments)`
  }
  const port = process.env.PORT || 8080
  CFonts.say(
    `Version: ${version}|NODE_ENV: ${environment}|PORT: ${port}`,
    smallBannerOptions
  )
}
