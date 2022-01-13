// import { URL } from 'url';

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
