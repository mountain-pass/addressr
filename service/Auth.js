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

async function scheduleShutdown() {
  for (let i = 20; i > 0; i--) {
    try {
      await doAuthenticate();
      return;
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
  try {
    return await doAuthenticate();
  } catch (err) {
    scheduleShutdown();
  }
}
