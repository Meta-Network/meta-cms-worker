import anyTest, { ExecutionContext, TestInterface } from 'ava';
import fs from 'fs';
import { mkdtemp, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  createCommandHelper,
  IGitCommandHelper,
} from '../../../src/git/helpers/command';

interface GitCommandHelperTestInterface {
  baseDir: string;
  workDir: string;
  git: IGitCommandHelper;
}
const test = anyTest as TestInterface<GitCommandHelperTestInterface>;

const createTestFiles = async (
  t: ExecutionContext<GitCommandHelperTestInterface>,
): Promise<void> => {
  await Promise.allSettled([
    writeFile(path.join(t.context.workDir, 'file1.js'), '', {
      encoding: 'utf-8',
    }),
    writeFile(path.join(t.context.workDir, 'file2.js'), '', {
      encoding: 'utf-8',
    }),
    writeFile(path.join(t.context.workDir, 'file3.js'), '', {
      encoding: 'utf-8',
    }),
    writeFile(path.join(t.context.workDir, 'file4.ts'), '', {
      encoding: 'utf-8',
    }),
  ]);
};

const testRepoUrl = 'https://github.com/octocat/Spoon-Knife.git';

test.before(async (t) => {
  const baseDir = path.join(os.tmpdir(), 'test-git-command-helper');
  fs.mkdirSync(baseDir, { recursive: true });
  t.context.baseDir = baseDir;
});

test.beforeEach(async (t) => {
  const workDir = await mkdtemp(path.join(t.context.baseDir, 'test-'));
  const git = await createCommandHelper(workDir);
  t.context.workDir = workDir;
  t.context.git = git;
});

test('GitCommandHelper: getWorkingDirectory should be match expected path', async (t) => {
  const dir = t.context.git.getWorkingDirectory();
  t.is(dir, t.context.workDir);
});

test('GitCommandHelper: init should be create .git folder', async (t) => {
  await t.context.git.init();
  const dotGit = fs.existsSync(
    path.join(t.context.git.getWorkingDirectory(), '.git'),
  );
  t.is(dotGit, true);
});

test('GitCommandHelper: init with branch name should be create an expected branch name', async (t) => {
  await t.context.git.init('feat/expected');
  const branch = await t.context.git.branchCurrent();
  t.is(branch, 'feat/expected');
});

test('GitCommandHelper: add should be match expected value', async (t) => {
  const expected: string[] = [
    "add 'file1.js'",
    "add 'file2.js'",
    "add 'file3.js'",
  ];
  await t.context.git.init();
  await createTestFiles(t);
  const result = await t.context.git.add('file*.js');
  t.deepEqual(result, expected);
});

test('GitCommandHelper: addAll should be match expected value', async (t) => {
  const expected: string[] = [
    "add 'file1.js'",
    "add 'file2.js'",
    "add 'file3.js'",
    "add 'file4.ts'",
  ];
  await t.context.git.init();
  await createTestFiles(t);
  const result = await t.context.git.addAll();
  t.deepEqual(result, expected);
});

test('GitCommandHelper: branchList should be match expected value', async (t) => {
  const expected: string[] = ['main'];
  await t.context.git.clone(testRepoUrl);
  const result = await t.context.git.branchList();
  t.deepEqual(result, expected);
});

test('GitCommandHelper: branchList with remote location should be match expected value', async (t) => {
  const expected: string[] = [
    'origin/HEAD',
    'origin/change-the-title',
    'origin/main',
    'origin/test-branch',
  ];
  await t.context.git.clone(testRepoUrl);
  const result = await t.context.git.branchList('remote');
  t.deepEqual(result, expected);
});

test('GitCommandHelper: branchList with all location should be match expected value', async (t) => {
  const expected: string[] = [
    'main',
    'origin/HEAD',
    'origin/change-the-title',
    'origin/main',
    'origin/test-branch',
  ];
  await t.context.git.clone(testRepoUrl);
  const result = await t.context.git.branchList('all');
  t.deepEqual(result, expected);
});

test('GitCommandHelper: checkout a branch should be match expected value', async (t) => {
  await t.context.git.clone(testRepoUrl);
  await t.context.git.checkout('test-branch');
  const result = await t.context.git.branchCurrent();
  t.deepEqual(result, 'test-branch');
});
