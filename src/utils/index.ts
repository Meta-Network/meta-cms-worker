// import { URL } from 'url';
import assert from 'assert';
import fs from 'fs/promises';
import { ensureSymlink } from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

export const isEmptyObj = (obj: Record<string, unknown>): boolean => {
  assert(obj, new TypeError('parameter "obj" is required!'));
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

export const formatUrl = (url: string): string => {
  assert(url, new TypeError('parameter "url" is required!'));
  const testRegExp = new RegExp('^https?://');
  if (testRegExp.test(url)) {
    const _url = new URL(url);
    _url.protocol = 'https';
    return _url.href;
  }
  return `https://${url}`;
};

export function omitObj<T = Record<string, unknown>>(
  obj: T,
  props: string[],
): T {
  assert(obj, new TypeError('parameter "obj" is required!'));
  assert(props, new TypeError('parameter "props" is required!'));
  obj = { ...obj };
  props.forEach((prop) => delete obj[prop]);
  return obj;
}

export async function objectToYamlFile(
  obj: unknown,
  path: string,
): Promise<void> {
  assert(obj, new TypeError('parameter "obj" is required!'));
  assert(path, new TypeError('parameter "path" is required!'));
  const yamlStr = yaml.stringify(obj);
  const data = new Uint8Array(Buffer.from(yamlStr));
  await fs.writeFile(path, data, { encoding: 'utf8' });
}
export async function yamlFileToObject<T = unknown>(path: string): Promise<T> {
  assert(path, new TypeError('parameter "path" is required!'));
  const confData = await fs.readFile(path, 'utf8');
  const data = yaml.parse(confData);
  return data;
}

export async function exists(path: string): Promise<boolean> {
  assert(path, new TypeError('parameter "path" is required!'));
  const promise = fs.access(path).then(
    () => true,
    (err) => {
      if (err.code !== 'ENOENT') throw err;
      return false;
    },
  );
  return Promise.resolve(promise);
}

export async function createSymlink(
  source: string,
  destination: string,
): Promise<void> {
  assert(source, new TypeError('parameter "source" is required!'));
  assert(destination, new TypeError('parameter "destination" is required!'));
  const sourcePath = path.resolve(source);
  const destinationPath = path.resolve(destination);
  assert(
    exists(sourcePath),
    new Error(`symlink source ${sourcePath} does not exists.`),
  );
  if (exists(destinationPath)) {
    // If destination is exists, rename with .bak
    await fs.rename(destinationPath, `${destinationPath}.bak`);
  }
  // Create symlink
  await ensureSymlink(sourcePath, destinationPath, 'junction');
}

export function makeArray<T = unknown>(data: T | T[]): T[] {
  if (!Array.isArray(data)) {
    return [data];
  }
  return data;
}

export function escape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, (x) => {
    return `\\${x}`;
  });
}
