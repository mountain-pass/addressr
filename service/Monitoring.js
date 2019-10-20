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

dotenv.config();

const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'addressr-249104';

const GOOGLE_CREDENTIALS = {
  type: process.env.GOOGLE_CREDENTIALS_TYPE || 'service_account',
  project_id: GCLOUD_PROJECT,
  private_key_id:
    process.env.GOOGLE_CREDENTIALS_private_key_id ||
    '3a621535318cb91b39aef8f94d9c99d4867517b5',
  private_key:
    process.env.GOOGLE_CREDENTIALS_private_key ||
    '-----BEGIN PRIVATE KEY-----\nXXXXX\n-----END PRIVATE KEY-----\n',
  client_email:
    process.env.GOOGLE_CREDENTIALS_client_email ||
    'xxx@xxxx.iam.gserviceaccount.com',
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
    'https://www.googleapis.com/robot/v1/metadata/x509/xxxxx%40xxxxx.iam.gserviceaccount.com',
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

export async function initMonitoring(component) {
  const mId = await machineId();
  const pId = process.pid;

  tracing.registerExporter(traceExporter).start({
    samplingRate: 1,
    defaultAttributes: {
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

  const jobTagKey = { name: 'job' };
  const taskTagKey = { name: 'task_id' };
  const environmentTagKey = { name: 'environment' };

  // Create and Register the view.
  const cpuUsageView = globalStats.createView(
    `addressr/${component}/cpu-usage`,
    cpuMeasure,
    AggregationType.LAST_VALUE,
    [jobTagKey, taskTagKey, environmentTagKey],
    'CPU usage',
  );
  globalStats.registerView(cpuUsageView);

  const memUsageView = globalStats.createView(
    `addressr/${component}/mem-usage`,
    memMeasure,
    AggregationType.LAST_VALUE,
    [jobTagKey, taskTagKey, environmentTagKey],
    'Mem usage',
  );
  globalStats.registerView(memUsageView);

  const upUsageView = globalStats.createView(
    `addressr/${component}/up`,
    upMeasure,
    AggregationType.LAST_VALUE,
    [jobTagKey, taskTagKey, environmentTagKey],
    'Up',
  );
  globalStats.registerView(upUsageView);

  const tags = new TagMap();

  tags.set(jobTagKey, { value: component });
  tags.set(taskTagKey, { value: `${mId}-${pId}` });
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

  const monitoringInterval = 0;
  return { tracing: tracing, monitoringInterval, traceExporter };
}
