import { BackendApiOptions, BackendTaskService } from '@metaio/worker-common';

import { getWorkerEnv } from '../configs';
import { logger } from '../logger';

export function getBackendService(): BackendTaskService {
  const { WORKER_NAME, WORKER_SECRET, WORKER_BACKEND_URL, WORKER_TASK_ID } =
    getWorkerEnv();
  const workerName = WORKER_NAME;
  const secret = WORKER_SECRET;
  const _backendUrl = WORKER_BACKEND_URL;
  const backendUrl = `${_backendUrl}/`.replace(/([^:]\/)\/+/g, '$1');
  const taskId = WORKER_TASK_ID;

  const options: BackendApiOptions = {
    workerName,
    secret,
    backendUrl,
    taskId,
  };

  return new BackendTaskService(logger, options);
}
