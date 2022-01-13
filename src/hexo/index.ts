/* eslint-disable @typescript-eslint/ban-ts-comment */
import { isDeployTask, isPostTask } from '@metaio/worker-common';
import { MetaWorker } from '@metaio/worker-model';
import childProcess from 'child_process';
import fs from 'fs/promises';
import Hexo from 'hexo';
import HexoInternalConfig from 'hexo/lib/hexo/default_config';
import { exists, existsSync } from 'hexo-fs';
import { slugize } from 'hexo-util';
import os from 'os';
import path from 'path';
import process from 'process';
import { sync } from 'resolve';
import yaml from 'yaml';

import { config } from '../configs';
import { logger } from '../logger';
import { LogContext, MixedTaskConfig } from '../types';
import { HexoConfig, HexoFrontMatter, HexoPostCreate } from '../types/hexo';
import { formatUrl, isEmptyObj, omitObj } from '../utils';

export class HexoService {
  constructor(private readonly taskConfig: MixedTaskConfig) {
    this.context = { context: HexoService.name };
    const {
      task,
      git: { storage },
    } = this.taskConfig;
    const baseDir = path.join(
      os.tmpdir(),
      task.taskWorkspace,
      storage.reponame,
    );
    logger.verbose(`Hexo work dir is: ${baseDir}`, this.context);
    const isExists = existsSync(baseDir);
    if (!isExists) throw Error(`Hexo work dir does not exists`);
    this.baseDir = baseDir;
  }

  private readonly context: LogContext;
  private readonly baseDir: string;
  private inst: Hexo;

  private async execChildProcess(cmd: string): Promise<boolean> {
    const promise = new Promise<boolean>((res, rej) => {
      const process = childProcess.exec(cmd, { cwd: this.baseDir });
      let stdout = '';
      let stderr = '';
      process.stdout.setEncoding('utf-8');
      process.stderr.setEncoding('utf-8');
      process.stdout.on('data', (data) => {
        stdout += data;
      });
      process.stderr.on('data', (data) => {
        stderr += data;
      });
      process.on('exit', (code, sig) => {
        if (stdout) {
          logger.verbose(`execChildProcess stdout\n${stdout}`, this.context);
        }
        if (stderr) {
          logger.error(`execChildProcess stderr\n${stderr}`, this.context);
        }
        if (code === 0) {
          logger.info(
            `Child process exec '${cmd}' with exit code ${code} and signal ${sig}`,
            this.context,
          );
          res(true);
        }
        rej(`Child process exec '${cmd}' failed with exit code ${code}`);
      });
      process.on('error', (err) => rej(err));
    });
    return await promise;
  }

  private guessPackageManager(findPath: string): 'npm' | 'yarn' {
    const yarnLock = path.join(findPath, 'yarn.lock');
    const isYarn = existsSync(yarnLock);
    if (isYarn) {
      logger.verbose(
        `Find yarn lockfile, use Yarn package manager`,
        this.context,
      );
      return 'yarn';
    }
    logger.verbose(`Use NPM package manager`, this.context);
    return 'npm';
  }

  private async installNodeModules(): Promise<void> {
    logger.info(`Installing node modules for ${this.baseDir}`, this.context);
    const _pm = this.guessPackageManager(this.baseDir);
    let process = false;
    if (_pm === 'yarn') {
      process = await this.execChildProcess(
        'yarn install --production=false --frozen-lockfile',
      );
    }
    if (_pm === 'npm') {
      process = await this.execChildProcess('npm ci');
    }
    if (process) logger.info(`Successfully install node modules`, this.context);
  }

  private async loadLocalHexoModule(
    path: string,
    args?: Hexo.InstanceOptions,
  ): Promise<Hexo> {
    const arg: Hexo.InstanceOptions = { ...args, debug: !!process.env.DEBUG };
    logger.verbose(
      `Try load Hexo module from: ${path}, args: ${JSON.stringify(arg)}`,
      this.context,
    );

    try {
      const modulePath = sync('hexo', { basedir: path });
      const localHexo = await require(modulePath);
      logger.info(`Use local Hexo module`, this.context);
      return new localHexo(path, arg) as Hexo;
    } catch (error) {
      logger.error(`Local hexo loading failed in ${path}`, error, this.context);
      logger.info(`Use worker Hexo module`, this.context);
      return new Hexo(path, arg);
    }
  }

