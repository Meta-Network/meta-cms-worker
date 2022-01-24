import { MetaInternalResult, ServiceCode } from '@metaio/microservice-model';
import {
  BackendTaskService,
  isDeployTask,
  isPostTask,
  isPublishTask,
} from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';
import assert from 'assert';
import fs from 'fs/promises';
import { copy } from 'fs-extra';
import Hexo from 'hexo';
import HexoInternalConfig from 'hexo/lib/hexo/default_config';
import path from 'path';

import { getBackendService } from '../api';
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
import { HexoConfig, HexoPostInfo } from '../types/hexo';
import {
  createSymlink,
  exists,
  formatUrl,
  isEmptyObj,
  makeArray,
  objectToYamlFile,
  omitObj,
  yamlFileToObject,
} from '../utils';
import { createCommandHelper, IHexoCommandHelper } from './helpers';

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

type PostTaskResult = MetaWorker.Info.Post & PromiseSettledResult<void>;

class HexoService {
  private constructor(private readonly taskConfig: MixedTaskConfig) {
    this.context = { context: HexoService.name };
    this.backend = getBackendService();
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
  private readonly backend: BackendTaskService;
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

    if (isDeployTask(this.taskConfig) || isPublishTask(this.taskConfig)) {
      let userConf: Partial<HexoConfig> = {};
      const { site } = this.taskConfig;
      userConf = {
        ...userConf,
        title: site.title,
        subtitle: site.subtitle,
        description: site.description,
        author: site.author,
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
      if (isDeployTask(this.taskConfig)) {
        const { user } = this.taskConfig;
        userConf = {
          ...userConf,
          author: userConf.author || user.nickname || user.username,
        };
      }
      return userConf as HexoConfig;
    }

    logger.warn(
      `Task config is not for deploy or publish, will ignore it`,
      this.context,
    );
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

  private async getMetaSpaceConfigFromTaskConfig(): Promise<MetaWorker.Configs.MetaSpaceConfig> {
    logger.info(`Get Meta Space config from task config`, this.context);

    if (isDeployTask(this.taskConfig)) {
      const { user, site, theme, gateway, metadata } = this.taskConfig;
      const taskConf: MetaWorker.Configs.MetaSpaceConfig = {
        user,
        site,
        theme,
        gateway,
        metadata,
      };
      return taskConf;
    }

    if (isPublishTask(this.taskConfig)) {
      const { metadata } = this.taskConfig;
      const taskConf: Partial<MetaWorker.Configs.MetaSpaceConfig> = {
        metadata,
      };
      return taskConf as MetaWorker.Configs.MetaSpaceConfig;
    }

    logger.warn(
      `Task config is not for deploy or publish, will ignore it`,
      this.context,
    );
    return {} as MetaWorker.Configs.MetaSpaceConfig;
  }

  private async updateWorkspaceMetaSpaceConfigFile(): Promise<void> {
    logger.info(`Update workspace Meta Space config file`, this.context);
    // Get Meta Space config from workspace
    const workConf = await this.getMetaSpaceConfigFromWorkspace();
    // Get Meta Space config from task config
    const taskConf = await this.getMetaSpaceConfigFromTaskConfig();
    const confPath = this.workspaceMetaSpaceConfigPath;
    const metaSpaceConfig: MetaWorker.Configs.MetaSpaceConfig = {
      ...workConf,
      ...taskConf,
    };

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

  // #region File and folder operations
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

  private async createDotNoJekyllFile(
    workDir: string,
    disableNoJekyll?: boolean,
  ): Promise<void> {
    if (disableNoJekyll) return;
    const filePath = path.join(workDir, '.nojekyll');
    const isExists = await exists(filePath);
    if (isExists) {
      logger.verbose(`.nojekyll file already exists.`, this.context);
      return;
    }
    logger.info(`Create .nojekyll file ${filePath}`, this.context);
    await fs.writeFile(filePath, '\n');
  }

  private async createCNameFile(
    workDir: string,
    content: string,
  ): Promise<void> {
    if (!content) return;
    await fs.mkdir(workDir, { recursive: true });
    const filePath = path.join(workDir, 'CNAME');
    const isExists = await exists(filePath);
    if (isExists) {
      logger.verbose(`CNAME file already exists.`, this.context);
      return;
    }
    logger.info(`Create CNAME file ${filePath}`, this.context);
    await fs.writeFile(filePath, `${content}\n`);
  }

  private async copySourceDirectoryToWorkspace(): Promise<void> {
    logger.info(`Copy source directory to workspace`, this.context);
    const workspaceSourcePath = path.join(this.workspaceDirectory, 'source');
    const templateSourcePath = path.join(this.templateDirectory, 'source');
    try {
      logger.verbose(
        `Cpoy directory ${templateSourcePath} to ${workspaceSourcePath}`,
        this.context,
      );
      await copy(templateSourcePath, workspaceSourcePath, {
        recursive: true,
        overwrite: true,
      });
    } catch (error) {
      logger.error(
        `Copy source directory to workspace failed`,
        error,
        this.context,
      );
      throw error;
    }
  }
  // #endregion File and folder operations

  // #region Post info operations
  private async processMetaSpaceInternalProperties(
    post: MetaWorker.Info.Post,
  ): Promise<MetaWorker.Info.Post> {
    const hasProp = Object.keys(post).find((key) =>
      key.startsWith('META_SPACE_INTERNAL'),
    );
    if (!hasProp) return post;
    logger.verbose(`Process Meta Space internal properties`, this.context);
    const _post: MetaWorker.Info.Post = {
      ...post,
      title: String(post.META_SPACE_INTERNAL_NEW_TITLE),
    };
    // Remove all meta space internal props
    const propArr = Object.keys(_post).filter((key) =>
      key.startsWith('META_SPACE_INTERNAL'),
    );
    return omitObj(_post, propArr);
  }

  private async convertMetaPostInfoToHexoPostInfo(
    post: MetaWorker.Info.Post,
    layout: 'post' | 'draft',
  ): Promise<HexoPostInfo> {
    logger.verbose(`Convert Meta post info to Hexo post info`, this.context);
    const nowISO = new Date(Date.now()).toISOString();
    const postData: HexoPostInfo = {
      ...post,
      layout,
      slug: post.title,
      title: post.title,
      content: post.source,
      date: post.createdAt || post.updatedAt || nowISO,
      updated: post.updatedAt || nowISO,
      tags: post.tags || [],
      categories: post.categories || [],
      excerpt: post.summary || '',
    };
    return postData;
  }
  // #endregion Post info operations

  // #region Task operations
  private async createHexoPostFile(
    post: MetaWorker.Info.Post,
    layout: 'post' | 'draft',
    replace = false,
  ): Promise<void> {
    logger.info(`Create Hexo post file`, this.context);
    const data = await this.convertMetaPostInfoToHexoPostInfo(post, layout);
    await this.hexo.create(data, layout, replace);
  }

  private async publishHexoDraftFile(
    post: MetaWorker.Info.Post,
    replace = false,
  ): Promise<void> {
    logger.info(`Publish Hexo draft file`, this.context);
    const data = await this.convertMetaPostInfoToHexoPostInfo(post, 'post');
    await this.hexo.publish(data, replace);
  }

  private async concealHexoPostFile(post: MetaWorker.Info.Post): Promise<void> {
    logger.info(`Move Hexo post file to draft`, this.context);
    const data = await this.convertMetaPostInfoToHexoPostInfo(post, 'post');
    await this.hexo.conceal(data);
  }

  private async removeHexoPostFile(
    post: MetaWorker.Info.Post,
    layout: 'post' | 'draft',
  ): Promise<void> {
    logger.info(`Remove Hexo post file`, this.context);
    const data = await this.convertMetaPostInfoToHexoPostInfo(post, layout);
    await this.hexo.remove(data, layout);
  }

  private async processHexoPostFile(
    post: MetaWorker.Info.Post[],
    processer: (post: MetaWorker.Info.Post) => Promise<void>,
  ): Promise<PostTaskResult[]> {
    const promise = post.map(async (_post) => {
      await processer(_post);
    });
    const result = await Promise.allSettled(promise);
    const data = post.map((_post, index) => {
      const res = result[index];
      if (res.status === 'fulfilled') {
        logger.info(
          `Process hexo post ${_post.title} ${res.status}`,
          this.context,
        );
      }
      if (res.status === 'rejected') {
        logger.error(
          `Process hexo post ${_post.title} ${res.status} cause ${res.reason}`,
          this.context,
        );
      }
      return Object.assign({}, _post, res);
    });
    return data;
  }

  private async processPostTaskResults(
    results: PostTaskResult[],
  ): Promise<void> {
    const rejected = results.filter((res) => res.status === 'rejected');
    if (!(Array.isArray(rejected) && rejected.length)) return;
    const metaInternals = rejected.map(
      (rej) =>
        new MetaInternalResult<PostTaskResult>({
          statusCode: 500,
          serviceCode: ServiceCode.CMS,
          retryable: false,
          data: rej,
          message: rej.reason,
        }),
    );
    for (const data of metaInternals) {
      logger.verbose(`Report worker post task errored`, this.context);
      await this.backend.reportWorkerTaskErroredToBackend(data);
    }
  }
  // #endregion Task operations

  private async initialize(args?: Hexo.InstanceOptions): Promise<void> {
    // Update _config.yml before Hexo init
    await this.updateWorkspaceHexoConfigFile();
    // Update _config.theme.yml before Hexo init
    await this.updateWorkspaceThemeConfigFile();
    // Update meta-space-config.yml before Hexo init
    await this.updateWorkspaceMetaSpaceConfigFile();
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

  public async generateHexoStaticFiles(): Promise<void> {
    assert(
      isPublishTask(this.taskConfig),
      new Error('Task config is not for publish site'),
    );
    this.hexo.generate();
  }

  public async createHexoPostFiles(update = false): Promise<void> {
    assert(
      isPostTask(this.taskConfig),
      new Error('Task config is not for create post'),
    );
    const { post } = this.taskConfig;
    const postArr = makeArray(post);
    const results = await this.processHexoPostFile(
      postArr,
      async (post: MetaWorker.Info.Post) => {
        // Change title post
        if (post.META_SPACE_INTERNAL_NEW_TITLE) {
          // Remove older post
          await this.removeHexoPostFile(post, 'post');
        }
        const processed = await this.processMetaSpaceInternalProperties(post);
        await this.createHexoPostFile(processed, 'post', update);
      },
    );
    await this.processPostTaskResults(results);
  }

  public async createHexoDraftFiles(update = false): Promise<void> {
    assert(
      isPostTask(this.taskConfig),
      new Error('Task config is not for create draft'),
    );
    const { post } = this.taskConfig;
    const postArr = makeArray(post);
    const results = await this.processHexoPostFile(
      postArr,
      async (post: MetaWorker.Info.Post) => {
        // Change title post
        if (post.META_SPACE_INTERNAL_NEW_TITLE) {
          // Remove older post
          await this.removeHexoPostFile(post, 'post');
        }
        const processed = await this.processMetaSpaceInternalProperties(post);
        await this.createHexoPostFile(processed, 'draft', update);
      },
    );
    await this.processPostTaskResults(results);
  }

  public async publishHexoDraftFiles(update = false): Promise<void> {
    assert(
      isPostTask(this.taskConfig),
      new Error('Task config is not for publish draft'),
    );
    const { post } = this.taskConfig;
    const postArr = makeArray(post);
    const results = await this.processHexoPostFile(
      postArr,
      async (post: MetaWorker.Info.Post) => {
        await this.publishHexoDraftFile(post, update);
      },
    );
    await this.processPostTaskResults(results);
  }

  public async moveHexoPostFilesToDraft(): Promise<void> {
    assert(
      isPostTask(this.taskConfig),
      new Error('Task config is not for move post'),
    );
    const { post } = this.taskConfig;
    const postArr = makeArray(post);
    const results = await this.processHexoPostFile(
      postArr,
      async (post: MetaWorker.Info.Post) => {
        await this.concealHexoPostFile(post);
      },
    );
    await this.processPostTaskResults(results);
  }

  public async deleteHexoPostFiles(): Promise<void> {
    assert(
      isPostTask(this.taskConfig),
      new Error('Task config is not for delete post'),
    );
    const { post } = this.taskConfig;
    const postArr = makeArray(post);
    const results = await this.processHexoPostFile(
      postArr,
      async (post: MetaWorker.Info.Post) => {
        await this.removeHexoPostFile(post, 'post');
      },
    );
    await this.processPostTaskResults(results);
  }

  public async symlinkWorkspaceDirectoryAndFiles(): Promise<void> {
    // Create _config.yml _config.theme.yml and meta-space-config.yml symlink before Hexo init
    await this.symlinkWorkspaceConfigFiles();
    // Create source directory symlink before Hexo init
    await this.symlinkWorkspaceSourceDirectory();
  }

  public async createDotNoJekyllAndCNameFile(): Promise<void> {
    assert(
      isPublishTask(this.taskConfig),
      new Error('Task config is not for publish site'),
    );
    const { publish, site } = this.taskConfig;
    const workDir = path.join(
      this.templateDirectory,
      publish?.publishDir || 'public',
    );
    await this.createDotNoJekyllFile(workDir);
    await this.createCNameFile(workDir, site.domain);
  }

  public async createWorkspaceSourceDirectory(): Promise<void> {
    assert(
      isDeployTask(this.taskConfig),
      new Error('Task config is not for deploy site'),
    );
    await this.copySourceDirectoryToWorkspace();
  }
}
