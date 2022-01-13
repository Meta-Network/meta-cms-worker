import { URL } from 'url';

export class GiteeService {
  public static getServerUrl(): URL {
    return new URL('https://gitee.com');
  }

  public static getFetchUrl(owner: string, repo: string): string {
    const serviceUrl = this.getServerUrl();
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    return `${serviceUrl.origin}/${encodedOwner}/${encodedRepo}.git`;
  }

  public static getBasicCredential(token: string, owner: string): string {
    const basicCredential = Buffer.from(`${owner}:${token}`, 'utf8').toString(
      'base64',
    );
    return basicCredential;
  }
}
