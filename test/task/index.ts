import { MetaWorker } from '@metaio/worker-model';
import anyTest, { TestInterface } from 'ava';
import Hexo from 'hexo';
import Sinon, { SinonSpy, SinonStub } from 'sinon';

import { GitService } from '../../src/git';
import { HexoService } from '../../src/hexo';
import { startWorkerTask } from '../../src/task';
import { MixedTaskConfig } from '../../src/types';

type SinonStubService<T> = {
  [K in keyof T]: T[K] extends (...args: infer TArgs) => infer TReturnValue
    ? SinonStub<TArgs, TReturnValue>
    : SinonStub;
};

interface TaskTestInterface {
  deployConf: MetaWorker.Configs.DeployTaskConfig;
  publishConf: MetaWorker.Configs.PublishTaskConfig;
  postCreateConf: MetaWorker.Configs.PostTaskConfig;
  postUpdateConf: MetaWorker.Configs.PostTaskConfig;
  postDeleteConf: MetaWorker.Configs.PostTaskConfig;
  gitFactory: Sinon.SinonStub<
    [taskConfig: MixedTaskConfig],
    Promise<GitService>
  >;
  hexoFactory: Sinon.SinonStub<
    [taskConfig: MixedTaskConfig, args?: Hexo.InstanceOptions],
    Promise<HexoService>
  >;
  gitService: SinonStubService<GitService>;
  hexoService: SinonStubService<HexoService>;
}
const test = anyTest as TestInterface<TaskTestInterface>;

const excludeServiceSpys = (
  services: SinonStubService<unknown>[],
  exclude: SinonSpy[],
): SinonSpy[] => {
  const filteredSpys: SinonSpy[] = [];
  const excludeSpys: string[] = exclude.map((spy) => spy.name);
  services.forEach((service) => {
    Object.keys(service).forEach((key) => {
      if (!excludeSpys.includes(key)) {
        filteredSpys.push(service[key]);
      }
    });
  });
  return filteredSpys;
};

