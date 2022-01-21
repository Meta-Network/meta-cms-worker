import path from 'path';

import { config } from '../configs';

const templatePath = config.get<string>(
  'TEMPLATE_PATH',
  '/opt/MetaNetwork/Template',
);
const workspacePath = config.get<string>(
  'WORKSPACE_PATH',
  '/opt/MetaNetwork/Workspace',
);
export const TEMPLATE_PATH = path.resolve(templatePath);
export const WORKSPACE_PATH = path.resolve(workspacePath);

export const DEFAULT_HEXO_AVATAR_URL =
  'https://ipfs.fleek.co/ipfs/bafybeiccss3figrixd5qhhv6i6zhbz5chmyls6ja5kscu6drg7fnjcnxgm';
export const DEFAULT_HEXO_LANGUAGE = 'en';
export const DEFAULT_HEXO_TIMEZONE = 'Asia/Shanghai';
export const DEFAULT_HEXO_PUBLIC_URL = 'https://example.com';
export const DEFAULT_HEXO_CONFIG_FILE_NAME = '_config.yml';
export const DEFAULT_META_SPACE_CONFIG_FILE_NAME = 'meta-space-config.yml';
