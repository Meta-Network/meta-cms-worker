import { ConfigService } from '@metaio/worker-common';
import assert from 'assert';
import { config as dotEnvConfig } from 'dotenv-flow';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
dotEnvConfig();

function readHexoDefault(): Record<string, unknown> {
  try {
    const configFile = path.join(__dirname, 'defaultHexoConfig.yaml');
    fs.accessSync(configFile, fs.constants.R_OK);
    const configData = fs.readFileSync(configFile, 'utf8');
    return yaml.parse(configData);
  } catch (error) {
    return {};
  }
}

function configBuilder(): Record<string, unknown> {
  const hexo = readHexoDefault();
  const conf = {};
  return hexo ? { ...conf, hexo: { ...hexo } } : conf;
}

export const config = new ConfigService(configBuilder());

type WorkerEnv = {
  WORKER_NAME: string;
  WORKER_SECRET: string;
  WORKER_TASK_ID: string;
  WORKER_BACKEND_URL: string;
  WORKER_LOKI_URL: string;
};
export function getWorkerEnv(): WorkerEnv {
  const WORKER_NAME = config.get<string>('WORKER_NAME');
  const WORKER_SECRET = config.get<string>('WORKER_SECRET');
  const WORKER_TASK_ID = config.get<string>('WORKER_TASK_ID');
  const WORKER_BACKEND_URL = config.get<string>('WORKER_BACKEND_URL');
  const WORKER_LOKI_URL = config.get<string>('WORKER_LOKI_URL');
  assert(WORKER_NAME, new Error('Can not find WORKER_NAME env'));
  assert(WORKER_SECRET, new Error('Can not find WORKER_SECRET env'));
  assert(WORKER_TASK_ID, new Error('Can not find WORKER_TASK_ID env'));
  assert(WORKER_BACKEND_URL, new Error('Can not find WORKER_BACKEND_URL env'));
  assert(WORKER_LOKI_URL, new Error('Can not find WORKER_LOKI_URL env'));
  return {
    WORKER_NAME,
    WORKER_SECRET,
    WORKER_TASK_ID,
    WORKER_BACKEND_URL,
    WORKER_LOKI_URL,
  };
}
