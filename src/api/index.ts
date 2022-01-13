import {
  BackendTaskService,
  BackendTaskServiceOptions,
} from '@metaio/worker-common';
import { URL } from 'url';

import { config } from '../configs';
import { logger } from '../logger';

export const getBackendService = (): BackendTaskService => {
  const secret = config.get<string>('WORKER_SECRET');
  if (!secret) throw Error('Can not find WORKER_SECRET env');
  const hostName = config.get<string>('HOSTNAME');
  if (!hostName) throw Error('Can not find HOSTNAME env');
  const _backendUrl = config.get<string>('WORKER_BACKEND_URL');
  if (!_backendUrl) throw Error('Can not find WORKER_BACKEND_URL env');
  const baseUrl = `${_backendUrl}/`.replace(/([^:]\/)\/+/g, '$1');
  const backendUrl = new URL('task/git', baseUrl).toString();

  const options: BackendTaskServiceOptions = {
    hostName,
    secret,
    backendUrl,
  };

  return new BackendTaskService(logger, options);
};
