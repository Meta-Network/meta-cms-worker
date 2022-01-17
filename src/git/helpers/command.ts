import execa from 'execa';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { gt } from 'semver';

import { logger } from '../../logger';
import { LogContext } from '../../types';
import { escape } from '../utils';

export interface IGitCommandHelper {
  add(pattern: string): Promise<string[]>;
  addAll(): Promise<string[]>;
  branchCurrent(): Promise<string>;
  branchList(location?: 'local' | 'remote' | 'all'): Promise<string[]>;
  checkout(branch: string, isNew?: boolean, force?: boolean): Promise<void>;
  clone(repoUrl: string, branch?: string, depth?: number): Promise<void>;
  commit(
    message: string,
    author?: { name: string; email: string },
    allowEmpty?: boolean,
  ): Promise<void>;
  config(configKey: string, configValue: string, add?: boolean): Promise<void>;
  configExists(configKey: string): Promise<boolean>;
  configUnset(configKey: string): Promise<boolean>;
  fetch(refSpec: string[], depth?: number): Promise<void>;
  getWorkingDirectory(): string;
  init(branchName?: string): Promise<void>;
  push(remoteName?: string, branch?: string, force?: boolean): Promise<void>;
  remoteAdd(remoteName: string, remoteUrl: string): Promise<void>;
  remoteRemove(remoteName: string): Promise<void>;
  remoteShow(): Promise<string[]>;
}

/**
 * Create Git command helper
 * @param workingDirectory a full path start with root directory, e.g: `/tmp/workspace/reponame`
 */
export async function createCommandHelper(
  workingDirectory: string,
): Promise<GitCommandHelper> {
  return await GitCommandHelper.createCommandHelper(workingDirectory);
}

class GitCommandHelper implements IGitCommandHelper {
  private constructor() {
    this.context = {
      context: this.constructor.name,
    };
  }

  private readonly minimumGitVersion = '2.28.0';
  private readonly context: LogContext;
  private gitEnv = {
    GIT_TERMINAL_PROMPT: '0', // Disable git prompt
    GIT_AUTHOR_NAME: '',
    GIT_AUTHOR_EMAIL: '',
    GIT_COMMITTER_NAME: '',
    GIT_COMMITTER_EMAIL: '',
    GCM_INTERACTIVE: 'Never', // Disable prompting for git credential manager
  };
  private workingDirectory = '';

  private async initializeCommandHelper(
    workingDirectory: string,
  ): Promise<void> {
    this.workingDirectory = workingDirectory;
    logger.verbose(
      `Git working directory is ${this.workingDirectory}`,
      this.context,
    );

    logger.verbose('Getting git version', this.context);
    const gitOutput = await this.execGit(['--version']);
    const gitVersionMatch = gitOutput.stdout.trim().match(/\d+\.\d+(\.\d+)?/);
    if (Array.isArray(gitVersionMatch)) {
      logger.verbose(`Git version: ${gitVersionMatch[0]}`, this.context);
      if (!gt(gitVersionMatch[0], this.minimumGitVersion)) {
        throw new Error(
          `Minimum Git version is ${this.minimumGitVersion}, current is ${gitVersionMatch[0]}`,
        );
      }
    }

    const gitHttpUserAgent = `git/${gitVersionMatch[0]} (meta-cms-worker-git)`;
    logger.verbose(`Set git useragent to: ${gitHttpUserAgent}`, this.context);
    this.gitEnv['GIT_HTTP_USER_AGENT'] = gitHttpUserAgent;
  }

  private async execGit(
    args: string[],
    reject = true,
  ): Promise<execa.ExecaReturnValue<string>> {
    const env = Object.assign({}, process.env, this.gitEnv);

    const options: execa.Options = {
      cwd: this.workingDirectory,
      env,
      reject,
    };

    logger.verbose(`Exec git command: git ${args.join(' ')}`, this.context);

    return await execa('git', args, options);
  }

  public static async createCommandHelper(
    workingDirectory: string,
  ): Promise<GitCommandHelper> {
    const result = new GitCommandHelper();
    await result.initializeCommandHelper(workingDirectory);
    return result;
  }

  public async add(pattern: string): Promise<string[]> {
    const result = await this.execGit(['add', '--verbose', pattern]);
    logger.verbose(`Git add output: \n${result.stdout}`, this.context);
    return result.stdout.trim().split('\n');
  }

  public async addAll(): Promise<string[]> {
    const result = await this.execGit(['add', '--verbose', '--all']);
    logger.verbose(`Git add output: \n${result.stdout}`, this.context);
    return result.stdout.trim().split('\n');
  }

