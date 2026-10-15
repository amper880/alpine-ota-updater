/**
 * Build-time configuration. Values are injected by scripts/build.mjs (esbuild `define`).
 */
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
declare const __REPO_URL__: string;
declare const __DEV__: boolean;

export const APP_VERSION: string = __APP_VERSION__;
export const BUILD_DATE: string = __BUILD_DATE__;
/** Source code repository URL (set by CI from the GitHub repository). Empty = hidden. */
export const REPO_URL: string = __REPO_URL__;
/** True for development builds. */
export const IS_DEV: boolean = __DEV__;
