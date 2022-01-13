import { ConfigService } from '@metaio/worker-common';
import { config as dotEnvConfig } from 'dotenv-flow';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
dotEnvConfig();

const readHexoDefault = (): Record<string, unknown> => {
  try {
    const configFile = path.join(__dirname, 'defaultHexoConfig.yaml');
    fs.accessSync(configFile, fs.constants.R_OK);
    const configData = fs.readFileSync(configFile, 'utf8');
    return yaml.parse(configData);
  } catch (error) {
    return {};
  }
};

const configBuilder = (): Record<string, unknown> => {
  const hexo = readHexoDefault();
  const conf = {};
  return hexo ? { ...conf, hexo: { ...hexo } } : conf;
};

export const config = new ConfigService(configBuilder());
