import assert from 'assert';
import { CronJob } from 'cron';

import { getBackendService } from './api';
import { logger, loggerService } from './logger';
import { startWorkerTask } from './task';
import { MixedTaskConfig } from './types';
import { isEmptyObj } from './utils';
import { CPUUtils } from './utils/cpu';

async function bootstrap(): Promise<void> {
  const cpu = new CPUUtils();
  const http = getBackendService();

  logger.info('App started');
  const cpuPct = cpu.getCPUUsage();
  logger.debug(`CPU percentage is ${cpuPct}`);

  await http.reportWorkerTaskStartedToBackend();
  const taskConf = await http.getWorkerTaskFromBackend<MixedTaskConfig>();
  assert(
    !isEmptyObj(taskConf),
    new Error('Can not get task config from backend or gateway'),
  );

  const healthCheck = new CronJob('*/5 * * * * *', async () => {
    await http.reportWorkerTaskHealthStatusToBackend();
    const cpuPct = cpu.getCPUUsage();
    logger.debug(`CPU percentage is ${cpuPct}`);
  });
  healthCheck.start();

  await startWorkerTask(taskConf);
  await http.reportWorkerTaskFinishedToBackend();
  loggerService.final('Task finished');
}

bootstrap();
