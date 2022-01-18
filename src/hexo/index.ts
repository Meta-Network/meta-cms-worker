import { isDeployTask, isPostTask, isPublishTask } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';
import assert from 'assert';
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
  DEFAULT_META_SPACE_CONFIG_FILE_NAME,
  TEMPLATE_PATH,
  WORKSPACE_PATH,
} from '../constants';
import { logger } from '../logger';
import { LogContext, MixedTaskConfig, SymlinkObject } from '../types';
import { HexoConfig, HexoFrontMatter } from '../types/hexo';
import {
  createSymlink,
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
  assert(
    !isEmptyObj(taskConfig),
    new TypeError('parameter "taskConfig" is required!'),
  );
  return await HexoService.createHexoService(taskConfig, args);
}

class HexoService implements IHexoService {
  private constructor(private readonly taskConfig: MixedTaskConfig) {
    this.context = { context: HexoService.name };
    const {
      git: { storage },
    } = this.taskConfig;
    const workDir = path.join(WORKSPACE_PATH, storage.reponame);
    this.workspaceDirectory = workDir;
    this.workspaceHexoConfigPath = path.join(
      this.workspaceDirectory,
      DEFAULT_HEXO_CONFIG_FILE_NAME,
    );
    this.workspaceMetaSpaceConfigPath = path.join(
      this.workspaceDirectory,
      DEFAULT_META_SPACE_CONFIG_FILE_NAME,
    );
    this.templateDirectory = TEMPLATE_PATH;
    this.templateHexoConfigPath = path.join(
      this.templateDirectory,
      DEFAULT_HEXO_CONFIG_FILE_NAME,
    );
    logger.verbose(
      `User workspace directory is ${this.workspaceDirectory}`,
      this.context,
    );
    logger.verbose(
      `User workspace Hexo config is ${this.workspaceHexoConfigPath}`,
      this.context,
    );
    logger.verbose(
      `User workspace Meta Space config is ${this.workspaceMetaSpaceConfigPath}`,
      this.context,
    );
    logger.verbose(
      `Hexo template directory is ${this.templateDirectory}`,
      this.context,
    );
    logger.verbose(
      `Hexo template Hexo config is ${this.templateHexoConfigPath}`,
      this.context,
    );
  }

  private readonly context: LogContext;
  private readonly workspaceDirectory: string;
  private readonly workspaceHexoConfigPath: string;
  private readonly workspaceMetaSpaceConfigPath: string;
  private readonly templateDirectory: string;
  private readonly templateHexoConfigPath: string;
  private hexo: IHexoCommandHelper;

  // #region Hexo config
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

