import dotenv from 'dotenv';
import { version } from '../version.js';

// eslint-disable-next-line unicorn/no-top-level-side-effects -- loading .env at import time IS this module's contract: every consumer imports it precisely so process.env is populated before it reads it. Moving it into printVersion() would make the side effect conditional on calling a logger. Tracked on P084.
dotenv.config({ quiet: true });

export function printVersion() {
  let environment = process.env.NODE_ENV || 'development';
  if (environment === 'development') {
    environment += "|(set NODE_ENV to 'production' in production environments)";
  }
  const port = process.env.PORT || 8080;
  console.log(`Version: ${version}`);
  console.log(`NODE_ENV: ${environment}`);
  console.log(`PORT: ${port}`);
}