  private async updateHexoConfigFile(
    taskConfig: MetaWorker.Configs.DeployTaskConfig,
  ): Promise<void> {
    // Get worker Hexo config
    const defConf = config.get<HexoConfig>('hexo', {} as HexoConfig);
    if (isEmptyObj(defConf))
      logger.warn(
        `Can not find the default Hexo config, will ignore it`,
        this.context,
      );

    // Create user Hexo config from taskConfig
    const { site, user, theme } = taskConfig;
    const userConf: Partial<HexoConfig> = {
      title: site.title,
      subtitle: site.subtitle || '',
      description: site.description || '',
      author: site.author || user.nickname || user.username || '',
      avatar:
        site.avatar ||
        'https://ipfs.fleek.co/ipfs/bafybeiccss3figrixd5qhhv6i6zhbz5chmyls6ja5kscu6drg7fnjcnxgm',
      keywords: site.keywords || [],
      // No favicon on _config.yml(taskConfig.favicon)
      language: site.language || 'en',
      timezone: site.timezone || 'Asia/Shanghai',
      /**
       * On our platform, it always has a domain,
       * but Hexo not allow empty url,
       * if someting happen, use default
       */
      url: formatUrl(site.domain) || 'https://example.com',
      theme: theme.themeName.toLowerCase(),
    };

    const confName = '_config.yml';
    const confPath = path.join(this.baseDir, confName); // Current not support Hexo multi config path
    const isExists = await exists(confPath);
    // If no _config.yml, create it
    if (!isExists) {
      logger.warn(
        `Can not find the Hexo config in ${this.baseDir}, will create it`,
        this.context,
      );
      try {
        const conf: HexoConfig = {
          ...HexoInternalConfig,
          ...defConf,
          ...userConf,
        };
        const yamlStr = yaml.stringify(conf);
        const data = new Uint8Array(Buffer.from(yamlStr));
        await fs.writeFile(confPath, data, { encoding: 'utf8' });
        logger.info(`Write ${confPath} successfully`, this.context);
        return;
      } catch (error) {
        logger.error(
          `Can not write Hexo config file, path: ${confPath}`,
          error,
          this.context,
        );
        throw error;
      }
    }
    // If has _config.yml, merge it
    if (isExists) {
      logger.verbose(
        `Found the Hexo config in ${this.baseDir}, will update it`,
        this.context,
      );
      try {
        const confRawData = await fs.readFile(confPath, 'utf8');
        const confRaw: HexoConfig = yaml.parse(confRawData);
        const confNew = { ...defConf, ...confRaw, ...userConf };
        const yamlStr = yaml.stringify(confNew);
        const data = new Uint8Array(Buffer.from(yamlStr));
        await fs.writeFile(confPath, data, { encoding: 'utf8' });
        logger.info(`Update ${confPath} successfully`, this.context);
        return;
      } catch (error) {
        logger.error(
          `Can not update Hexo config file, path: ${confPath}`,
          error,
          this.context,
        );
        return;
      }
    }
  }

  private async updateHexoThemeConfigFile(
    taskConfig: MetaWorker.Configs.DeployTaskConfig,
  ): Promise<void> {
    // TODO: update Hexo theme config file
  }

  private async createHexoPostFile(
    post: MetaWorker.Info.Post,
    replace = false,
    layout: 'post' | 'draft',
  ): Promise<void> {
    if (replace) logger.info(`Hexo create replace mode on`, this.context);
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
    // @ts-ignore
    if (postData.source) delete postData.source;
    // @ts-ignore
    if (postData.summary) delete postData.summary;
    logger.info(`Create ${layout} file, title: ${post.title}`, this.context);
    const _create = (await this.inst.post.create(postData, replace)) as unknown;
    logger.verbose(
      `Create ${layout} file: ${JSON.stringify(_create)}`,
      this.context,
    );
    const { path } = _create as HexoPostCreate;
    await fs.appendFile(path, `\n${post.source}\n`);
    logger.info(`Successfully write source content to ${path}`, this.context);
  }

  private async publishHexoDraftFile(
    post: MetaWorker.Info.Post,
    replace = false,
  ): Promise<void> {
    if (replace) logger.info(`Hexo publish replace mode on`, this.context);
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
    logger.info(`Publish draft file, title: ${post.title}`, this.context);
    const _publish = (await this.inst.post.publish(
      postData,
      replace,
    )) as unknown;
    logger.verbose(
      `Publish draft file: ${JSON.stringify(_publish)}`,
      this.context,
    );
    const { path } = _publish as HexoPostCreate;
    logger.info(`Successfully publish draft file ${path}`, this.context);
  }

