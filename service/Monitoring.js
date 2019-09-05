import {
  AggregationType,
  globalStats,
  MeasureUnit,
  TagMap,
} from '@opencensus/core';
import {
  StackdriverStatsExporter,
  StackdriverTraceExporter,
} from '@opencensus/exporter-stackdriver';
// var os = require('os');
import tracing from '@opencensus/nodejs';
import dotenv from 'dotenv';
import { machineId } from 'node-machine-id';

// console.log(os.cpus());
// console.log(os.totalmem());
// console.log(os.freemem());

dotenv.config();

const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'addressr-249104';

// require('@google-cloud/debug-agent').start({
//   projectId: GCLOUD_PROJECT,
//   keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
//   serviceContext: {
//     service: 'addressr',
//     version: 'master',
//   },
//   /**
//    * A user specified way of identifying the service
//    */
//   description: 'addressr-service-foobar',
// });

const GOOGLE_CREDENTIALS = {
  type: process.env.GOOGLE_CREDENTIALS_TYPE || 'service_account',
  project_id: GCLOUD_PROJECT,
  private_key_id:
    process.env.GOOGLE_CREDENTIALS_private_key_id ||
    '3a621535318cb91b39aef8f94d9c99d4867517b5',
  private_key:
    process.env.GOOGLE_CREDENTIALS_private_key ||
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCt7uNXBylpcQ1t\n/BwxUy5Yk9mlQ6VNV1aF2SKta8uuJ9Lmq9xYTTMaowFOfcPJZZXKmRPX+Geiip1V\nQP1hx9AGgOC3a/vRFJ507r51+L/CdtVa2m+Z7zzwe5ox+FR017mTeedvdXq1ZrPk\n6GsDNnTYF3PmmJiRyGLFrJEG6f+TDRm9bQwH6bgxS0e+f297QbkGEv23s53tiCnX\n4cPqVmCi3EHj/jGLa0+1b5FuZpCJ5v9DZ21oe+1pe6UP9Tqu34/R6LVJIxl941vz\nliqFurtOBqDeKW801YtUfRrJgdvfCJG88/vEnJwsAVdQufm59BjrSmxVtPIQcXJa\n/FigpxXTAgMBAAECggEAAyuP/DWWtSPI3WDTeLit5xJmzKLTf/ngC1d+UM/eqgFy\n0B6AySE7Fbiz3OTg7SpLVSJ+IJkX9nf1Tyj8lUwph/zQW7d9ov1vt+zkDs1mXVqC\nIAJMN2+LWky+bju6+lg2OzBlHfxzrJu/GqR70taqwYeH5sOQQFP5LOYszIX2UQ1L\n4hZkPkp/iohurRKpB/Nh9i2l9XPHl36YgnIB+AW/YUfG8Og7uPCDFxVKBVgoLP+W\n0zmkTpDC4wXmVDpcIIsRAReCGw/P4FqMRy9saCX+WXHzqdIJ9xuRBVQxFXCFiwTc\nDY/1Lp5RWS6tg7wuZnWR/I4F10tM9FoLOl4pBUrC2QKBgQDUMBhAC/iIrL5BcALA\nsS7GGC6sic1qXR3qjE70bAaiabX5LBQH3GoP30W2e2vwLDBcT1BoMp4IpPPsXV6m\n5h+/eLVhTrBTnIR4gJ4rWe65po0WnuJnPikxVI/BKlxbIrQtdLp+GTZMbImsjNLc\npH8uLjNhE+pACLG2a+MbBAR2GQKBgQDR2LYh4rVSBBMIxSVTrnIftUn7ALwUNxzF\ncq6woCCB4yzhYPjsPsKpsCX5rMCmVWfOZGX9IRBEnO1yKRByXyhIVM3qF2YI0YcL\nXnVaBob/T1OVOeBQDKJATeR5hsyQzPXBhrH9tO/NVjud0VzZ3aJBneez2v9BsjzF\nKyGEBlbwywKBgCf5w6fVWYaOXO3BJ5OcDf7eMXTqJVwjnO5CbuGXtIxGtDT0e/Wb\nLhQ9cUnW6Nf/y0Co5LIszx87zIS8doelFVgiarGhfJDUDRUSzjnGoLYzTaN0XZ0r\n1eDoWIkA7RNyb1WdB0GYiGVPkYSDp3pQN3HA3IculFRqDukaXFgLoreJAoGBAL/w\n8j8yZ9maAnMOKKNPN/IK151wQZhYBMgRqvnBrZpA2idYlLc6fMHLbiDew+Qg0G93\nY9ZR7NhllcbLCtEieu0WLLbHKjw8ssJSZxKuT8Kto20mYCe4NpyM4sPJ6ck0wEGA\n28ONQZ7XFna3Lq/Uyvor3eikEsDbsDxExEZHqjRbAoGAMnNdgniHMEK7tM6WDpe/\nOSVohYBOf8eysTfzQGJiPMF7VP11qzx68iwF6UtOqYa9Ei1VFzQpBpYSmoKLOmmj\nx9PBX5jcesyQ/coA10GROxzQbpYvynhHndPthUsRB8JQznfwtqPaLUDDl/DzCkI2\nDBHWSjA6jZmKRFCEG6/VInE=\n-----END PRIVATE KEY-----\n',
  client_email:
    process.env.GOOGLE_CREDENTIALS_client_email ||
    'addressr@addressr-249104.iam.gserviceaccount.com',
  client_id:
    process.env.GOOGLE_CREDENTIALS_client_id || '112640684218263046489',
  auth_uri:
    process.env.GOOGLE_CREDENTIALS_auth_uri ||
    'https://accounts.google.com/o/oauth2/auth',
  token_uri:
    process.env.GOOGLE_CREDENTIALS_token_uri ||
    'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url:
    process.env.GOOGLE_CREDENTIALS_auth_provider_x509_cert_url ||
    'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url:
    process.env.GOOGLE_CREDENTIALS_client_x509_cert_url ||
    'https://www.googleapis.com/robot/v1/metadata/x509/addressr%40addressr-249104.iam.gserviceaccount.com',
};

