import { LoggerService, LoggerServiceOptions } from '@metaio/worker-common';
import { URL } from 'url';

import { config } from '../configs';

const getLogger = (): LoggerService => {
  const appName = config.get<string>('WORKER_APP_NAME', 'app');
  const hostName = config.get<string>('HOSTNAME');
  if (!hostName) throw Error('Can not find HOSTNAME env');
  const secret = config.get<string>('WORKER_SECRET');
  if (!secret) throw Error('Can not find WORKER_SECRET env');
  const lokiUrl = config.get<string>('WORKER_LOKI_URL');
  if (!lokiUrl) throw Error('Can not find WORKER_LOKI_URL env');
  const _backendUrl = config.get<string>('WORKER_BACKEND_URL');
  if (!_backendUrl) throw Error('Can not find WORKER_BACKEND_URL env');
  const baseUrl = `${_backendUrl}/`.replace(/([^:]\/)\/+/g, '$1');
  const backendUrl = new URL('task/git', baseUrl).toString();

  const options: LoggerServiceOptions = {
    appName,
    hostName,
    secret,
    lokiUrl,
    backendUrl,
  };
  const service = new LoggerService(options);

  return service;
};

export const loggerService = getLogger();

export const logger = loggerService.logger;
