import { isPublishTask } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';
import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';

import { TEMPLATE_PATH, WORKSPACE_PATH } from '../constants';
import { logger } from '../logger';
import { GitAuthor, LogContext, MixedTaskConfig } from '../types';
import { exists, isEmptyObj } from '../utils';
import { createAuthHelper } from './helpers/auth';
import { createCommandHelper, IGitCommandHelper } from './helpers/command';
import { GiteeService } from './services/gitee';
import { GitHubService } from './services/github';

/**
 * Create Git service
 * @param taskConfig Worker task config
 */
export async function createGitService(
  taskConfig: MixedTaskConfig,
): Promise<GitService> {
  assert(
    !isEmptyObj(taskConfig),
    new TypeError('parameter "taskConfig" is required!'),
  );
  return await GitService.createGitService(taskConfig);
}

class GitService {
  private constructor(private readonly taskConfig: MixedTaskConfig) {
    this.context = { context: GitService.name };
    const {
      git: { storage },
    } = this.taskConfig;
    const workDir = path.join(WORKSPACE_PATH, storage.reponame);
    this.workspaceDirectory = workDir;
    this.gitAuthor = { name: 'Meta Network', email: 'noreply@meta.io' };
    this.storageGitInfo = storage;
    logger.verbose(
      `User workspace directory is ${this.workspaceDirectory}.`,
      this.context,
    );
  }

  private readonly context: LogContext;
  private readonly workspaceDirectory: string;
  private readonly gitAuthor: GitAuthor;
  private readonly storageGitInfo: MetaWorker.Info.Git;
  private storageGit: IGitCommandHelper;

  // #region Git operations
  private async getRemoteUrl(gitInfo: MetaWorker.Info.Git): Promise<string> {
    const { serviceType, username, reponame } = gitInfo;
    if (serviceType === MetaWorker.Enums.GitServiceType.GITHUB) {
      return GitHubService.getFetchUrl(username, reponame);
    }
    if (serviceType === MetaWorker.Enums.GitServiceType.GITEE) {
      return GiteeService.getFetchUrl(username, reponame);
    }
    throw new Error(`Unsupport type ${serviceType}.`);
  }

  private async initializeRepository(
    git: IGitCommandHelper,
    gitInfo: MetaWorker.Info.Git,
  ): Promise<void> {
    const { branchname } = gitInfo;
    logger.verbose(
      `Initialize git repository to ${this.workspaceDirectory}, branch ${branchname}.`,
      this.context,
    );
    await git.init(branchname);
  }

  private async fetchRepository(
    git: IGitCommandHelper,
    gitInfo: MetaWorker.Info.Git,
  ): Promise<void> {
    logger.verbose(`Initialize git repository.`, this.context);
    await git.init();
    logger.verbose(`Set repository remote 'origin'.`, this.context);
    await this.setRepositoryRemote(git, gitInfo);
    logger.verbose(`Config repository auth info.`, this.context);
    const auth = createAuthHelper(git, gitInfo);
    await auth.configureAuth();
    const { branchname } = gitInfo;
    logger.info(`Fetch branch ${branchname}.`, this.context);
    await git.fetch([
      `+refs/heads/${branchname}:refs/remotes/origin/${branchname}`,
    ]);
    logger.verbose(`Remove repository auth info.`, this.context);
    await auth.removeAuth();
  }

  private async pushRepository(
    git: IGitCommandHelper,
    gitInfo: MetaWorker.Info.Git,
    force = false,
  ): Promise<void> {
    logger.verbose(`Set repository remote 'origin'.`, this.context);
    await this.setRepositoryRemote(git, gitInfo);
    logger.verbose(`Config repository auth info.`, this.context);
    const auth = createAuthHelper(git, gitInfo);
    await auth.configureAuth();
    const { branchname } = gitInfo;
    logger.info(`Push branch ${branchname}.`, this.context);
    await git.push('origin', branchname, force);
    logger.verbose(`Remove repository auth info.`, this.context);
    await auth.removeAuth();
  }

  private async checkoutBranch(
    git: IGitCommandHelper,
    gitInfo: MetaWorker.Info.Git,
  ): Promise<void> {
    const { branchname } = gitInfo;
    logger.verbose(`Checkout branch ${branchname}.`, this.context);
    await git.checkout(branchname);
  }

