import { isDeployTask, isPostTask } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';
import Hexo from 'hexo';
import HexoInternalConfig from 'hexo/lib/hexo/default_config';
import { exists } from 'hexo-fs';
import path from 'path';

import { config } from '../configs';
import {
  DEFAULT_HEXO_AVATAR_URL,
  DEFAULT_HEXO_CONFIG_FILE_NAME,
  DEFAULT_HEXO_LANGUAGE,
  DEFAULT_HEXO_PUBLIC_URL,
  DEFAULT_HEXO_TIMEZONE,
  TEMPLATE_PATH,
  WORKSPACE_PATH,
} from '../constants';
import { logger } from '../logger';
import { LogContext, MixedTaskConfig } from '../types';
import { HexoConfig, HexoFrontMatter } from '../types/hexo';
import {
  formatUrl,
  isEmptyObj,
  objectToYamlFile,
  omitObj,
  yamlFileToObject,
} from '../utils';
import { createCommandHelper, IHexoCommandHelper } from './helpers';

export interface IHexoService {
  generateHexoStaticFiles(): Promise<void>;
}

/**
 * Create Hexo service
 * @param taskConfig Worker task config
 * @param args Hexo initialization options see: https://hexo.io/api/#Initialize
 */
export async function createHexoService(
  taskConfig: MixedTaskConfig,
  args?: Hexo.InstanceOptions,
): Promise<HexoService> {
  return await HexoService.createHexoService(taskConfig, args);
}

class HexoService implements IHexoService {
  private constructor(private readonly taskConfig: MixedTaskConfig) {
    this.context = { context: HexoService.name };
    const {
      git: { storage },
    } = this.taskConfig;
    const workDir = path.join(WORKSPACE_PATH, storage.reponame);
    logger.verbose(`User workspace directory is ${workDir}`, this.context);
    this.workingDirectory = workDir;
    this.templateDirectory = TEMPLATE_PATH;
  }

  private readonly context: LogContext;
  private readonly workingDirectory: string;
  private readonly templateDirectory: string;
  private hexo: IHexoCommandHelper;