  public async branchCurrent(): Promise<string> {
    const result = await this.execGit([
      'branch',
      '--no-color',
      '--format="%(refname:short)"',
      '--show-current',
    ]);
    return result.stdout.trim().replace('\n', '');
  }

  public async branchList(
    location: 'local' | 'remote' | 'all' = 'local',
  ): Promise<string[]> {
    const args: string[] = [
      'branch',
      '--no-color',
      '--format="%(refname:short)"',
      '--list',
    ];
    if (location === 'remote') args.push('--remotes');
    if (location === 'all') args.push('--all');
    const output = await this.execGit(args);
    const result = output.stdout.trim().replace(/"/g, '').split('\n');
    return result;
  }

  public async checkout(
    branch: string,
    isNew?: boolean,
    force?: boolean,
  ): Promise<void> {
    const args: string[] = ['checkout', '--progress'];
    if (isNew) args.push('-b');
    if (force) args.push('--force');
    const result = await this.execGit([...args, branch]);
    logger.verbose(result.stdout, this.context);
  }

  public async clone(
    repoUrl: string,
    branch?: string,
    depth?: number,
  ): Promise<void> {
    const args: string[] = ['clone', '--progress'];
    if (branch) args.push(`--branch=${branch}`);
    if (depth && depth > 0) args.push(`--depth=${depth}`);
    const result = await this.execGit([
      ...args,
      repoUrl,
      this.workingDirectory,
    ]);
    logger.verbose(result.stdout, this.context);
  }

  public async commit(
    message: string,
    author?: { name: string; email: string },
    allowEmpty = false,
  ): Promise<void> {
    const args: string[] = ['commit', `--message=${message}`];
    if (author) {
      args.push(`--author=${author.name} <${author.email}>`);
      this.gitEnv = {
        ...this.gitEnv,
        GIT_AUTHOR_NAME: author.name,
        GIT_AUTHOR_EMAIL: author.email,
        GIT_COMMITTER_NAME: author.name,
        GIT_COMMITTER_EMAIL: author.email,
      };
    }
    if (allowEmpty) args.push('--allow-empty');
    const result = await this.execGit(args);
    logger.verbose(`Git commit output: \n${result.stdout}`, this.context);
  }

  public async config(
    configKey: string,
    configValue: string,
    add?: boolean,
  ): Promise<void> {
    const args: string[] = ['config', '--local'];
    if (add) args.push('--add');
    args.push(...[configKey, configValue]);
    await this.execGit(args);
  }

  public async configExists(configKey: string): Promise<boolean> {
    const pattern = escape(configKey);
    const output = await this.execGit(
      ['config', '--local', '--name-only', '--get-regexp', pattern],
      false,
    );
    return output.exitCode === 0;
  }

  public async configUnset(configKey: string): Promise<boolean> {
    const output = await this.execGit(
      ['config', '--local', '--unset-all', configKey],
      false,
    );
    return output.exitCode === 0;
  }

  public async fetch(refSpec: string[], depth?: number): Promise<void> {
    const args: string[] = [
      'fetch',
      '--no-tags',
      '--no-recurse-submodules',
      '--prune',
      '--progress',
    ];
    if (depth && depth > 0) {
      args.push(`--depth=${depth}`);
    } else {
      const shallowPath = path.join(this.workingDirectory, '.git', 'shallow');
      const shallow = fs.existsSync(shallowPath);
      if (shallow) args.push('--unshallow');
    }
    args.push('origin');
    for (const arg of refSpec) {
      args.push(arg);
    }
    await this.execGit(args);
  }

  public getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  public async init(branchName?: string): Promise<void> {
    const args: string[] = ['init'];
    if (branchName) args.push(`--initial-branch=${branchName}`);
    args.push(this.workingDirectory);
    const result = await this.execGit(args);
    logger.verbose(result.stdout, this.context);
  }

  public async push(
    remoteName = 'origin',
    branch = 'master',
    force?: boolean,
  ): Promise<void> {
    const args: string[] = ['push'];
    if (force) args.push('--force');
    await this.execGit([
      ...args,
      remoteName,
      `refs/heads/${branch}:refs/heads/${branch}`,
    ]);
  }

  public async remoteAdd(remoteName: string, remoteUrl: string): Promise<void> {
    await this.execGit(['remote', 'add', remoteName, remoteUrl]);
  }

  public async remoteRemove(remoteName: string): Promise<void> {
    await this.execGit(['remote', 'remove', remoteName]);
  }

  public async remoteShow(): Promise<string[]> {
    const result = await this.execGit(['remote', 'show']);
    return result.stdout.trim().split('\n');
  }
}
