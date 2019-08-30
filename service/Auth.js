import { AuthenticationClient } from 'auth0';
import CFonts from 'cfonts';
import debug from 'debug';
import dotenv from 'dotenv';
import { MONGO_URL } from '../client/mongo';

dotenv.config();
var logger = debug('api');
// var error = debug('error');

const SIGNUP_URL = 'https://addressr.mountain-pass.com.au/signup/';

const ONE_MINUTE = 60 * 1000;

const errorOptions = {
  font: 'console',
  align: 'center',
  colors: ['yellowBright', 'blue'],
  background: 'red',
  letterSpacing: 1,
  lineHeight: 1,
  space: true,
  maxLength: '0',
};

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
        CFonts.say(
          `Email not verified!|Server will shutdown in ${i}min...`,
          errorOptions,
        );
        sleep(ONE_MINUTE).then(() => {
          scheduleShutdown(i - 1);
        });
      }
      return authResult;
    } catch (err) {
      CFonts.say(
        `Authentication Failed!|Sign up for free at ${SIGNUP_URL}|Server will shutdown in ${i}min...`,
        errorOptions,
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

const AUTH0_CLIENT_ID =
  process.env.AUTH0_CLIENT_ID || 'ktamGQ8aAubQBbjL5i1PQUnJAirObYzT';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || 'mountain-pass.au.auth0.com';
const AUTH0_CLIENT_SECRET =
  process.env.AUTH0_CLIENT_SECRET ||
  '4T-cB1NlVFHlTaEyXa8zawNnrq75e8cQL70LrqfrHM60UF2f1UaYqOWmh7PUq-pP';

async function doAuthenticate() {
  var auth0 = new AuthenticationClient({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    clientSecret: AUTH0_CLIENT_SECRET,
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
      }|Email Verified: ${
        auth.profile.email_verified
      }|NODE_ENV: ${env}|MONGO_URL: ${MONGO_URL}`,
      smallBannerOptions,
    );
  } else if (auth && !auth.profile.email_verified) {
    CFonts.say(
      `Version: ${process.env.VERSION || '1.0.0'}|Licensed To: ${
        auth.profile.name
      }|NODE_ENV: ${env}`,
      smallBannerOptions,
    );
    CFonts.say(`Email Unverified!`, errorOptions);
  } else {
    CFonts.say(
      `Version: ${process.env.VERSION || '1.0.0'}|Environment: ${process.env
        .NODE_ENV || 'development'}`,
      smallBannerOptions,
    );

    CFonts.say(`Unauthenticated`, errorOptions);
    if (
      process.env.ADDRESSR_USERNAME === undefined &&
      process.env.ADDRESSR_PASSWORD === undefined
    ) {
      CFonts.say(
        `ADDRESSR_USERNAME and ADDRESSR_PASSWORD not set`,
        errorOptions,
      );
    } else if (process.env.ADDRESSR_USERNAME === undefined) {
      CFonts.say(`ADDRESSR_USERNAME not set`, errorOptions);
    } else if (process.env.ADDRESSR_PASSWORD === undefined) {
      CFonts.say(`ADDRESSR_PASSWORD not set`, errorOptions);
    } else {
      CFonts.say(`Authentication failed`, errorOptions);
    }
  }
}
