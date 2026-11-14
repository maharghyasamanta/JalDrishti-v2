/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the alerts server endpoint. Defaults to "/api/alerts". */
  readonly VITE_ALERTS_URL?: string;
}