  private async getHexoPostFilePath(
    post: MetaWorker.Info.Post,
    layout: 'post' | 'draft',
  ): Promise<string> {
    if (typeof this.inst['execFilter'] === 'function') {
      const postData: Hexo.Post.Data & HexoFrontMatter = {
        layout,
        slug: slugize(post.title, {
          transform: this.inst.config.filename_case as 1 | 2,
        }),
      };

      // @ts-ignore
      const path = await this.inst.execFilter('new_post_path', postData, {
        args: [true], // use replase mode
        context: { ...this.inst }, // a Hexo instance copy
      });

      return path;
    }
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

  private async removeHexoPostFile(
    post: MetaWorker.Info.Post,
    layout: 'post' | 'draft',
  ): Promise<void> {
    const path = await this.getHexoPostFilePath(post, layout);
    if (path) {
      logger.info(
        `Remove ${layout} file, title: ${post.title}, path: ${path}`,
        this.context,
      );
      await fs.rm(path, { force: true });
    } else {
      logger.warn(
        `Can not remove ${layout} file, title ${post.title} does not exists`,
        this.context,
      );
    }
  }

  private async movePostFileToDraft(post: MetaWorker.Info.Post): Promise<void> {
    const draftsPath = path.join(this.inst.source_dir, '_drafts');
    const postsPath = path.join(this.inst.source_dir, '_posts');
    const filePath = await this.getHexoPostFilePath(post, 'post');
    const movePath = filePath.replace(postsPath, draftsPath);
    if (path && movePath) {
      logger.info(
        `Move title ${post.title} from path ${filePath} to ${movePath}`,
        this.context,
      );
      await fs.rename(filePath, movePath);
    } else {
      logger.warn(
        `Can not move title ${post.title}, file ${filePath} does not exists`,
        this.context,
      );
    }
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
      await this.inst.exit(error);
      throw error;
    }
  }

  async init(args?: Hexo.InstanceOptions): Promise<void> {
    if (isDeployTask(this.taskConfig)) {
      // Update _config.yml before Hexo init
      await this.updateHexoConfigFile(this.taskConfig);
    }

    await this.installNodeModules();
    const _hexo = await this.loadLocalHexoModule(this.baseDir, args);

    await _hexo.init();
    logger.info(`Hexo version: ${_hexo.env.version}`, this.context);
    logger.verbose(`Hexo base directory: ${_hexo.base_dir}`, this.context);
    logger.verbose(`Hexo public directory: ${_hexo.public_dir}`, this.context);
    logger.verbose(`Hexo source directory: ${_hexo.source_dir}`, this.context);
    logger.verbose(`Hexo config file path: ${_hexo.config_path}`, this.context);
    logger.info(`Hexo has been initialized`, this.context);

    _hexo.on('ready', () => {
      logger.verbose('Hexo initialization finished', this.context);
    });
    _hexo.on('new', (post) => {
      logger.verbose(`Create new post ${post.path}`, this.context);
    });
    _hexo.on('processBefore', () => {
      logger.verbose('Hexo process started', this.context);
    });
    _hexo.on('processAfter', () => {
      logger.verbose('Hexo process finished', this.context);
    });
    _hexo.on('generateBefore', () => {
      const postCount = _hexo.locals.get('posts').count();
      logger.verbose(`Found ${postCount} Hexo posts`, this.context);
    });
    _hexo.on('generateAfter', () => {
      logger.verbose('Hexo generate finished', this.context);
    });
    _hexo.on('exit', () => {
      logger.verbose(`Hexo exited`, this.context);
    });

    this.inst = _hexo;
  }

  async updateHexoConfigFiles(): Promise<void> {
    if (!isDeployTask(this.taskConfig))
      throw new Error(`Task config is not for deploy`);
    await this.updateHexoConfigFile(this.taskConfig);
    await this.updateHexoThemeConfigFile(this.taskConfig);
  }

  async generateHexoStaticFiles(): Promise<void> {
    logger.info(`Generating Hexo static files`, this.context);
    const _pm = this.guessPackageManager(this.baseDir);
    if (_pm === 'yarn') {
      await this.execChildProcess('yarn run hexo clean');
      await this.execChildProcess('yarn run hexo generate');
    }
    if (_pm === 'npm') {
      await this.execChildProcess('npm run hexo clean');
      await this.execChildProcess('npm run hexo generate');
    }
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
          await this.removeHexoPostFile(_post, 'post');
          const _nPost = await this.getPostInfoWithNewTitle(_post);
          _post = _nPost;
        }
        await this.createHexoPostFile(_post, update, 'post');
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
          await this.removeHexoPostFile(_post, 'draft');
          const _nPost = await this.getPostInfoWithNewTitle(_post);
          _post = _nPost;
        }
        await this.createHexoPostFile(_post, update, 'draft');
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
        await this.movePostFileToDraft(post);
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
        await this.removeHexoPostFile(post, 'post');
      },
    );
  }
}
