import { LoggerService, LoggerServiceOptions } from '@metaio/worker-common';

import { getWorkerEnv } from '../configs';

const getLogger = (): LoggerService => {
  const {
    WORKER_SECRET,
    WORKER_NAME,
    WORKER_TASK_ID,
    WORKER_BACKEND_URL,
    WORKER_LOKI_URL,
  } = getWorkerEnv();
  const appName = 'Meta-CMS-Worker';
  const workerName = WORKER_NAME;
  const secret = WORKER_SECRET;
  const lokiUrl = WORKER_LOKI_URL;
  const _backendUrl = WORKER_BACKEND_URL;
  const backendUrl = `${_backendUrl}/`.replace(/([^:]\/)\/+/g, '$1');
  const taskId = WORKER_TASK_ID;

  const options: LoggerServiceOptions = {
    appName,
    workerName,
    secret,
    backendUrl,
    lokiUrl,
    taskId,
  };
  const service = new LoggerService(options);

  return service;
};

export const loggerService = getLogger();

export const logger = loggerService.logger;
