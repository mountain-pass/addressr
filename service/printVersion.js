import CFonts from 'cfonts';
import dotenv from 'dotenv';

dotenv.config();

export function printVersion() {
  const smallBannerOptions = {
    font: 'console',
    align: 'center',
    colors: ['yellowBright', 'blue'],
    background: 'blue',
    letterSpacing: 0,
    lineHeight: 0,
    space: true,
  };
  let env = process.env.NODE_ENV || 'development';
  if (env === 'development') {
    env = `${env}|(set NODE_ENV to 'production' in production environments)`;
  }

  CFonts.say(
    `Version: ${process.env.npm_package_version || '1.0.0'}|NODE_ENV: ${env}`,
    smallBannerOptions
  );
}
