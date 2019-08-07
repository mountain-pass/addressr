import monitoring from '@google-cloud/monitoring';
import dotenv from 'dotenv';
import { machineId } from 'node-machine-id';

dotenv.config();

export async function initMonitoring(component, auth) {
  // Your Google Cloud Platform project ID
  const projectId = process.env.GCLOUD_PROJECT || 'addressr-249104';
  const mId = await machineId();
  const pId = process.pid;

  // Creates a client
  const client = new monitoring.MetricServiceClient();

  // Prepares an individual data point
  const dataPoint = {
    interval: {
      endTime: {
        seconds: Date.now() / 1000,
      },
    },
    value: {
      boolValue: true,
    },
  };

  // Prepares the time series request
  const request = {
    name: client.projectPath(projectId),
    timeSeries: [
      {
        // Ties the data point to a custom metric
        metric: {
          type: `custom.googleapis.com/addressr/${component}/up`,
        },
        resource: {
          type: `generic_task`,
          labels: {
            project_id: projectId,
            namespace: auth.profile.name,
            job: component,
            task_id: `${mId}-${pId}`,
            location: 'global',
          },
        },
        points: [dataPoint],
      },
    ],
  };

  request.timeSeries[0].points[0].interval.endTime.seconds = Date.now() / 1000;
  const [result] = await client.createTimeSeries(request);
  console.log(`Done writing time series data.`, result);

  // Writes time series data
  setInterval(async () => {
    request.timeSeries[0].points[0].interval.endTime.seconds =
      Date.now() / 1000;
    const [result] = await client.createTimeSeries(request);
    console.log(`Done writing time series data.`, result);
  }, 60000);

  // setInterval(async () => {
  //   request.timeSeries[0].points[0].interval.endTime.seconds =
  //     Date.now() / 1000;
  //   const [result] = await client.createTimeSeries(request);
  //   console.log(`Done writing time series data.`, result);
  // }, 4000);
}
