import anyTest, { TestInterface } from 'ava';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import process from 'process';

import {
  createCommandHelper,
  IHexoCommandHelper,
} from '../../../src/hexo/helpers';
import { HexoPostInfo } from '../../../src/types/hexo';

interface HexoCommandHelperTestInterface {
  workDir: string;
  postsDir: string;
  hexo: IHexoCommandHelper;
}
const test = anyTest as TestInterface<HexoCommandHelperTestInterface>;

test.before(async (t) => {
  // TODO init hexo template
  process.env.TEMPLATE_PATH = '/tmp/MetaNetwork/Template';
  t.context.workDir = process.env.TEMPLATE_PATH;
  t.context.postsDir = path.resolve(t.context.workDir, 'source/_posts');
});

test.beforeEach(async (t) => {
  const hexo = await createCommandHelper({ safe: true });
  t.context.hexo = hexo;
});

test('HexoCommandHelper: create post should be create an expected file', async (t) => {
  const data: HexoPostInfo = {
    title: 'Test Post Title',
    content: 'Test Post Content.',
    date: '2022-01-25 08:14:26',
  };
  const path = await t.context.hexo.create(data, 'post', true);
  const fileData = await readFile(path, { encoding: 'utf-8' });
  const expected = `---\ntitle: Test Post Title\ndate: 2022-01-25 08:14:26\ntags:\n---\n\nTest Post Content.`;
  t.is(fileData, expected);
});

test('HexoCommandHelper: create draft should be create an expected file', async (t) => {
  const data: HexoPostInfo = {
    title: 'Test Draft Title',
    content: 'Test Draft Content.',
  };
  const path = await t.context.hexo.create(data, 'draft', true);
  const fileData = await readFile(path, { encoding: 'utf-8' });
  const expected = `---\ntitle: Test Draft Title\ntags:\n---\n\nTest Draft Content.`;
  t.is(fileData, expected);
});

test('HexoCommandHelper: publish draft should be create an expected file', async (t) => {
  const data: HexoPostInfo = {
    title: 'Test Draft Title',
    slug: 'Test Draft Title',
    content: 'Test Draft Content.',
  };
  const path = await t.context.hexo.publish(data, true);
  const fileData = await readFile(path, { encoding: 'utf-8' });
  const expected =
    /-{3}\ntitle: Test Draft Title\ndate: \d{4}-[01]\d-[0-3]\d [0-2]\d:[0-5]\d:[0-5]\d\ntags:\n-{3}\n*Test Draft Content./;
  t.regex(fileData, expected);
});

test('HexoCommandHelper: conceal post should be create an expected file', async (t) => {
  const data: HexoPostInfo = {
    title: 'Test Draft Title',
    content: 'Test Draft Content.',
  };
  const path = await t.context.hexo.conceal(data);
  const fileData = await readFile(path, { encoding: 'utf-8' });
  const expected =
    /-{3}\ntitle: Test Draft Title\ndate: \d{4}-[01]\d-[0-3]\d [0-2]\d:[0-5]\d:[0-5]\d\ntags:\n-{3}\n*Test Draft Content./;
  t.regex(fileData, expected);
});

test('HexoCommandHelper: remove post should be match expected value', async (t) => {
  const data: HexoPostInfo = {
    title: 'Test Post Title',
    content: 'Test Post Content.',
  };
  const path = await t.context.hexo.remove(data, 'post');
  const exists = existsSync(path);
  t.is(exists, false);
});
