import { isDeployTask, isPublishTask } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';
import fs from 'fs';
import fsp from 'fs/promises';
import { copy } from 'fs-extra';
import os from 'os';
import path from 'path';
import yaml from 'yaml';

import { logger } from '../logger';
import { GitAuthor, LogContext, MixedTaskConfig } from '../types';
import { createAuthHelper } from './helpers/auth';
import { createCommandHelper, IGitCommandHelper } from './helpers/command';
import { GiteeService } from './services/gitee';
import { GitHubService } from './services/github';

type SpecificFrameworkInfo = {
  themeDirName: string;
  sourceDirName: string;
};

export class GitService {
  constructor(private readonly taskConfig: MixedTaskConfig) {
    this.context = { context: GitService.name };

    const {
      task: { taskWorkspace },
    } = this.taskConfig;
    logger.info(`Task workspace is ${taskWorkspace}.`, this.context);

    const baseDir = path.join(os.tmpdir(), taskWorkspace);
    fs.mkdirSync(baseDir, { recursive: true });
    logger.info(
      `Git temporary directory is created, path: ${baseDir}.`,
      this.context,
    );

    this.baseDir = baseDir;

    this.gitAuthor = { name: 'Meta Network', email: 'noreply@meta.io' };
  }

  private readonly context: LogContext;
  /** A path start with os temp directory, e.g: /tmp/workspace */
  private readonly baseDir: string;
  private readonly gitAuthor: GitAuthor;

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
    gitInfo: MetaWorker.Info.Git,
  ): Promise<IGitCommandHelper> {
    const { reponame, branchName } = gitInfo;
    const repoPath = path.join(this.baseDir, reponame);
    // Create repo dir
    await fsp.mkdir(repoPath, { recursive: true });
    logger.info(
      `Initialize git repository to ${repoPath}, branch ${branchName}.`,
      this.context,
    );
    const git = await createCommandHelper(repoPath);
    await git.init(branchName);
    return git;
  }

  private async openRepository(
    gitInfo: MetaWorker.Info.Git,
  ): Promise<IGitCommandHelper> {
    const { reponame } = gitInfo;
    const repoPath = path.join(this.baseDir, reponame);
    if (!fs.existsSync(repoPath)) {
      throw new Error(
        `Can not open git repository, path ${repoPath} not exists.`,
      );
    }
    logger.info(`Open git repository from ${repoPath}.`, this.context);
    return await createCommandHelper(repoPath);
  }

  private async cloneRepository(
    clonePath: string,
    repoUrl: string,
    branch?: string,
    depth?: number,
  ): Promise<IGitCommandHelper> {
    const git = await createCommandHelper(clonePath);
    logger.info(`Clone repository from ${repoUrl}.`, this.context);
    await git.clone(repoUrl, branch, depth);
    return git;
  }

  private async fetchRepository(
    gitInfo: MetaWorker.Info.Git,
    branch: string,
  ): Promise<IGitCommandHelper> {
    const { reponame } = gitInfo;
    const repoPath = path.join(this.baseDir, reponame);
    await this.removeIfPathExists(repoPath);
    logger.info(`Create repository directory, path ${repoPath}.`, this.context);
    await fsp.mkdir(repoPath, { recursive: true });

    const git = await createCommandHelper(repoPath);
    await git.init();
    await this.setRepositoryRemote(git, gitInfo);

    logger.verbose(`Config repository auth info.`, this.context);
    const auth = createAuthHelper(git, gitInfo);
    await auth.configureAuth();

    logger.info(`Fetch branch ${branch}.`, this.context);
    await git.fetch([`+refs/heads/${branch}:refs/remotes/origin/${branch}`]);

    logger.verbose(`Remove repository auth info.`, this.context);
    await auth.removeAuth();

    return git;
  }

  private async addAllChanges(git: IGitCommandHelper): Promise<void> {
    await git.addAll();
  }

  private async commitWithMessage(
    git: IGitCommandHelper,
    msg: string,
    empty?: boolean,
  ): Promise<void> {
    await git.commit(msg, this.gitAuthor, empty);
  }

  private async setRepositoryRemote(
    git: IGitCommandHelper,
    gitInfo: MetaWorker.Info.Git,
    remote = 'origin',
  ): Promise<void> {
    logger.info(`Lookup repository remote.`, this.context);
    const remotes = await git.remoteShow();
    if (remotes.includes(remote)) {
      logger.verbose(
        `Previous remote '${remote}' found, remove it.`,
        this.context,
      );
      await git.remoteRemove(remote);
    }
    const remoteUrl = await this.getRemoteUrl(gitInfo);
    logger.info(
      `Add repository remote '${remote}', url: ${remoteUrl}.`,
      this.context,
    );
    await git.remoteAdd(remote, remoteUrl);
  }
  // #endregion Git operations

  // #region File and folder operations
  private async removeIfPathExists(path: string): Promise<void> {
    const isExists = fs.existsSync(path);
    if (isExists) {
      logger.verbose(`Remove file(s), path ${path}.`, this.context);
      fs.rmSync(path, { recursive: true });
    }
  }

  private async removeDotGitDirectory(findPath: string): Promise<void> {
    const files = await fsp.readdir(findPath, { withFileTypes: true });
    const findDir = files
      .filter((dirent) => dirent.isDirectory())
      .find((dirent) => dirent.name.includes('.git'));
    if (findDir) {
      logger.verbose(`Remove ${findDir.name} directory.`, this.context);
      const gitDir = path.join(findPath, findDir.name);
      await this.removeIfPathExists(gitDir);
    }
  }

  private async cloneTemplateRepository(
    template: MetaWorker.Info.Template,
  ): Promise<string> {
    const tempPath = path.join(this.baseDir, '.template');
    await this.removeIfPathExists(tempPath);
    logger.verbose(
      `Create template directory, path ${tempPath}.`,
      this.context,
    );
    await fsp.mkdir(tempPath, { recursive: true });
    const { templateRepoUrl, templateBranchName } = template;
    logger.info(
      `Clone template repository from ${templateRepoUrl}.`,
      this.context,
    );
    await this.cloneRepository(
      tempPath,
      templateRepoUrl,
      templateBranchName,
      1,
    );
    await this.removeDotGitDirectory(tempPath);
    return tempPath;
  }

  private async cloneThemeRepository(
    theme: MetaWorker.Info.Theme,
  ): Promise<string> {
    const tempPath = path.join(this.baseDir, '.theme');
    await this.removeIfPathExists(tempPath);
    logger.verbose(`Create theme directory, path ${tempPath}.`, this.context);
    await fsp.mkdir(tempPath, { recursive: true });
    const { themeRepo, themeBranch } = theme;
    logger.info(`Clone theme repository from ${themeRepo}.`, this.context);
    await this.cloneRepository(tempPath, themeRepo, themeBranch, 1);
    await this.removeDotGitDirectory(tempPath);
    return tempPath;
  }

  private async copyTemporaryFilesIntoRepo(
    tempPath: string,
    repoPath: string,
  ): Promise<void> {
    await this.removeDotGitDirectory(tempPath);
    logger.info(
      `Copy temporary files from ${tempPath} to ${repoPath}.`,
      this.context,
    );
    await copy(tempPath, repoPath, { recursive: true, overwrite: true });
  }

  private async getSpecificFrameworkInfoByTemplateType(
    type: MetaWorker.Enums.TemplateType,
  ): Promise<SpecificFrameworkInfo> {
    if (type === MetaWorker.Enums.TemplateType.HEXO) {
      return {
        themeDirName: 'themes',
        sourceDirName: 'source',
      };
    }
    throw new Error(
      `getSpecificFrameworkInfoByTemplateType: Unsupported type ${type}.`,
    );
  }

  private async createMetaSpaceConfigFile(
    config: MetaWorker.Configs.DeployConfig,
    repoPath: string,
  ): Promise<void> {
    const fileName = 'meta-space-config.yml';
    const { user, site, theme, gateway, metadata } = config;
    const metaSpaceConfig: MetaWorker.Configs.MetaSpaceConfig = {
      user,
      site,
      theme,
      gateway,
      metadata,
    };
    const filePath = path.join(repoPath, fileName);
    const yamlStr = yaml.stringify(metaSpaceConfig);
    const data = new Uint8Array(Buffer.from(yamlStr));
    await fsp.writeFile(filePath, data, { encoding: 'utf8' });
    logger.info(
      `Successful create ${fileName} file, path: ${filePath}.`,
      this.context,
    );
  }

  // For publisher
  private async createNoJekyllFile(
    workDir: string,
    disableNoJekyll?: boolean,
  ): Promise<void> {
    if (disableNoJekyll) return;
    await fsp.mkdir(workDir, { recursive: true });
    const filePath = path.join(workDir, '.nojekyll');
    const isExists = fs.existsSync(filePath);
    if (isExists) return;
    await fsp.writeFile(filePath, '\n');
    logger.info(
      `Successful create .nojekyll file, path: ${filePath}.`,
      this.context,
    );
  }
  // For publisher
  private async createCNameFile(
    workDir: string,
    content: string,
  ): Promise<void> {
    if (!content) return;
    await fsp.mkdir(workDir, { recursive: true });
    const filePath = path.join(workDir, 'CNAME');
    const isExists = fs.existsSync(filePath);
    if (isExists) {
      logger.verbose(`CNAME file already exists.`, this.context);
      return;
    }
    await fsp.writeFile(filePath, `${content}\n`);
    logger.info(
      `Successful create CNAME file, path: ${filePath}.`,
      this.context,
    );
  }
  // #endregion File and folder operations

  public async createRepoFromTemplate(): Promise<IGitCommandHelper> {
    if (!isDeployTask(this.taskConfig))
      throw new Error(`Task config is not for deploy.`);
    const {
      git: { storage },
      template,
    } = this.taskConfig;
    const git = await this.initializeRepository(storage);

    logger.info(`Clone template repository.`, this.context);
    const templatePath = await this.cloneTemplateRepository(template);

    const repoPath = path.join(this.baseDir, storage.reponame);
    await this.copyTemporaryFilesIntoRepo(templatePath, repoPath);
    logger.info(`Create meta space config file.`, this.context);
    await this.createMetaSpaceConfigFile(this.taskConfig, repoPath);

    return git;
  }

  public async replaceRepoTemplate(): Promise<void> {
    if (!isDeployTask(this.taskConfig))
      throw new Error(`Task config is not for deploy.`);

    const {
      git: { storage },
      template,
    } = this.taskConfig;
    const repoPath = path.join(this.baseDir, storage.reponame);

    // Backup source folder
    const _frameworkInfo = await this.getSpecificFrameworkInfoByTemplateType(
      template.templateType,
    );
    const sourceName = _frameworkInfo.sourceDirName;
    const sourcePath = path.join(repoPath, sourceName);
    const backupPath = path.join(this.baseDir, 'backup', sourceName);
    logger.info(`Backup ${sourcePath} to ${backupPath}.`, this.context);
    await copy(sourcePath, backupPath, {
      recursive: true,
      overwrite: true,
    });

    // Remove all files except .git folder
    const files = await fsp.readdir(repoPath);
    files.forEach((name) => {
      if (name !== '.git') {
        const removePath = path.join(repoPath, name);
        logger.verbose(`Remove path ${removePath}.`, this.context);
        fs.rmSync(removePath, { recursive: true });
      }
    });

    // Clone new template
    logger.info(`Clone new template repository.`, this.context);
    const templatePath = await this.cloneTemplateRepository(template);

    // Copy files
    await this.copyTemporaryFilesIntoRepo(templatePath, repoPath);

    // Remove template source folder
    await this.removeIfPathExists(sourcePath);

    // Restore original source folder
    logger.info(
      `Restore backup from ${backupPath} to ${sourcePath}.`,
      this.context,
    );
    await copy(backupPath, sourcePath, {
      recursive: true,
      overwrite: true,
    });

    // Create meta space config file
    await this.createMetaSpaceConfigFile(this.taskConfig, repoPath);
  }

  public async copyThemeToRepo(): Promise<void> {
    if (!isDeployTask(this.taskConfig)) {
      logger.info(`Task config is not for deploy, skip.`);
      return;
    }
    const {
      theme,
      git: { storage },
    } = this.taskConfig;
    const { themeType, themeName, isPackage } = theme;
    if (isPackage) {
      logger.info(`This theme has npm package, skip.`);
      return;
    }

    logger.info(`Clone theme repository.`, this.context);
    const _theme = await this.cloneThemeRepository(theme);

    const _frameworkInfo = await this.getSpecificFrameworkInfoByTemplateType(
      themeType,
    );
    const _themeDirName = _frameworkInfo.themeDirName;

    const _themePath = path.join(
      this.baseDir,
      storage.reponame,
      _themeDirName,
      themeName,
    );
    logger.verbose(`Create theme directory ${_themePath}.`, this.context);
    await fsp.mkdir(_themePath, { recursive: true });

    logger.info(`Copy theme files to ${_themePath}.`, this.context);
    await this.copyTemporaryFilesIntoRepo(_theme, _themePath);
  }

  public async cloneAndCheckoutFromRemote(
    branch?: string,
  ): Promise<IGitCommandHelper> {
    const {
      git: { storage },
    } = this.taskConfig;
    const { branchName } = storage;
    if (!branch) branch = branchName;

    const git = await this.fetchRepository(storage, branch);

    logger.info(`Checkout branch ${branch}.`, this.context);
    await git.checkout(branch);

    return git;
  }

  public async openRepoFromLocal(branch?: string): Promise<IGitCommandHelper> {
    const {
      git: { storage },
    } = this.taskConfig;
    const repoPath = path.join(this.baseDir, storage.reponame);
    logger.info(`Open local repository from ${repoPath}.`, this.context);
    const git = await this.openRepository(storage);

    if (!branch) branch = storage.branchName;

    const _currbranch = await git.branchCurrent();
    logger.info(`Current branch is ${_currbranch}.`, this.context);

    if (branch !== _currbranch) {
      logger.info(`Checkout branch ${branch}.`, this.context);
      await git.checkout(branch);
    }

    return git;
  }

  public async commitAllChangesWithMessage(
    git: IGitCommandHelper,
    msg: string,
    empty?: boolean,
  ): Promise<void> {
    logger.info(`Commit all changes with message ${msg}.`, this.context);
    await this.addAllChanges(git);
    await this.commitWithMessage(git, msg, empty);
  }

  public async pushLocalRepoToRemote(
    git: IGitCommandHelper,
    info: MetaWorker.Info.Git,
    branch?: string,
    force?: boolean,
  ): Promise<void> {
    logger.verbose(`Config repository auth info.`, this.context);
    const auth = createAuthHelper(git, info);
    await auth.configureAuth();
    logger.info(`Set repository remote 'origin'.`, this.context);
    await this.setRepositoryRemote(git, info);
    const { branchName } = info;
    if (!branch) branch = branchName;
    logger.info(
      `Pushing local repository to remote 'origin', branch ${branch}.`,
      this.context,
    );
    await git.push('origin', branch, force);
    logger.verbose(`Remove repository auth info.`, this.context);
    await auth.removeAuth();
  }

  public async publishSiteToGitHubPages(): Promise<void> {
    if (!isPublishTask(this.taskConfig))
      throw new Error('Task config is not for publish site.');
    const {
      publish,
      site,
      git: { publisher, storage },
    } = this.taskConfig;
    const { publishDir, publishBranch } = publish;
    const workDir = path.join(this.baseDir, storage.reponame, publishDir);
    await this.createNoJekyllFile(workDir);
    await this.createCNameFile(workDir, site.domain);

    const publishGitInfo: MetaWorker.Info.Git = {
      ...publisher,
      reponame: path.join(storage.reponame, publishDir), // storageReponame/publishDir
      branchName: publishBranch,
    };
    const git = await this.initializeRepository(publishGitInfo);
    await this.commitAllChangesWithMessage(git, `Publish ${Date.now()}`);
    // Use force push
    await this.pushLocalRepoToRemote(git, publisher, publishBranch, true);
  }

  public async generateMetaSpaceConfig(): Promise<void> {
    if (!isDeployTask(this.taskConfig))
      throw new Error(`Task config is not for deploy.`);
    logger.info(`Generate meta space config file.`, this.context);
    const {
      git: { storage },
    } = this.taskConfig;
    const repoPath = path.join(this.baseDir, storage.reponame);
    await this.createMetaSpaceConfigFile(this.taskConfig, repoPath);
  }
}
