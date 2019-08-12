import { AuthenticationClient } from 'auth0';
import CFonts from 'cfonts';
import debug from 'debug';
import dotenv from 'dotenv';

dotenv.config();
var logger = debug('api');
// var error = debug('error');

const SIGNUP_URL = 'https://addressr.mountain-pass.com.au/signup/';

const ONE_MINUTE = 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function scheduleShutdown(n = 20) {
  for (let i = n; i > 0; i--) {
    try {
      const authResult = await doAuthenticate();
      if (!authResult.profile.email_verified) {
        CFonts.say(`Email not verified!|Server will shutdown in ${i}min...`, {
          font: 'console',
          align: 'center',
          colors: ['yellowBright'],
          background: 'red',
          letterSpacing: 1,
          lineHeight: 1,
          space: true,
          maxLength: '0',
        });
        sleep(ONE_MINUTE).then(() => {
          scheduleShutdown(i - 1);
        });
      }
      return authResult;
    } catch (err) {
      CFonts.say(
        `Authentication Failed!|Sign up for free at ${SIGNUP_URL}|Server will shutdown in ${i}min...`,
        {
          font: 'console',
          align: 'center',
          colors: ['yellowBright'],
          background: 'red',
          letterSpacing: 1,
          lineHeight: 1,
          space: true,
          maxLength: '0',
        },
      );
      await sleep(ONE_MINUTE);
    }
  }
  CFonts.say(`Server will shutdown now...`, {
    font: 'console',
    align: 'center',
    colors: ['yellowBright'],
    background: 'red',
    letterSpacing: 1,
    lineHeight: 1,
    space: true,
    maxLength: '0',
  });
  process.exit(1);
}

async function doAuthenticate() {
  var auth0 = new AuthenticationClient({
    domain: process.env.AUTH0_DOMAIN,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
  });
  const token = await auth0.oauth.passwordGrant({
    username: process.env.ADDRESSR_USERNAME,
    password: process.env.ADDRESSR_PASSWORD,
    realm: 'Username-Password-Authentication',
  });
  logger('signInToken', JSON.stringify(token, null, 2));
  const profile = await auth0.getProfile(token.access_token);
  logger('getProfile', profile);
  logger('getInfo', await auth0.users.getInfo(token.access_token));
  return { auth0, token, profile };
}

export async function authenticate() {
  return scheduleShutdown();
}

export function printAuthStatus(auth) {
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
  if (auth && auth.profile.email_verified) {
    if (env === 'development') {
      env = `${env}|(set NODE_ENV to 'production' in production environments)`;
    }
    CFonts.say(
      `Version: ${process.env.npm_package_version || '1.0.0'}|Licensed To: ${
        auth.profile.name
      }|Email Verified: ${auth.profile.email_verified}|NODE_ENV: ${env}`,
      smallBannerOptions,
    );
  } else if (auth && !auth.profile.email_verified) {
    CFonts.say(
      `Version: ${process.env.VERSION || '1.0.0'}|Licensed To: ${
        auth.profile.name
      }|NODE_ENV: ${env}`,
      smallBannerOptions,
    );
    CFonts.say(`Email Unverified!`, {
      font: 'console',
      align: 'center',
      colors: ['yellowBright', 'blue'],
      background: 'red',
      letterSpacing: 1,
      lineHeight: 1,
      space: true,
      maxLength: '0',
    });
  } else {
    CFonts.say(
      `Version: ${process.env.VERSION || '1.0.0'}|Environment: ${process.env
        .NODE_ENV || 'development'}`,
      smallBannerOptions,
    );
    CFonts.say(`Unauthenticated`, {
      font: 'console',
      align: 'center',
      colors: ['yellowBright', 'blue'],
      background: 'red',
      letterSpacing: 1,
      lineHeight: 1,
      space: true,
      maxLength: '0',
    });
  }
}
