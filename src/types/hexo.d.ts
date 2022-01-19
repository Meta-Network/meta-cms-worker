import Hexo from 'hexo';

export interface HexoConfig {
  [key: string]: unknown;
  /**
   * The title of your website
   */
  readonly title: string;

  /**
   * The subtitle of your website
   */
  readonly subtitle: string;

  /**
   * The description of your website
   */
  readonly description: string;

  /**
   * The keywords of your website. Supports multiple values.
   */
  readonly keywords: string[] | null;

  /*
   * Your name
   */
  readonly author: string;

  /**
   * The language of your website. Use a 2-lettter ISO-639-1 code. Default is en.
   */
  readonly language: string;

  /**
   * The timezone of your website. Hexo uses the setting on your computer by default.
   * You can find the list of available timezones [here]{@link https://en.wikipedia.org/wiki/List_of_tz_database_time_zones} .
   * Some examples are `America/New_York` , `Japan` , and `UTC` .
   */
  readonly timezone: string;

  /*
   * The URL of your website
   */
  readonly url: string;

  /**
   * The root directory of your website
   */
  readonly root: string;

  /**
   * The permalink format of articles
   */
  readonly permalink: string;

  /**
   * Default values of each segment in permalink
   */
  readonly permalink_defaults: string | null;

  /**
   * Rewrite the permalink variables to pretty URLs
   */
  readonly pretty_urls: {
    /**
     * Trailing index.html, set to false to remove it
     */
    readonly trailing_index: boolean;
    /**
     * Trailing .html, set to false to remove it (does not apply to trailing index.html)
     */
    readonly trailing_html: boolean;
  };

  /**
   * Source folder. Where your content is stored
   */
  readonly source_dir: string;

  /**
   * Public folder. Where the static site will be generated
   */
  readonly public_dir: string;

  /**
   * Tag directory
   */
  readonly tag_dir: string;

  /**
   * Archive directory
   */
  readonly archive_dir: string;

  /**
   * Category directory
   */
  readonly category_dir: string;

  /**
   * Include code directory (subdirectory of source_dir)
   */
  readonly code_dir: string;

  /**
   * i18n directory
   */
  readonly i18n_dir: string;

  /**
   * Paths that will be copied to public raw, without being rendered. You can use glob expressions for path matching.
   */
  readonly skip_render: string | string[] | null;

  /**
   * The filename format for new posts
   */
  readonly new_post_name: string;

  /**
   * Default layout
   */
  readonly default_layout: string;

  /**
   * Transform titles into title case?
   */
  readonly titlecase: boolean;

  /**
   * Open external links in a new tab?
   */
  readonly external_link: {
    /**
     * Open external links in a new tab?
     */
    readonly enable: boolean;
    /**
     * Applies to the whole site or post only
     */
    readonly field: 'site' | 'post' | null;
    /**
     * Exclude hostname. Specify subdomain when applicable, including www
     */
    readonly exclude: string[] | null;
  };

  /**
   * Transform filenames to 1 lower case; 2 upper case
   */
  readonly filename_case: number;

  /**
   * Display drafts?
   */
  readonly render_drafts: boolean;

  /**
   * Enable the Asset Folder?
   */
  readonly post_asset_folder: boolean;

  /**
   * Make links relative to the root folder?
   */
  readonly relative_link: boolean;

  /**
   * Display future posts?
   */
  readonly future: boolean;

  /**
   * Code block syntax highlight settings, see Highlight.js section for usage guide
   */
  readonly highlight: {
    readonly enable: boolean;
    readonly line_number: boolean;
    readonly auto_detect: boolean;
    readonly tab_replace: string | null;
    readonly wrap: boolean;
    readonly hljs: boolean;
  };

  /**
   * Code block syntax highlight settings, see PrismJS section for usage guide
   */
  readonly prismjs: {
    readonly enable: boolean;
    readonly preprocess: boolean;
    readonly line_number: boolean;
    readonly tab_replace: string | null;
  };

  /**
   * Generate an archive of posts, powered by hexo-generator-index
   */
  readonly index_generator: {
    /**
     * Root path for your blog’s index page
     */
    readonly path: string | null;
    /**
     * Posts displayed per page.
     */
    readonly per_page: number;
    /**
     * Posts order. Order by descending date (new to old) by default.
     */
    readonly order_by: string;
    /**
     * URL format, see Pagination setting below
     */
    readonly pagination_dir: string;
  };

  /**
   * Default category
   */
  readonly default_category: string;

  /**
   * Category slugs
   */
  readonly category_map: { [key: string]: string | number };

  /**
   * Tag slugs
   */
  readonly tag_map: { [key: string]: string | number };

  /**
   * Date format
   * https://momentjs.com/
   */
  readonly date_format: string;

  /**
   * Time format
   * https://momentjs.com/
   */
  readonly time_format: string;

  /**
   * The updated value to used when not provided in the front-matter
   */
  readonly updated_option: 'mtime' | 'date' | 'empty';

  /**
   * The amount of posts displayed on a single page. 0 disables pagination
   */
  readonly per_page: number;

  /**
   * Pagination directory
   */
  readonly pagination_dir: string;

  /**
   * Theme name. false disables theming
   */
  readonly theme: string | false;

  /**
   * Theme configuration. Include any custom theme settings under this key to override theme defaults.
   */
  readonly theme_config: { [key: string]: string | number };

  /**
   * Deployment settings
   */
  readonly deploy: Hexo.extend.Deployer.Config | null;

  /**
   * Meta generator tag. false disables injection of the tag.
   */
  readonly meta_generator: boolean;

  /**
   * Hexo by default ignores hidden files and folders, but setting this field will make Hexo process them
   */
  readonly include?: string[] | undefined;

  /**
   * Hexo process will ignore files list under this field
   */
  readonly exclude?: string[] | undefined;

  /**
   * Ignore files/folders
   */
  readonly ignore: string[];
}

type PostMinimumProperties = {
  title: string;
  content: string;
};
type HexoFrontMatter = {
  layout?: string;
  title?: string;
  date?: string | number;
  updated?: string | number;
  comments?: boolean;
  tags?: string[];
  categories?: string[];
  permalink?: string;
  excerpt?: string;
  disableNunjucks?: boolean;
  lang?: string;
};
export type HexoPostInfo = PostMinimumProperties &
  Hexo.Post.Data &
  HexoFrontMatter;

export type HexoPostCreate = {
  path: string;
  content: string;
};
