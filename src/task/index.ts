import { checkAllowedTasks } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';
import Hexo from 'hexo';

import { GitService } from '../git';
import { HexoService } from '../hexo';
import { logger } from '../logger';
import { MixedTaskConfig } from '../types';

export async function startWorkerTask(
  taskConf: MixedTaskConfig,
  gitServiceFactory: (taskConfig: MixedTaskConfig) => Promise<GitService>,
  hexoServiceFactory: (
    taskConfig: MixedTaskConfig,
    args?: Hexo.InstanceOptions,
  ) => Promise<HexoService>,
): Promise<void> {
  const siteTasks: MetaWorker.Enums.WorkerTaskMethod[] = [
    MetaWorker.Enums.WorkerTaskMethod.DEPLOY_SITE,
    MetaWorker.Enums.WorkerTaskMethod.PUBLISH_SITE,
  ];
  const postTasks: MetaWorker.Enums.WorkerTaskMethod[] = [
    MetaWorker.Enums.WorkerTaskMethod.CREATE_POSTS,
    MetaWorker.Enums.WorkerTaskMethod.UPDATE_POSTS,
    MetaWorker.Enums.WorkerTaskMethod.DELETE_POSTS,
  ];
  const allowedTasks: MetaWorker.Enums.WorkerTaskMethod[] = [
    ...siteTasks,
    ...postTasks,
  ];

  const { taskId, taskMethod } = taskConf.task;
  logger.info(`Task id ${taskId} start, method ${taskMethod}`);

  checkAllowedTasks(taskMethod, allowedTasks);

  if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.DEPLOY_SITE) {
    logger.info(`Execute gitServiceFactory method`);
    const gitService = await gitServiceFactory(taskConf);
    logger.info(`Execute createStorageRepository method`);
    await gitService.createStorageRepository();
    logger.info(`Execute hexoServiceFactory method`);
    const hexoService = await hexoServiceFactory(taskConf);
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
    logger.info(`Execute gitServiceFactory method`);
    const gitService = await gitServiceFactory(taskConf);
    logger.info(`Execute fetchRemoteStorageRepository method`);
    await gitService.fetchRemoteStorageRepository();
    logger.info(`Execute hexoServiceFactory method`);
    const hexoService = await hexoServiceFactory(taskConf);
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

  if (postTasks.includes(taskMethod)) {
    logger.info(`Execute gitServiceFactory method`);
    const gitService = await gitServiceFactory(taskConf);
    logger.info(`Execute fetchRemoteStorageRepository method`);
    await gitService.fetchRemoteStorageRepository();
    logger.info(`Execute hexoServiceFactory method`);
    const hexoService = await hexoServiceFactory(taskConf);
    logger.info(`Execute symlinkWorkspaceDirectoryAndFiles method`);
    await hexoService.symlinkWorkspaceDirectoryAndFiles();
    if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.CREATE_POSTS) {
      logger.info(`Execute createHexoPostFiles method`);
      await hexoService.createHexoPostFiles(false);
      logger.info(`Execute commitStorageRepositoryAllChanges method`);
      await gitService.commitStorageRepositoryAllChanges(
        `Create post ${Date.now()}`,
      );
    }
    if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.UPDATE_POSTS) {
      logger.info(`Execute createHexoPostFiles method`);
      await hexoService.createHexoPostFiles(true);
      logger.info(`Execute commitStorageRepositoryAllChanges method`);
      await gitService.commitStorageRepositoryAllChanges(
        `Update post ${Date.now()}`,
      );
    }
    if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.DELETE_POSTS) {
      logger.info(`Execute deleteHexoPostFiles method`);
      await hexoService.deleteHexoPostFiles();
      logger.info(`Execute commitStorageRepositoryAllChanges method`);
      await gitService.commitStorageRepositoryAllChanges(
        `Delete post ${Date.now()}`,
      );
    }
    logger.info(`Execute pushStorageRepositoryToRemote method`);
    await gitService.pushStorageRepositoryToRemote();
  }
}
