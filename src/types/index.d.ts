import { MetaWorker } from '@metaio/worker-model';

export type MixedTaskConfig =
  | MetaWorker.Configs.DeployTaskConfig
  | MetaWorker.Configs.PublishTaskConfig
  | MetaWorker.Configs.PostTaskConfig;

export type LogContext = {
  context: string;
};

export type GitAuthor = {
  name: string;
  email: string;
};
