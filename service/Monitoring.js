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

// Add your project id to the Stackdriver options
const traceExporter = new StackdriverTraceExporter({
  projectId: GCLOUD_PROJECT,
  prefix: 'testing',
});

const statsExporter = new StackdriverStatsExporter({
  projectId: GCLOUD_PROJECT,
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
      namespace: auth.profile.name,
      verfied: auth.profile.email_verified.toString(),
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
  tags.set(nsTagKey, { value: auth.profile.name });

  tags.set(jobTagKey, { value: component });
  tags.set(taskTagKey, { value: `${mId}-${pId}` });
  tags.set(verifiedTagKey, { value: auth.profile.email_verified.toString() });
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