  private async addAllChanges(git: IGitCommandHelper): Promise<void> {
    logger.verbose(`Add all changes.`, this.context);
    await git.addAll();
  }

  private async commitWithMessage(
    git: IGitCommandHelper,
    msg: string,
    empty?: boolean,
  ): Promise<void> {
    logger.verbose(`Commit with message ${msg}.`, this.context);
    await git.commit(msg, this.gitAuthor, empty);
  }

  private async setRepositoryRemote(
    git: IGitCommandHelper,
    gitInfo: MetaWorker.Info.Git,
    remote = 'origin',
  ): Promise<void> {
    logger.verbose(`Lookup repository remote.`, this.context);
    const remotes = await git.remoteShow();
    if (remotes.includes(remote)) {
      logger.verbose(
        `Previous remote '${remote}' found, remove it.`,
        this.context,
      );
      await git.remoteRemove(remote);
    }
    const remoteUrl = await this.getRemoteUrl(gitInfo);
    logger.verbose(
      `Add repository remote '${remote}', url: ${remoteUrl}.`,
      this.context,
    );
    await git.remoteAdd(remote, remoteUrl);
  }
  // #endregion Git operations

  // #region File and folder operations
  private async removeIfPathExists(path: string): Promise<void> {
    const isExists = await exists(path);
    if (isExists) {
      logger.verbose(`Remove file(s), path ${path}.`, this.context);
      await fs.rm(path, { recursive: true });
    }
  }
  // #endregion File and folder operations

  private async initialize(): Promise<void> {
    // Remove if path already exists
    await this.removeIfPathExists(this.workspaceDirectory);
    // Create workspace directory
    await fs.mkdir(this.workspaceDirectory, { recursive: true });
    logger.info(
      `Git workspace directory ${this.workspaceDirectory} is created.`,
      this.context,
    );
    // Initialize storage git
    const storageGit = await createCommandHelper(this.workspaceDirectory);
    this.storageGit = storageGit;
    logger.info(`Git service has been initialized.`, this.context);
  }

  public static async createGitService(
    taskConfig: MixedTaskConfig,
  ): Promise<GitService> {
    assert(
      !isEmptyObj(taskConfig),
      new TypeError('parameter "taskConfig" is required!'),
    );
    assert(
      !isEmptyObj(taskConfig?.git?.storage),
      new TypeError('git storage info is required!'),
    );
    const service = new GitService(taskConfig);
    await service.initialize();
    return service;
  }

  public async createStorageRepository(): Promise<void> {
    logger.info(`Create storage repository.`, this.context);
    await this.initializeRepository(this.storageGit, this.storageGitInfo);
  }

  public async fetchRemoteStorageRepository(): Promise<void> {
    logger.info(`Fetch remote storage repository.`, this.context);
    await this.fetchRepository(this.storageGit, this.storageGitInfo);
    await this.checkoutBranch(this.storageGit, this.storageGitInfo);
  }

  public async commitStorageRepositoryAllChanges(
    msg: string,
    empty?: boolean,
  ): Promise<void> {
    logger.info(`Commit all changes with message ${msg}.`, this.context);
    await this.addAllChanges(this.storageGit);
    await this.commitWithMessage(this.storageGit, msg, empty);
  }

  public async pushStorageRepositoryToRemote(force?: boolean): Promise<void> {
    logger.info(`Push storage repository to remote.`, this.context);
    await this.pushRepository(this.storageGit, this.storageGitInfo, force);
  }

  public async publishSiteToGitHubPages(): Promise<void> {
    assert(
      isPublishTask(this.taskConfig),
      new Error('Task config is not for publish site.'),
    );
    const {
      publish,
      git: { publisher },
    } = this.taskConfig;
    // /opt/MetaNetwork/Template/public
    const publicDir = path.join(TEMPLATE_PATH, publish?.publishDir || 'public');
    const git = await createCommandHelper(publicDir);
    logger.info(`Create publisher repository.`, this.context);
    await this.initializeRepository(git, publisher);
    const msg = `Publish site ${Date.now()}`;
    logger.info(`Commit all changes with message ${msg}.`, this.context);
    await this.addAllChanges(git);
    await this.commitWithMessage(git, msg);
    // Use force push
    logger.info(`Push publisher repository to remote.`, this.context);
    await this.pushRepository(git, publisher, true);
  }
}