test.before(async (t) => {
  const user: MetaWorker.Info.UCenterUser = {
    username: 'john_doe',
    nickname: 'John Doe',
  };
  const site: MetaWorker.Info.CmsSiteInfo & MetaWorker.Info.CmsSiteConfig = {
    title: "John Doe's test site",
    subtitle: 'This is a test site',
    description: 'This is a Meta Space test site',
    keywords: ['Test', 'Meta Space', 'Hexo'],
    favicon: 'https://hexo.io/icon/favicon-196x196.png',
    author: 'John Doe',
    avatar:
      'https://ipfs.fleek.co/ipfs/bafybeiccss3figrixd5qhhv6i6zhbz5chmyls6ja5kscu6drg7fnjcnxgm',
    configId: 1,
    language: 'cn',
    timezone: 'Asia/Shanghai',
    domain: 'https://example.com',
  };
  const storage: MetaWorker.Info.Git = {
    token: 'gho_fake_token',
    serviceType: MetaWorker.Enums.GitServiceType.GITHUB,
    username: 'john_doe',
    reponame: 'test-meta-space',
    branchname: 'main',
  };
  const publisher: MetaWorker.Info.Git = {
    token: 'gho_fake_token',
    serviceType: MetaWorker.Enums.GitServiceType.GITHUB,
    username: 'john_doe',
    reponame: 'test-meta-space',
    branchname: 'gh-pages',
  };
  const git = {
    storage,
    publisher,
  };

  t.context.deployConf = {
    task: {
      taskId: 'deploy-task',
      taskMethod: MetaWorker.Enums.WorkerTaskMethod.DEPLOY_SITE,
    },
    user,
    site,
    theme: {
      themeName: 'bear',
      themeRepo: 'https://github.com/fzxiao233/hexo-theme-bear.git',
      themeBranch: 'master',
      themeType: MetaWorker.Enums.TemplateType.HEXO,
      isPackage: false,
    },
    template: {
      templateName: 'Meta Space Template Bear',
      templateRepo:
        'https://github.com/Meta-Network/meta-hexo-starter-custom.git',
      templateBranch: 'theme/bear',
      templateType: MetaWorker.Enums.TemplateType.HEXO,
    },
    git,
  };
  t.context.publishConf = {
    task: {
      taskId: 'publish-task',
      taskMethod: MetaWorker.Enums.WorkerTaskMethod.PUBLISH_SITE,
    },
    site,
    git,
    metadata: {
      domain: 'https://example.com',
      publish: {
        storageType: 'ipfs',
        refer: 'test-refer',
      },
    },
  };
  t.context.postCreateConf = {
    task: {
      taskId: 'post-create-task',
      taskMethod: MetaWorker.Enums.WorkerTaskMethod.CREATE_POSTS,
    },
    user,
    site,
    git,
    post: [
      {
        title: 'Worker 1.5 文章测试 001',
        source: 'Worker 1.5 文章测试',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
      {
        title: 'Worker 1.5 文章测试 002',
        source: 'Worker 1.5 文章测试',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
      {
        title: 'Worker 1.5 文章测试 003',
        source: 'Worker 1.5 文章测试',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
    ],
  };
  t.context.postUpdateConf = {
    task: {
      taskId: 'post-update-task',
      taskMethod: MetaWorker.Enums.WorkerTaskMethod.UPDATE_POSTS,
    },
    user,
    site,
    git,
    post: [
      {
        title: 'Worker 1.5 文章测试 001',
        META_SPACE_INTERNAL_NEW_TITLE: 'Worker 1.5 文章测试改名 001',
        source: 'Worker 1.5 文章测试改名',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
      {
        title: 'Worker 1.5 文章测试 002',
        META_SPACE_INTERNAL_NEW_TITLE: 'Worker 1.5 文章测试改名 002',
        source: 'Worker 1.5 文章测试改名',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
      {
        title: 'Worker 1.5 文章测试 003',
        META_SPACE_INTERNAL_NEW_TITLE: 'Worker 1.5 文章测试改名 003',
        source: 'Worker 1.5 文章测试改名',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
    ],
  };
  t.context.postDeleteConf = {
    task: {
      taskId: 'post-delete-task',
      taskMethod: MetaWorker.Enums.WorkerTaskMethod.DELETE_POSTS,
    },
    user,
    site,
    git,
    post: [
      {
        title: 'Worker 1.5 文章测试改名 001',
        source: 'Worker 1.5 文章测试改名',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
      {
        title: 'Worker 1.5 文章测试改名 002',
        source: 'Worker 1.5 文章测试改名',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
      {
        title: 'Worker 1.5 文章测试改名 003',
        source: 'Worker 1.5 文章测试改名',
        createdAt: '2022-01-07T07:45:50.574Z',
      },
    ],
  };
});

test.beforeEach(async (t) => {
  t.context.gitService = {
    createStorageRepository: Sinon.stub(
      GitService.prototype,
      'createStorageRepository',
    ).returns(Promise.resolve()),
    fetchRemoteStorageRepository: Sinon.stub(
      GitService.prototype,
      'fetchRemoteStorageRepository',
    ).returns(Promise.resolve()),
    commitStorageRepositoryAllChanges: Sinon.stub(
      GitService.prototype,
      'commitStorageRepositoryAllChanges',
    ).returns(Promise.resolve()),
    pushStorageRepositoryToRemote: Sinon.stub(
      GitService.prototype,
      'pushStorageRepositoryToRemote',
    ).returns(Promise.resolve()),
    publishSiteToGitHubPages: Sinon.stub(
      GitService.prototype,
      'publishSiteToGitHubPages',
    ).returns(Promise.resolve()),
  };
  t.context.hexoService = {
    generateHexoStaticFiles: Sinon.stub(
      HexoService.prototype,
      'generateHexoStaticFiles',
    ).returns(Promise.resolve()),
    createHexoPostFiles: Sinon.stub(
      HexoService.prototype,
      'createHexoPostFiles',
    ).returns(Promise.resolve()),
    createHexoDraftFiles: Sinon.stub(
      HexoService.prototype,
      'createHexoDraftFiles',
    ).returns(Promise.resolve()),
    publishHexoDraftFiles: Sinon.stub(
      HexoService.prototype,
      'publishHexoDraftFiles',
    ).returns(Promise.resolve()),
    moveHexoPostFilesToDraft: Sinon.stub(
      HexoService.prototype,
      'moveHexoPostFilesToDraft',
    ).returns(Promise.resolve()),
    deleteHexoPostFiles: Sinon.stub(
      HexoService.prototype,
      'deleteHexoPostFiles',
    ).returns(Promise.resolve()),
    symlinkWorkspaceDirectoryAndFiles: Sinon.stub(
      HexoService.prototype,
      'symlinkWorkspaceDirectoryAndFiles',
    ).returns(Promise.resolve()),
    createDotNoJekyllAndCNameFile: Sinon.stub(
      HexoService.prototype,
      'createDotNoJekyllAndCNameFile',
    ).returns(Promise.resolve()),
    createWorkspaceSourceDirectory: Sinon.stub(
      HexoService.prototype,
      'createWorkspaceSourceDirectory',
    ).returns(Promise.resolve()),
  };
  t.context.gitFactory = Sinon.stub(GitService, 'createGitService').returns(
    new Promise((res) => {
      res(t.context.gitService as unknown as GitService);
    }),
  );
  t.context.hexoFactory = Sinon.stub(HexoService, 'createHexoService').returns(
    new Promise((res) => {
      res(t.context.hexoService as unknown as HexoService);
    }),
  );
});

test.afterEach(async (t) => {
  for (const key in t.context.gitService) {
    t.context.gitService[key].restore();
  }
  for (const key in t.context.hexoService) {
    t.context.hexoService[key].restore();
  }
  t.context.gitFactory.restore();
  t.context.hexoFactory.restore();
});

test.serial(
  'Task: startWorkerTask should call both factory method once',
  async (t) => {
    await startWorkerTask(
      t.context.deployConf,
      t.context.gitFactory,
      t.context.hexoFactory,
    );

    Sinon.assert.calledOnceWithExactly(
      t.context.gitFactory,
      t.context.deployConf,
    );
    Sinon.assert.calledOnceWithExactly(
      t.context.hexoFactory,
      t.context.deployConf,
    );

    t.pass();
  },
);

test.serial('Task: deploy task should call expected methods', async (t) => {
  await startWorkerTask(
    t.context.deployConf,
    t.context.gitFactory,
    t.context.hexoFactory,
  );

  const once: SinonSpy[] = [
    t.context.gitService.createStorageRepository,
    t.context.hexoService.createWorkspaceSourceDirectory,
    t.context.gitService.commitStorageRepositoryAllChanges,
    t.context.gitService.pushStorageRepositoryToRemote,
  ];
  once.forEach((spy) => Sinon.assert.calledOnce(spy));

  const never: SinonSpy[] = excludeServiceSpys(
    [t.context.gitService, t.context.hexoService],
    once,
  );
  never.forEach((spy) => Sinon.assert.notCalled(spy));

  t.pass();
});

test.serial('Task: publish task should call expected methods', async (t) => {
  await startWorkerTask(
    t.context.publishConf,
    t.context.gitFactory,
    t.context.hexoFactory,
  );

  const once: SinonSpy[] = [
    t.context.gitService.fetchRemoteStorageRepository,
    t.context.gitService.commitStorageRepositoryAllChanges,
    t.context.gitService.pushStorageRepositoryToRemote,
    t.context.hexoService.symlinkWorkspaceDirectoryAndFiles,
    t.context.hexoService.generateHexoStaticFiles,
    t.context.hexoService.createDotNoJekyllAndCNameFile,
    t.context.gitService.publishSiteToGitHubPages,
  ];
  once.forEach((spy) => Sinon.assert.calledOnce(spy));

  const never: SinonSpy[] = excludeServiceSpys(
    [t.context.gitService, t.context.hexoService],
    once,
  );
  never.forEach((spy) => Sinon.assert.notCalled(spy));

  t.pass();
});

test.serial(
  'Task: post create task should call expected methods',
  async (t) => {
    await startWorkerTask(
      t.context.postCreateConf,
      t.context.gitFactory,
      t.context.hexoFactory,
    );

    const once: SinonSpy[] = [
      t.context.gitService.fetchRemoteStorageRepository,
      t.context.hexoService.symlinkWorkspaceDirectoryAndFiles,
      t.context.hexoService.createHexoPostFiles,
      t.context.gitService.commitStorageRepositoryAllChanges,
      t.context.gitService.pushStorageRepositoryToRemote,
    ];
    once.forEach((spy) => Sinon.assert.calledOnce(spy));

    const never: SinonSpy[] = excludeServiceSpys(
      [t.context.gitService, t.context.hexoService],
      once,
    );
    never.forEach((spy) => Sinon.assert.notCalled(spy));

    Sinon.assert.calledWithMatch(
      t.context.hexoService.createHexoPostFiles,
      false,
    );
    Sinon.assert.calledWithMatch(
      t.context.gitService.commitStorageRepositoryAllChanges,
      'Create post',
    );

    t.pass();
  },
);

test.serial(
  'Task: post update task should call expected methods',
  async (t) => {
    await startWorkerTask(
      t.context.postUpdateConf,
      t.context.gitFactory,
      t.context.hexoFactory,
    );

    const once: SinonSpy[] = [
      t.context.gitService.fetchRemoteStorageRepository,
      t.context.hexoService.symlinkWorkspaceDirectoryAndFiles,
      t.context.hexoService.createHexoPostFiles,
      t.context.gitService.commitStorageRepositoryAllChanges,
      t.context.gitService.pushStorageRepositoryToRemote,
    ];
    once.forEach((spy) => Sinon.assert.calledOnce(spy));

    const never: SinonSpy[] = excludeServiceSpys(
      [t.context.gitService, t.context.hexoService],
      once,
    );
    never.forEach((spy) => Sinon.assert.notCalled(spy));

    Sinon.assert.calledWithMatch(
      t.context.hexoService.createHexoPostFiles,
      true,
    );
    Sinon.assert.calledWithMatch(
      t.context.gitService.commitStorageRepositoryAllChanges,
      'Update post',
    );

    t.pass();
  },
);

test.serial(
  'Task: post delete task should call expected methods',
  async (t) => {
    await startWorkerTask(
      t.context.postDeleteConf,
      t.context.gitFactory,
      t.context.hexoFactory,
    );

    const once: SinonSpy[] = [
      t.context.gitService.fetchRemoteStorageRepository,
      t.context.hexoService.symlinkWorkspaceDirectoryAndFiles,
      t.context.hexoService.deleteHexoPostFiles,
      t.context.gitService.commitStorageRepositoryAllChanges,
      t.context.gitService.pushStorageRepositoryToRemote,
    ];
    once.forEach((spy) => Sinon.assert.calledOnce(spy));

    const never: SinonSpy[] = excludeServiceSpys(
      [t.context.gitService, t.context.hexoService],
      once,
    );
    never.forEach((spy) => Sinon.assert.notCalled(spy));

    Sinon.assert.calledWithMatch(
      t.context.gitService.commitStorageRepositoryAllChanges,
      'Delete post',
    );

    t.pass();
  },
);
