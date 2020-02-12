import {
  AggregationType,
  globalStats,
  MeasureUnit,
  TagMap,
} from '@opencensus/core';
// import {
//   StackdriverStatsExporter,
//   StackdriverTraceExporter,
// } from '@opencensus/exporter-stackdriver';
// var os = require('os');
import tracing from '@opencensus/nodejs';
import dotenv from 'dotenv';
import { machineId } from 'node-machine-id';

dotenv.config();

export function getTracer() {
  return tracing.tracer;
}

export async function initMonitoring(component) {
  const mId = await machineId();
  const pId = process.pid;

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
  return { tracing: tracing, monitoringInterval };
}
