import { URL } from 'url';

export class GitHubService {
  public static getServerUrl(): URL {
    return new URL('https://github.com');
  }

  public static getFetchUrl(owner: string, repo: string): string {
    const serviceUrl = this.getServerUrl();
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);
    return `${serviceUrl.origin}/${encodedOwner}/${encodedRepo}.git`;
  }

  public static getBasicCredential(token: string): string {
    const basicCredential = Buffer.from(
      `x-access-token:${token}`,
      'utf8',
    ).toString('base64');
    return basicCredential;
  }
}