// Add your project id to the Stackdriver options
const traceExporter = new StackdriverTraceExporter({
  projectId: GCLOUD_PROJECT,
  credentials: GOOGLE_CREDENTIALS,
});

const statsExporter = new StackdriverStatsExporter({
  projectId: GCLOUD_PROJECT,
  credentials: GOOGLE_CREDENTIALS,
});

// Pass the created exporter to Stats
globalStats.registerExporter(statsExporter);

export function getTracer() {
  return tracing.tracer;
}

export async function initMonitoring(component, auth) {
  const mId = await machineId();
  const pId = process.pid;

  tracing.registerExporter(traceExporter).start({
    samplingRate: 1,
    defaultAttributes: {
      namespace: auth ? auth.profile.name : 'unauthenticated',
      verfied: (auth ? auth.profile.email_verified : false).toString(),
      environment: process.env.NODE_ENV || 'development',
      job: component,
      task_id: `${mId}-${pId}`,
    },
    stats: globalStats,
  });

  let previousUsage = process.cpuUsage();
  let sampleDate = Date.now();

  const cpuMeasure = globalStats.createMeasureDouble(
    `addressr/${component}/cpu-usage`,
    MeasureUnit.UNIT,
    '%CPU USage',
  );

  const memMeasure = globalStats.createMeasureDouble(
    `addressr/${component}/mem-usage`,
    MeasureUnit.KBYTE,
    'Mem Usage',
  );

  const upMeasure = globalStats.createMeasureInt64(
    `addressr/${component}/up`,
    MeasureUnit.UNIT,
    '%CPU USage',
  );

  const nsTagKey = { name: 'namespace' };
  const jobTagKey = { name: 'job' };
  const taskTagKey = { name: 'task_id' };
  const verifiedTagKey = { name: 'verfied' };
  const environmentTagKey = { name: 'environment' };

  // Create and Register the view.
  const cpuUsageView = globalStats.createView(
    `addressr/${component}/cpu-usage`,
    cpuMeasure,
    AggregationType.LAST_VALUE,
    [nsTagKey, jobTagKey, taskTagKey, verifiedTagKey, environmentTagKey],
    'CPU usage',
  );
  globalStats.registerView(cpuUsageView);

  const memUsageView = globalStats.createView(
    `addressr/${component}/mem-usage`,
    memMeasure,
    AggregationType.LAST_VALUE,
    [nsTagKey, jobTagKey, taskTagKey, verifiedTagKey, environmentTagKey],
    'Mem usage',
  );
  globalStats.registerView(memUsageView);

  const upUsageView = globalStats.createView(
    `addressr/${component}/up`,
    upMeasure,
    AggregationType.LAST_VALUE,
    [nsTagKey, jobTagKey, taskTagKey, verifiedTagKey, environmentTagKey],
    'Up',
  );
  globalStats.registerView(upUsageView);

  const tags = new TagMap();
  tags.set(nsTagKey, { value: auth ? auth.profile.name : 'unauthenticated' });

  tags.set(jobTagKey, { value: component });
  tags.set(taskTagKey, { value: `${mId}-${pId}` });
  tags.set(verifiedTagKey, {
    value: (auth ? auth.profile.email_verified : false).toString(),
  });
  tags.set(environmentTagKey, { value: process.env.NODE_ENV || 'development' });

  previousUsage = process.cpuUsage(previousUsage);
  const percentCPU =
    (100 * (previousUsage.user + previousUsage.system)) /
    ((Date.now() - sampleDate) * 1000);
  sampleDate = Date.now();
  const memUsage = process.memoryUsage().heapUsed / 1024;
  console.log({ percentCPU, memUsage });

  globalStats.record(
    [
      {
        measure: cpuMeasure,
        value: percentCPU,
      },
      {
        measure: memMeasure,
        value: memUsage,
      },
      {
        measure: upMeasure,
        value: 1,
      },
    ],
    tags,
  );

  // Writes time series data
  const monitoringInterval = 0; // setInterval(async () => {
  //   previousUsage = process.cpuUsage(previousUsage);
  //   const percentCPU =
  //     (100 * (previousUsage.user + previousUsage.system)) /
  //     ((Date.now() - sampleDate) * 1000);
  //   sampleDate = Date.now();
  //   const memUsage = process.memoryUsage().heapUsed / 1024;
  //   console.log({ percentCPU, memUsage });

  //   globalStats.record(
  //     [
  //       {
  //         measure: cpuMeasure,
  //         value: percentCPU,
  //       },
  //       {
  //         measure: memMeasure,
  //         value: memUsage,
  //       },
  //       {
  //         measure: upMeasure,
  //         value: 1,
  //       },
  //     ],
  //     tags,
  //   );
  // }, 60000);
  return { tracing: tracing, monitoringInterval, traceExporter };
}
