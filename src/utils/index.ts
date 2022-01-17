// import { URL } from 'url';
import fs from 'fs/promises';
import yaml from 'yaml';

export const isEmptyObj = (obj: Record<string, unknown>): boolean => {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

export const formatUrl = (url: string): string => {
  // const _url = new URL(`https://${url}`);
  // _url.protocol = 'https';
  // return _url.href;
  return `https://${url}`;
};

export function omitObj<T = Record<string, unknown>>(
  obj: T,
  props: string[],
): T {
  obj = { ...obj };
  props.forEach((prop) => delete obj[prop]);
  return obj;
}

export async function objectToYamlFile(
  obj: unknown,
  path: string,
): Promise<void> {
  const yamlStr = yaml.stringify(obj);
  const data = new Uint8Array(Buffer.from(yamlStr));
  await fs.writeFile(path, data, { encoding: 'utf8' });
}
export async function yamlFileToObject<T = unknown>(path: string): Promise<T> {
  const confData = await fs.readFile(path, 'utf8');
  const data = yaml.parse(confData);
  return data;
}
