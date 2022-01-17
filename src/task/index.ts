import { checkAllowedTasks } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';

import { getBackendService } from '../api';
import { GitService } from '../git';
import { createHexoService } from '../hexo';
import { logger, loggerService } from '../logger';
import { MixedTaskConfig } from '../types';

export const startGitTask = async (): Promise<void> => {
  const allowedTasks: MetaWorker.Enums.TaskMethod[] = [
    MetaWorker.Enums.TaskMethod.GIT_CLONE_CHECKOUT,
    MetaWorker.Enums.TaskMethod.GIT_COMMIT_PUSH,
    MetaWorker.Enums.TaskMethod.GIT_INIT_PUSH,
    MetaWorker.Enums.TaskMethod.GIT_OVERWRITE_PUSH,
    MetaWorker.Enums.TaskMethod.GIT_OVERWRITE_THEME,
    MetaWorker.Enums.TaskMethod.PUBLISH_GITHUB_PAGES,
    MetaWorker.Enums.TaskMethod.GENERATE_METASPACE_CONFIG,
    MetaWorker.Enums.TaskMethod.HEXO_UPDATE_CONFIG,
    MetaWorker.Enums.TaskMethod.HEXO_GENERATE_DEPLOY,
    MetaWorker.Enums.TaskMethod.HEXO_CREATE_POST,
    MetaWorker.Enums.TaskMethod.HEXO_UPDATE_POST,
    MetaWorker.Enums.TaskMethod.HEXO_DELETE_POST,
    MetaWorker.Enums.TaskMethod.HEXO_CREATE_DRAFT,
    MetaWorker.Enums.TaskMethod.HEXO_UPDATE_DRAFT,
    MetaWorker.Enums.TaskMethod.HEXO_PUBLISH_DRAFT,
    MetaWorker.Enums.TaskMethod.HEXO_MOVETO_DRAFT,
  ];

  const http = getBackendService();
  const taskConf = await http.getWorkerTaskFromBackend<MixedTaskConfig>();
  if (!taskConf) throw Error('Can not get task config from backend or gateway');

  const { taskId, taskMethod } = taskConf.task;
  logger.info(`Task id ${taskId} start, method ${taskMethod}`);

  checkAllowedTasks(taskMethod, allowedTasks);

  const gitService = new GitService(taskConf);
  const hexoService = await createHexoService(taskConf);

  if (taskMethod === MetaWorker.Enums.TaskMethod.GIT_CLONE_CHECKOUT) {
    logger.info(`Starting task cloneAndCheckoutFromRemote`);
    await gitService.cloneAndCheckoutFromRemote();
    logger.info(`Task cloneAndCheckoutFromRemote finished`);
    logger.info(`Starting task copyThemeToRepo`);
    await gitService.copyThemeToRepo();
    logger.info(`Task copyThemeToRepo finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.GIT_COMMIT_PUSH) {
    logger.info(`Starting task openRepoFromLocal`);
    const repo = await gitService.openRepoFromLocal();
    logger.info(`Task openRepoFromLocal finished`);

    logger.info(`Starting task commitAllChangesWithMessage`);
    await gitService.commitAllChangesWithMessage(repo, 'Update', true);
    logger.info(`Task commitAllChangesWithMessage finished`);

    logger.info(`Starting task pushLocalRepoToRemote`);
    await gitService.pushLocalRepoToRemote(repo, taskConf.git.storage);
    logger.info(`Task pushLocalRepoToRemote finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.GIT_INIT_PUSH) {
    logger.info(`Starting task createRepoFromTemplate`);
    const repo = await gitService.createRepoFromTemplate();
    logger.info(`Task createRepoFromTemplate finished`);

    logger.info(`Starting task commitAllChangesWithMessage`);
    await gitService.commitAllChangesWithMessage(repo, 'Initial Commit');
    logger.info(`Task commitAllChangesWithMessage finished`);

    logger.info(`Starting task pushLocalRepoToRemote`);
    await gitService.pushLocalRepoToRemote(repo, taskConf.git.storage);
    logger.info(`Task pushLocalRepoToRemote finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.GIT_OVERWRITE_PUSH) {
    logger.info(`Starting task cloneAndCheckoutFromRemote`);
    const _repo = await gitService.cloneAndCheckoutFromRemote();
    logger.info(`Task cloneAndCheckoutFromRemote finished`);

    logger.info(`Starting task replaceRepoTemplate`);
    await gitService.replaceRepoTemplate();
    logger.info(`Task replaceRepoTemplate finished`);

    logger.info(`Starting task commitAllChangesWithMessage`);
    await gitService.commitAllChangesWithMessage(_repo, 'Change template');
    logger.info(`Task commitAllChangesWithMessage finished`);

    logger.info(`Starting task pushLocalRepoToRemote`);
    await gitService.pushLocalRepoToRemote(_repo, taskConf.git.storage);
    logger.info(`Task pushLocalRepoToRemote finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.GIT_OVERWRITE_THEME) {
    logger.info(`Starting task copyThemeToRepo`);
    await gitService.copyThemeToRepo();
    logger.info(`Task copyThemeToRepo finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.PUBLISH_GITHUB_PAGES) {
    logger.info(`Starting task publishSiteToGitHubPages`);
    await gitService.publishSiteToGitHubPages();
    logger.info(`Task publishSiteToGitHubPages finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.GENERATE_METASPACE_CONFIG) {
    logger.info(`Starting task generateMetaSpaceConfig`);
    await gitService.generateMetaSpaceConfig();
    logger.info(`Task generateMetaSpaceConfig finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_UPDATE_CONFIG) {
    logger.info(`Starting task updateHexoConfigFiles`);
    await hexoService.updateHexoConfigFiles();
    logger.info(`Task updateHexoConfigFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_GENERATE_DEPLOY) {
    logger.info(`Starting task generateHexoStaticFiles`);
    await hexoService.generateHexoStaticFiles();
    logger.info(`Task generateHexoStaticFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_CREATE_POST) {
    logger.info(`Starting task createHexoPostFiles`);
    await hexoService.createHexoPostFiles();
    logger.info(`Task createHexoPostFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_UPDATE_POST) {
    logger.info(`Starting task createHexoPostFiles, replase true`);
    await hexoService.createHexoPostFiles(true);
    logger.info(`Task createHexoPostFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_DELETE_POST) {
    logger.info(`Starting task deleteHexoPostFiles`);
    await hexoService.deleteHexoPostFiles();
    logger.info(`Task deleteHexoPostFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_CREATE_DRAFT) {
    logger.info(`Starting task createHexoDraftFiles`);
    await hexoService.createHexoDraftFiles();
    logger.info(`Task createHexoDraftFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_UPDATE_DRAFT) {
    logger.info(`Starting task createHexoDraftFiles, replase true`);
    await hexoService.createHexoDraftFiles(true);
    logger.info(`Task createHexoDraftFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_PUBLISH_DRAFT) {
    logger.info(`Starting task publishHexoDraftFiles, replase true`);
    await hexoService.publishHexoDraftFiles(true);
    logger.info(`Task publishHexoDraftFiles finished`);
  }

  if (taskMethod === MetaWorker.Enums.TaskMethod.HEXO_MOVETO_DRAFT) {
    logger.info(`Starting task moveHexoPostFilesToDraft`);
    await hexoService.moveHexoPostFilesToDraft();
    logger.info(`Task moveHexoPostFilesToDraft finished`);
  }

  await http.reportWorkerTaskFinishedToBackend();
  loggerService.final('Task finished');
};
