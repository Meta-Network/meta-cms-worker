import { checkAllowedTasks } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';

import { createGitService } from '../git';
import { createHexoService } from '../hexo';
import { logger } from '../logger';
import { MixedTaskConfig } from '../types';

export async function startWorkerTask(
  taskConf: MixedTaskConfig,
): Promise<void> {
  const allowedTasks: MetaWorker.Enums.WorkerTaskMethod[] = [
    MetaWorker.Enums.WorkerTaskMethod.DEPLOY_SITE,
    MetaWorker.Enums.WorkerTaskMethod.PUBLISH_SITE,
    MetaWorker.Enums.WorkerTaskMethod.CREATE_POSTS,
    MetaWorker.Enums.WorkerTaskMethod.UPDATE_POSTS,
    MetaWorker.Enums.WorkerTaskMethod.DELETE_POSTS,
  ];

  const { taskId, taskMethod } = taskConf.task;
  logger.info(`Task id ${taskId} start, method ${taskMethod}`);

  checkAllowedTasks(taskMethod, allowedTasks);

  if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.DEPLOY_SITE) {
    logger.info(`Execute createGitService method`);
    const gitService = await createGitService(taskConf);
    logger.info(`Execute createStorageRepository method`);
    await gitService.createStorageRepository();
    logger.info(`Execute createHexoService method`);
    const hexoService = await createHexoService(taskConf);
    logger.info(`Execute createWorkspaceSourceDirectory method`);
    await hexoService.createWorkspaceSourceDirectory();
    logger.info(`Execute commitStorageRepositoryAllChanges method`);
    await gitService.commitStorageRepositoryAllChanges(
      `Deploy site ${Date.now()}`,
    );
    logger.info(`Execute pushStorageRepositoryToRemote method`);
    await gitService.pushStorageRepositoryToRemote();
  }

  if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.PUBLISH_SITE) {
    logger.info(`Execute createGitService method`);
    const gitService = await createGitService(taskConf);
    logger.info(`Execute fetchRemoteStorageRepository method`);
    await gitService.fetchRemoteStorageRepository();
    logger.info(`Execute createHexoService method`);
    const hexoService = await createHexoService(taskConf);
    logger.info(`Execute commitStorageRepositoryAllChanges method`);
    await gitService.commitStorageRepositoryAllChanges(
      `Update config ${Date.now()}`,
    );
    logger.info(`Execute pushStorageRepositoryToRemote method`);
    await gitService.pushStorageRepositoryToRemote();
    logger.info(`Execute symlinkWorkspaceDirectoryAndFiles method`);
    await hexoService.symlinkWorkspaceDirectoryAndFiles();
    logger.info(`Execute generateHexoStaticFiles method`);
    await hexoService.generateHexoStaticFiles();
    logger.info(`Execute createDotNoJekyllAndCNameFile method`);
    await hexoService.createDotNoJekyllAndCNameFile();
    logger.info(`Execute publishSiteToGitHubPages method`);
    await gitService.publishSiteToGitHubPages();
  }

  if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.CREATE_POSTS) {
    logger.info(`Execute createGitService method`);
    const gitService = await createGitService(taskConf);
    logger.info(`Execute fetchRemoteStorageRepository method`);
    await gitService.fetchRemoteStorageRepository();
    logger.info(`Execute createHexoService method`);
    const hexoService = await createHexoService(taskConf);
    logger.info(`Execute symlinkWorkspaceDirectoryAndFiles method`);
    await hexoService.symlinkWorkspaceDirectoryAndFiles();
    logger.info(`Execute createHexoPostFiles method`);
    await hexoService.createHexoPostFiles(false);
    logger.info(`Execute commitStorageRepositoryAllChanges method`);
    await gitService.commitStorageRepositoryAllChanges(
      `Create post ${Date.now()}`,
    );
    logger.info(`Execute pushStorageRepositoryToRemote method`);
    await gitService.pushStorageRepositoryToRemote();
  }
}