  private async getDefaultHexoConfig(): Promise<HexoConfig> {
    logger.info(`Get default Hexo config`, this.context);
    const defaultConf = config.get<HexoConfig>('hexo', {} as HexoConfig);

    if (isEmptyObj(defaultConf)) {
      logger.warn(
        `Can not get default Hexo config, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }

    return defaultConf;
  }

  private async getHexoConfigFromTaskConfig(
    taskConfig: MetaWorker.Configs.DeployTaskConfig,
  ): Promise<HexoConfig> {
    logger.info(`Get Hexo config from task config`, this.context);
    const isDeploy = isDeployTask(taskConfig);

    if (!isDeploy) {
      logger.warn(
        `Task config is not for deploy, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }

    const { site, user, theme } = taskConfig;
    const userConf: Partial<HexoConfig> = {
      title: site.title,
      subtitle: site.subtitle || '',
      description: site.description || '',
      author: site.author || user.nickname || user.username || '',
      avatar: site.avatar || DEFAULT_HEXO_AVATAR_URL,
      keywords: site.keywords || [],
      // No favicon on _config.yml(taskConfig.favicon)
      language: site.language || DEFAULT_HEXO_LANGUAGE,
      timezone: site.timezone || DEFAULT_HEXO_TIMEZONE,
      /**
       * On our platform, it always has a domain,
       * but Hexo not allow empty url,
       * if someting happen, use default
       */
      url: formatUrl(site.domain) || DEFAULT_HEXO_PUBLIC_URL,
      theme: theme?.themeName?.toLowerCase(),
    };
    return userConf as HexoConfig;
  }

  private async getHexoConfigFromWorkspace(): Promise<HexoConfig> {
    logger.info(`Get Hexo config from workspace`, this.context);
    const confPath = path.join(
      this.workingDirectory,
      DEFAULT_HEXO_CONFIG_FILE_NAME,
    );
    const isExists = await exists(confPath);

    if (!isExists) {
      logger.warn(
        `Can not find workspace Hexo config in ${confPath}, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }

    try {
      const workConf = await yamlFileToObject<HexoConfig>(confPath);
      return workConf;
    } catch (error) {
      logger.error(`${error}`, error, this.context);
      logger.warn(
        `Can not read or parse workspace Hexo config in ${confPath}, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }
  }

  private async createWorkspaceHexoConfigFile(
    taskConfig: MetaWorker.Configs.DeployTaskConfig,
  ): Promise<void> {
    // Get default Hexo config
    const defConf = await this.getDefaultHexoConfig();
    // Get Hexo config from taskConfig
    const userConf = await this.getHexoConfigFromTaskConfig(taskConfig);
    // Current not support Hexo multi config path
    const confPath = path.join(
      this.workingDirectory,
      DEFAULT_HEXO_CONFIG_FILE_NAME,
    );
    const isExists = await exists(confPath);

    try {
      // If has _config.yml, update it
      if (isExists) {
        logger.info(
          `Hexo config in workspace path ${confPath} already exists, will update it`,
          this.context,
        );
        const confRaw = await this.getHexoConfigFromWorkspace();
        const conf = { ...defConf, ...confRaw, ...userConf };
        logger.verbose(`Write Hexo config file ${confPath}`, this.context);
        await objectToYamlFile(conf, confPath);
      }
      // If no _config.yml, create it
      if (!isExists) {
        logger.info(
          `Hexo config in workspace path ${confPath} not exists, will create it`,
          this.context,
        );
        const conf: HexoConfig = {
          ...HexoInternalConfig,
          ...defConf,
          ...userConf,
        };
        logger.verbose(`Write Hexo config file ${confPath}`, this.context);
        await objectToYamlFile(conf, confPath);
      }
    } catch (error) {
      logger.error(
        `Can not create or update workspace Hexo config file ${confPath}`,
        error,
        this.context,
      );
      // throw error when create Hexo config file
      if (!isExists) throw error;
    }
  }

  private async updateHexoThemeConfigFile(
    taskConfig: MetaWorker.Configs.DeployTaskConfig,
  ): Promise<void> {
    // TODO: update Hexo theme config file
  }

  private async createHexoPostFile(
    post: MetaWorker.Info.Post,
    layout: 'post' | 'draft',
    replace = false,
  ): Promise<void> {
    const postData: Hexo.Post.Data & HexoFrontMatter = {
      layout,
      title: post.title,
      date: post.createdAt || post.updatedAt || Date.now(),
      updated: post.updatedAt || '',
      tags: post.tags || [],
      categories: post.categories || [],
      excerpt: post.summary || '',
      ...post,
    };
    // TODO
  }

  private async publishHexoDraftFile(
    post: MetaWorker.Info.Post,
    replace = false,
  ): Promise<void> {
    const postData: Hexo.Post.Data & HexoFrontMatter = {
      layout: 'post',
      slug: post.title,
      title: post.title,
      date: post.createdAt || post.updatedAt || Date.now(),
      // Below fields are not be update when publish from draft
      updated: post.updatedAt || '',
      tags: post.tags || [],
      categories: post.categories || [],
      excerpt: post.summary || '',
    };
    // TODO
  }

  private async getPostInfoWithNewTitle(
    post: MetaWorker.Info.Post,
  ): Promise<MetaWorker.Info.Post> {
    const _post: MetaWorker.Info.Post = {
      ...post,
      title: post.META_SPACE_INTERNAL_NEW_TITLE as string,
    };
    // Remove all meta space internal props
    const propArr = Object.keys(_post).filter((key) =>
      key.startsWith('META_SPACE_INTERNAL'),
    );
    return omitObj(_post, propArr);
  }

  private async processHexoPostFile(
    post: MetaWorker.Info.Post | MetaWorker.Info.Post[],
    processer: (post: MetaWorker.Info.Post, index?: number) => Promise<void>,
  ): Promise<void> {
    try {
      if (Array.isArray(post)) {
        await Promise.allSettled(
          post.map(async (_post, index) => {
            await processer(_post, index);
          }),
        );
      } else {
        await processer(post);
      }
    } catch (error) {
      await this.hexo.exit(error);
      throw error;
    }
  }

  private async initialize(args?: Hexo.InstanceOptions): Promise<void> {
    if (isDeployTask(this.taskConfig)) {
      // Update _config.yml before Hexo init
      await this.createWorkspaceHexoConfigFile(this.taskConfig);
    }
    const hexo = await createCommandHelper(args);
    this.hexo = hexo;
    logger.info(`Hexo service has been initialized`, this.context);
  }

  public static async createHexoService(
    taskConfig: MixedTaskConfig,
    args?: Hexo.InstanceOptions,
  ): Promise<HexoService> {
    const service = new HexoService(taskConfig);
    await service.initialize(args);
    return service;
  }

  async updateHexoConfigFiles(): Promise<void> {
    if (!isDeployTask(this.taskConfig))
      throw new Error(`Task config is not for deploy`);
    await this.createWorkspaceHexoConfigFile(this.taskConfig);
    await this.updateHexoThemeConfigFile(this.taskConfig);
  }

  public async generateHexoStaticFiles(): Promise<void> {
    this.hexo.generate();
  }

  async createHexoPostFiles(update = false): Promise<void> {
    if (!isPostTask(this.taskConfig))
      throw new Error('Task config is not for create post');
    const { post } = this.taskConfig;
    await this.processHexoPostFile(
      post,
      async (post: MetaWorker.Info.Post, index?: number) => {
        if (index) {
          logger.info(`Create Hexo post file queue ${index + 1}`, this.context);
        } else {
          logger.info(`Create single Hexo post file`, this.context);
        }
        let _post = post;
        if (_post.META_SPACE_INTERNAL_NEW_TITLE) {
          await this.hexo.remove(_post, 'post');
          const _nPost = await this.getPostInfoWithNewTitle(_post);
          _post = _nPost;
        }
        await this.createHexoPostFile(_post, 'post', update);
      },
    );
  }

  async createHexoDraftFiles(update = false): Promise<void> {
    if (!isPostTask(this.taskConfig))
      throw new Error('Task config is not for create draft');
    const { post } = this.taskConfig;
    await this.processHexoPostFile(
      post,
      async (post: MetaWorker.Info.Post, index?: number) => {
        if (index) {
          logger.info(
            `Create Hexo draft file queue ${index + 1}`,
            this.context,
          );
        } else {
          logger.info(`Create single Hexo draft file`, this.context);
        }
        let _post = post;
        if (_post.META_SPACE_INTERNAL_NEW_TITLE) {
          await this.hexo.remove(_post, 'draft');
          const _nPost = await this.getPostInfoWithNewTitle(_post);
          _post = _nPost;
        }
        await this.createHexoPostFile(_post, 'draft', update);
      },
    );
  }

  async publishHexoDraftFiles(update = false): Promise<void> {
    if (!isPostTask(this.taskConfig))
      throw new Error('Task config is not for publish draft');
    const { post } = this.taskConfig;
    await this.processHexoPostFile(
      post,
      async (post: MetaWorker.Info.Post, index?: number) => {
        if (index) {
          logger.info(
            `Publish Hexo draft file queue ${index + 1}`,
            this.context,
          );
        } else {
          logger.info(`Publish single Hexo draft file`, this.context);
        }
        await this.publishHexoDraftFile(post, update);
      },
    );
  }

  async moveHexoPostFilesToDraft(): Promise<void> {
    if (!isPostTask(this.taskConfig))
      throw new Error('Task config is not for move post');
    const { post } = this.taskConfig;
    await this.processHexoPostFile(
      post,
      async (post: MetaWorker.Info.Post, index?: number) => {
        if (index) {
          logger.info(
            `Move Hexo post file to draft queue ${index + 1}`,
            this.context,
          );
        } else {
          logger.info(`Move single Hexo post file to draft`, this.context);
        }
        await this.hexo.conceal(post);
      },
    );
  }

  async deleteHexoPostFiles(): Promise<void> {
    if (!isPostTask(this.taskConfig))
      throw new Error('Task config is not for delete post');
    const { post } = this.taskConfig;
    await this.processHexoPostFile(
      post,
      async (post: MetaWorker.Info.Post, index?: number) => {
        if (index) {
          logger.info(`Delete Hexo post file queue ${index + 1}`, this.context);
        } else {
          logger.info(`Delete single Hexo post file`, this.context);
        }
        await this.hexo.remove(post, 'post');
      },
    );
  }
}
