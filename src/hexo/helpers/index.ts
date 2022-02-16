import execa from 'execa';
import fs from 'fs/promises';
import Hexo from 'hexo';
import { slugize } from 'hexo-util';
import path from 'path';
import process from 'process';
import { sync } from 'resolve';

import { TEMPLATE_PATH } from '../../constants';
import { logger } from '../../logger';
import { LogContext } from '../../types';
import { HexoPostCreate, HexoPostInfo } from '../../types/hexo';

export interface IHexoCommandHelper {
  generate(): Promise<void>;
  create(
    post: HexoPostInfo,
    layout: 'post' | 'draft',
    replace?: boolean,
  ): Promise<string>;
  publish(post: HexoPostInfo, replace?: boolean): Promise<string>;
  conceal(post: HexoPostInfo): Promise<string>;
  remove(post: HexoPostInfo, layout: 'post' | 'draft'): Promise<string>;
  exit(error?: unknown): Promise<void>;
}

/**
 * Create Hexo command helper
 * @param args Hexo initialization options see: https://hexo.io/api/#Initialize
 */
export async function createCommandHelper(
  args?: Hexo.InstanceOptions,
): Promise<HexoCommandHelper> {
  return await HexoCommandHelper.createCommandHelper(args);
}

class HexoCommandHelper implements IHexoCommandHelper {
  private constructor() {
    this.context = {
      context: this.constructor.name,
    };
    this.baseDir = TEMPLATE_PATH;
  }

  private readonly context: LogContext;
  private readonly baseDir: string;
  private hexo: Hexo;

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
      logger.warn(`Local hexo loading failed in ${path}`, error, this.context);
      logger.info(`Use worker Hexo module`, this.context);
      return new Hexo(path, arg);
    }
  }

  private async initialize(args?: Hexo.InstanceOptions): Promise<void> {
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
    this.hexo = _hexo;
  }

  private async execHexo(
    cmd: string,
    reject = true,
  ): Promise<execa.ExecaSyncReturnValue<string>> {
    const env = Object.assign({}, process.env);
    const options: execa.SyncOptions = {
      cwd: this.baseDir,
      env,
      reject,
    };
    logger.verbose(`Exec hexo command: ${cmd}`, this.context);
    return execa.commandSync(cmd, options);
  }

  private async getPostPath(
    post: HexoPostInfo,
    layout: 'post' | 'draft',
  ): Promise<string> {
    if (typeof this.hexo['execFilter'] === 'function') {
      const data: Hexo.Post.Data = {
        layout,
        slug: slugize(post.title, {
          transform: this.hexo.config.filename_case as 1 | 2,
        }),
      };
      logger.verbose(
        `Get ${data.layout} layout post ${data.slug} path`,
        this.context,
      );
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const path = await this.hexo.execFilter('new_post_path', data, {
        args: [true], // use replase mode
        context: Object.assign({}, this.hexo), // a Hexo instance copy
      });
      return path;
    } else {
      throw new Error('hexo execFilter is not a function');
    }
  }

  public static async createCommandHelper(
    args?: Hexo.InstanceOptions,
  ): Promise<HexoCommandHelper> {
    const result = new HexoCommandHelper();
    await result.initialize(args);
    return result;
  }

  public async generate(): Promise<void> {
    logger.info(`Generates Hexo static files`, this.context);
    const cleanResult = await this.execHexo('yarn run hexo clean');
    logger.verbose(`Hexo clean output: \n${cleanResult.stdout}`, this.context);
    const generateResult = await this.execHexo('yarn run hexo generate');
    logger.verbose(
      `Hexo generate output: \n${generateResult.stdout}`,
      this.context,
    );
  }

  public async create(
    post: HexoPostInfo,
    layout: 'post' | 'draft',
    replace = false,
  ): Promise<string> {
    if (replace) logger.info(`Hexo create replace mode on`, this.context);
    const data: HexoPostInfo = {
      ...post,
      layout,
    };
    logger.info(
      `Create title "${post.title}" post to ${layout} layout`,
      this.context,
    );
    const _create = (await this.hexo.post.create(data, replace)) as unknown;
    const { path } = _create as HexoPostCreate;
    // post.content already write content to file
    // logger.info(`Write post content to ${path}`, this.context);
    // await fs.appendFile(path, `\n${post.content}\n`);
    logger.info(`Create post file to ${path}`, this.context);
    return path;
  }

  public async publish(post: HexoPostInfo, replace = false): Promise<string> {
    if (replace) logger.info(`Hexo publish replace mode on`, this.context);
    const data: HexoPostInfo = {
      ...post,
      layout: 'post',
    };
    logger.info(
      `Publish title "${post.title}" post to post layout`,
      this.context,
    );
    const _publish = (await this.hexo.post.publish(data, replace)) as unknown;
    const { path } = _publish as HexoPostCreate;
    logger.info(`Publish post file to ${path}`, this.context);
    return path;
  }

  public async conceal(post: HexoPostInfo): Promise<string> {
    const draftsPath = path.join(this.hexo.source_dir, '_drafts');
    const postsPath = path.join(this.hexo.source_dir, '_posts');
    const filePath = await this.getPostPath(post, 'post');
    if (filePath) {
      const movePath = filePath.replace(postsPath, draftsPath);
      logger.info(
        `Move title "${post.title}" post from path ${filePath} to ${movePath}`,
        this.context,
      );
      await fs.rename(filePath, movePath);
      return movePath;
    } else {
      logger.warn(
        `Can not move title "${post.title}" post from posts to drafts, file ${filePath} does not exists`,
        this.context,
      );
      return filePath;
    }
  }

  public async remove(
    post: HexoPostInfo,
    layout: 'post' | 'draft',
  ): Promise<string> {
    const path = await this.getPostPath(post, layout);
    if (path) {
      logger.info(
        `Remove title "${post.title}" post from ${layout} layout, path: ${path}`,
        this.context,
      );
      await fs.rm(path, { force: true });
    } else {
      logger.warn(
        `Can not remove title "${post.title}" post from ${layout} layout, file does not exists`,
        this.context,
      );
    }
    return path;
  }

  public async exit(error?: unknown): Promise<void> {
    await this.hexo.exit(error);
  }
}
