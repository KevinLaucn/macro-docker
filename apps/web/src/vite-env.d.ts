interface ImportMetaEnv {
  readonly __APP_VERSION__: string;
  readonly __LOCAL_JWT__: string;
  readonly __GIT_BRANCH__: string;

  readonly VITE_SEGMENT_WRITE_KEY: string;
  readonly VITE_POSTHOG_API_KEY: string;

  readonly VITE_OTEL_EXPORTER_URL?: string;
  readonly VITE_OTEL_ENV?: string;
  readonly VITE_ENABLE_BROWSER_OTEL?: string;
  readonly VITE_ENABLE_REMINDERS?: string;
  readonly VITE_DISABLE_BROWSER_TURSO_CACHE?: string;
  readonly VITE_ADMIN_EMAIL?: string;
  /** 启用官方新版 Composable 双栏视图（包括收件箱、任务和频道），隐藏外层冗余全局 Header 与重复箭头 */
  readonly VITE_ENABLE_NEW_APP_VIEWS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
