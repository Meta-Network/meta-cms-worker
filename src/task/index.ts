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

  const gitService = await createGitService(taskConf);
  const hexoService = await createHexoService(taskConf);

  if (taskMethod === MetaWorker.Enums.WorkerTaskMethod.DEPLOY_SITE) {
    logger.info(`Execute createStorageRepository method`);
    await gitService.createStorageRepository();
    logger.info(`Execute createWorkspaceSourceDirectory method`);
    await hexoService.createWorkspaceSourceDirectory();
    logger.info(`Execute commitStorageRepositoryAllChanges method`);
    await gitService.commitStorageRepositoryAllChanges(
      `Deploy site ${Date.now()}`,
    );
    logger.info(`Execute pushStorageRepositoryToRemote method`);
    await gitService.pushStorageRepositoryToRemote();
  }
}