  private async getHexoConfigFromTemplate(): Promise<HexoConfig> {
    logger.info(`Get Hexo config from template`, this.context);
    const confPath = this.templateHexoConfigPath;
    const isExists = await exists(confPath);

    if (!isExists) {
      logger.warn(
        `Can not find template Hexo config in ${confPath}, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }

    try {
      return await yamlFileToObject<HexoConfig>(confPath);
    } catch (error) {
      logger.warn(
        `Can not read or parse template Hexo config in ${confPath}, will ignore it`,
        error,
        this.context,
      );
      return {} as HexoConfig;
    }
  }

  private async getHexoConfigFromTaskConfig(): Promise<HexoConfig> {
    logger.info(`Get Hexo config from task config`, this.context);

    if (isDeployTask(this.taskConfig)) {
      const { site, user } = this.taskConfig;
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
      };
      return userConf as HexoConfig;
    }

    logger.warn(`Task config is not for deploy, will ignore it`, this.context);
    return {} as HexoConfig;
  }

  private async getHexoConfigFromWorkspace(): Promise<HexoConfig> {
    logger.info(`Get Hexo config from workspace`, this.context);
    const confPath = this.workspaceHexoConfigPath;
    const isExists = await exists(confPath);

    if (!isExists) {
      logger.warn(
        `Can not find workspace Hexo config in ${confPath}, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }

    try {
      return await yamlFileToObject<HexoConfig>(confPath);
    } catch (error) {
      logger.warn(
        `Can not read or parse workspace Hexo config in ${confPath}, will ignore it`,
        error,
        this.context,
      );
      return {} as HexoConfig;
    }
  }

  private async updateWorkspaceHexoConfigFile(): Promise<void> {
    logger.info(`Update workspace Hexo config file`, this.context);
    const hexoConf = HexoInternalConfig as HexoConfig;
    // Get default Hexo config
    const deftConf = await this.getDefaultHexoConfig();
    // Get Hexo config from template
    const tempConf = await this.getHexoConfigFromTemplate();
    // Get Hexo config from taskConfig
    const userConf = await this.getHexoConfigFromTaskConfig();
    // Get Hexo config from workspace
    const workConf = await this.getHexoConfigFromWorkspace();
    // Build final config
    const finalConf = {
      ...deftConf,
      ...hexoConf,
      ...tempConf,
      ...workConf,
      ...userConf,
    };
    // Current not support Hexo multi config path
    const confPath = this.workspaceHexoConfigPath;

    try {
      logger.info(`Write workspace Hexo config file ${confPath}`, this.context);
      await objectToYamlFile(finalConf, confPath);
    } catch (error) {
      logger.error(
        `Can not update workspace Hexo config file ${confPath}`,
        error,
        this.context,
      );
      throw error;
    }
  }
  // #endregion Hexo config

  // #region Theme config
  private async getThemeConfigFromTemplate(): Promise<HexoConfig> {
    logger.info(`Get theme config from template`, this.context);
    const tempConf = await this.getHexoConfigFromTemplate();
    const confPath = path.join(
      this.templateDirectory,
      `_config.${tempConf?.theme}.yml`,
    );
    const isExists = await exists(confPath);

    if (!isExists) {
      logger.warn(
        `Can not find template theme config in ${confPath}, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }

    try {
      return await yamlFileToObject<HexoConfig>(confPath);
    } catch (error) {
      logger.warn(
        `Can not read or parse template theme config in ${confPath}, will ignore it`,
        error,
        this.context,
      );
      return {} as HexoConfig;
    }
  }

  private async getThemeConfigFromWorkspace(): Promise<HexoConfig> {
    logger.info(`Get theme config from workspace`, this.context);
    const workConf = await this.getHexoConfigFromWorkspace();
    const confPath = path.join(
      this.workspaceDirectory,
      `_config.${workConf?.theme}.yml`,
    );
    const isExists = await exists(confPath);

    if (!isExists) {
      logger.warn(
        `Can not find workspace theme config in ${confPath}, will ignore it`,
        this.context,
      );
      return {} as HexoConfig;
    }

    try {
      return await yamlFileToObject<HexoConfig>(confPath);
    } catch (error) {
      logger.warn(
        `Can not read or parse workspace theme config in ${confPath}, will ignore it`,
        error,
        this.context,
      );
      return {} as HexoConfig;
    }
  }

  private async updateWorkspaceThemeConfigFile(): Promise<void> {
    logger.info(`Update workspace theme config file`, this.context);
    // Get theme config from template
    const tempConf = await this.getThemeConfigFromTemplate();
    // Get theme config from workspace
    const workConf = await this.getThemeConfigFromWorkspace();
    // Build final config
    const finalConf = { ...tempConf, ...workConf };
    // Get Hexo config from workspace and build theme config path
    const hexoConf = await this.getHexoConfigFromWorkspace();
    const confPath = path.join(
      this.workspaceDirectory,
      `_config.${hexoConf?.theme}.yml`,
    );

    try {
      logger.info(
        `Write workspace theme config file ${confPath}`,
        this.context,
      );
      await objectToYamlFile(finalConf, confPath);
    } catch (error) {
      logger.error(
        `Can not update workspace theme config file ${confPath}`,
        error,
        this.context,
      );
      throw error;
    }
  }
  // #endregion Theme config

  // #region Meta Space config
  private async getMetaSpaceConfigFromWorkspace(): Promise<MetaWorker.Configs.MetaSpaceConfig> {
    logger.info(`Get Meta Space config from workspace`, this.context);
    const confPath = this.workspaceMetaSpaceConfigPath;
    const isExists = await exists(confPath);

    if (!isExists) {
      logger.warn(
        `Can not find workspace Meta Space config in ${confPath}, will ignore it`,
        this.context,
      );
      return {} as MetaWorker.Configs.MetaSpaceConfig;
    }

    try {
      return await yamlFileToObject<MetaWorker.Configs.MetaSpaceConfig>(
        confPath,
      );
    } catch (error) {
      logger.warn(
        `Can not read or parse workspace Meta Space config in ${confPath}, will ignore it`,
        error,
        this.context,
      );
      return {} as MetaWorker.Configs.MetaSpaceConfig;
    }
  }

  private async updateWorkspaceMetaSpaceConfigFile(): Promise<void> {
    logger.info(`Update workspace Meta Space config file`, this.context);
    // Get Meta Space config from workspace
    const workConf = await this.getMetaSpaceConfigFromWorkspace();
    const confPath = this.workspaceMetaSpaceConfigPath;
    let metaSpaceConfig = {} as MetaWorker.Configs.MetaSpaceConfig;

    if (isDeployTask(this.taskConfig)) {
      const { user, site, theme, gateway, metadata } = this.taskConfig;
      metaSpaceConfig = {
        ...workConf,
        user,
        site,
        theme,
        gateway,
        metadata,
      };
    }

    if (isPublishTask(this.taskConfig)) {
      const { metadata } = this.taskConfig;
      metaSpaceConfig = {
        ...workConf,
        metadata,
      };
    }

    try {
      logger.info(
        `Write workspace Meta Space config file ${confPath}`,
        this.context,
      );
      await objectToYamlFile(metaSpaceConfig, confPath);
    } catch (error) {
      logger.error(
        `Can not update workspace Meta Space config file ${confPath}`,
        error,
        this.context,
      );
      throw error;
    }
  }
  // #endregion Meta Space config

  private async symlinkWorkspaceConfigFiles(): Promise<void> {
    logger.info(`Create workspace config file symlinks`, this.context);
    const workConf = await this.getHexoConfigFromWorkspace();
    const workspaceThemeConfigPath = path.join(
      this.workspaceDirectory,
      `_config.${workConf?.theme}.yml`,
    );
    const templateThemeConfigPath = path.join(
      this.templateDirectory,
      `_config.${workConf?.theme}.yml`,
    );
    const templateMetaSpaceConfigPath = path.join(
      this.templateDirectory,
      DEFAULT_META_SPACE_CONFIG_FILE_NAME,
    );
    const symlinks: SymlinkObject[] = [
      {
        source: this.workspaceHexoConfigPath,
        destination: this.templateHexoConfigPath,
      },
      {
        source: workspaceThemeConfigPath,
        destination: templateThemeConfigPath,
      },
      {
        source: this.workspaceMetaSpaceConfigPath,
        destination: templateMetaSpaceConfigPath,
      },
    ];
    const process = symlinks.map(async (symlink) => {
      logger.verbose(
        `Create symlink ${symlink.source} to ${symlink.destination}`,
        this.context,
      );
      await createSymlink(symlink.source, symlink.destination);
    });
    try {
      await Promise.all(process);
    } catch (error) {
      logger.error(
        `Create workspace config file symlinks failed`,
        error,
        this.context,
      );
      throw error;
    }
  }

  private async symlinkWorkspaceSourceDirectory(): Promise<void> {
    logger.info(`Create workspace source directory symlink`, this.context);
    const workspaceSourcePath = path.join(this.workspaceDirectory, 'source');
    const templateSourcePath = path.join(this.templateDirectory, 'source');
    try {
      logger.verbose(
        `Create symlink ${workspaceSourcePath} to ${templateSourcePath}`,
        this.context,
      );
      await createSymlink(workspaceSourcePath, templateSourcePath);
    } catch (error) {
      logger.error(
        `Create workspace source directory symlink failed`,
        error,
        this.context,
      );
      throw error;
    }
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
    // Update _config.yml before Hexo init
    await this.updateWorkspaceHexoConfigFile();
    // Update _config.theme.yml before Hexo init
    await this.updateWorkspaceThemeConfigFile();
    // Update meta-space-config.yml before Hexo init
    await this.updateWorkspaceMetaSpaceConfigFile();
    // Create _config.yml _config.theme.yml and meta-space-config.yml symlink before Hexo init
    await this.symlinkWorkspaceConfigFiles();
    // Create source directory symlink before Hexo init
    await this.symlinkWorkspaceSourceDirectory();
    // Initialize Hexo
    const hexo = await createCommandHelper(args);
    this.hexo = hexo;
    logger.info(`Hexo service has been initialized`, this.context);
  }

  public static async createHexoService(
    taskConfig: MixedTaskConfig,
    args?: Hexo.InstanceOptions,
  ): Promise<HexoService> {
    assert(
      !isEmptyObj(taskConfig),
      new TypeError('parameter "taskConfig" is required!'),
    );
    const service = new HexoService(taskConfig);
    await service.initialize(args);
    return service;
  }

  async updateHexoConfigFiles(): Promise<void> {
    assert(
      isDeployTask(this.taskConfig),
      new Error('Task config is not for deploy.'),
    );
    await this.updateWorkspaceHexoConfigFile();
    await this.updateWorkspaceThemeConfigFile();
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
