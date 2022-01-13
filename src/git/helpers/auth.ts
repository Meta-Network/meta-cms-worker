import { MetaWorker } from '@metaio/worker-model';
import fsp from 'fs/promises';
import path from 'path';

import { logger } from '../../logger';
import { LogContext } from '../../types';
import { GiteeService } from '../services/gitee';
import { GitHubService } from '../services/github';
import { IGitCommandHelper } from './command';

export interface IGitAuthHelper {
  configureAuth(): Promise<void>;
  removeAuth(): Promise<void>;
}

export function createAuthHelper(
  git: IGitCommandHelper,
  gitInfo: MetaWorker.Info.Git,
): IGitAuthHelper {
  return new GitAuthHelper(git, gitInfo);
}

class GitAuthHelper implements IGitAuthHelper {
  public constructor(
    private readonly git: IGitCommandHelper,
    private readonly gitInfo: MetaWorker.Info.Git,
  ) {
    this.context = {
      context: this.constructor.name,
    };

    const { serviceType, token, username } = this.gitInfo;

    if (serviceType === MetaWorker.Enums.GitServiceType.GITHUB) {
      const serverUrl = GitHubService.getServerUrl();
      const basicCredential = GitHubService.getBasicCredential(token);
      this.tokenConfigKey = `http.${serverUrl.origin}/.extraheader`;
      this.tokenConfigValue = `AUTHORIZATION: basic ${basicCredential}`;
    }
    if (serviceType === MetaWorker.Enums.GitServiceType.GITEE) {
      const serverUrl = GiteeService.getServerUrl();
      const basicCredential = GiteeService.getBasicCredential(token, username);
      this.tokenConfigKey = `http.${serverUrl.origin}/.extraheader`;
      this.tokenConfigValue = `AUTHORIZATION: basic ${basicCredential}`;
    }

    this.tokenPlaceholderConfigValue = `AUTHORIZATION: basic ***`;
  }

  private readonly context: LogContext;
  private readonly tokenConfigKey: string;
  private readonly tokenConfigValue: string;
  private readonly tokenPlaceholderConfigValue: string;

  private async configureToken(configPath?: string): Promise<void> {
    if (!configPath) {
      configPath = path.join(this.git.getWorkingDirectory(), '.git', 'config');
    }
    await this.git.config(
      this.tokenConfigKey,
      this.tokenPlaceholderConfigValue,
    );
    await this.replaceTokenPlaceholder(configPath);
  }

  private async replaceTokenPlaceholder(configPath: string): Promise<void> {
    logger.verbose(
      `Add auth token header to Git config ${configPath}`,
      this.context,
    );
    const config = await fsp.readFile(configPath, { encoding: 'utf-8' });
    const find = config.includes(this.tokenPlaceholderConfigValue);
    if (!find) {
      throw new Error(`Unable to find auth placeholder in ${configPath}`);
    }
    const content = config.replace(
      this.tokenPlaceholderConfigValue,
      this.tokenConfigValue,
    );
    await fsp.writeFile(configPath, content, { encoding: 'utf-8' });
  }

  private async removeToken(): Promise<void> {
    await this.removeGitConfig(this.tokenConfigKey);
  }

  private async removeGitConfig(configKey: string): Promise<void> {
    logger.verbose(`Remove Git config ${configKey}`, this.context);
    const exists = await this.git.configExists(configKey);
    if (exists) {
      await this.git.configUnset(configKey);
    }
  }

  public async configureAuth(): Promise<void> {
    await this.removeAuth();
    await this.configureToken();
  }

  public async removeAuth(): Promise<void> {
    await this.removeToken();
  }
}
