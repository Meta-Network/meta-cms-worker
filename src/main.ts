import { CronJob } from 'cron';

import { getBackendService } from './api';
import { logger } from './logger';
import { startGitTask } from './task';
import { CPUUtils } from './utils/cpu';

async function bootstrap(): Promise<void> {
  const cpu = new CPUUtils();
  const http = getBackendService();

  logger.info('App started');
  const cpuPct = cpu.getCPUUsage();
  logger.debug(`CPU percentage is ${cpuPct}`);
  await http.reportWorkerTaskStartedToBackend();

  const healthCheck = new CronJob('*/5 * * * * *', async () => {
    await http.reportWorkerTaskHealthStatusToBackend();
    const cpuPct = cpu.getCPUUsage();
    logger.debug(`CPU percentage is ${cpuPct}`);
  });
  healthCheck.start();

  await startGitTask();
}

bootstrap();
