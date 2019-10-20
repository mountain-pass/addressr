import CFonts from 'cfonts';
import dotenv from 'dotenv';
import { MONGO_URL } from '../client/mongo';

dotenv.config();

export function printVersion() {
  const smallBannerOptions = {
    font: 'console',
    align: 'center',
    colors: ['yellowBright', 'blue'],
    background: 'blue',
    letterSpacing: 1,
    lineHeight: 1,
    space: true,
    maxLength: '0',
  };
  let env = process.env.NODE_ENV || 'development';
  if (env === 'development') {
    env = `${env}|(set NODE_ENV to 'production' in production environments)`;
  }
  CFonts.say(
    `Version: ${process.env.npm_package_version ||
      '1.0.0'}|NODE_ENV: ${env}|MONGO_URL: ${MONGO_URL}`,
    smallBannerOptions,
  );
}
