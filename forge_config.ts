import path from 'node:path';
import { validateDistributionBoundary } from './scripts/distribution_boundary';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { mainConfig } from './webpack_main_config';
import { rendererConfig } from './webpack_renderer_config';

const config: ForgeConfig = {
  hooks: { prePackage: async () => { validateDistributionBoundary(process.cwd()); } },
  packagerConfig: {
    asar: true,
    name: 'tacticians_loom',
    executableName: 'tacticians_loom',
    extraResource: [path.resolve('database/generated/reference.sqlite'), path.resolve('resources/asset_manifest.json'), path.resolve('resources/maps'), path.resolve('resources/catalog')],
  },
  // v13 ships N-API prebuilds for both target platforms; do not rebuild for an Electron ABI.
  rebuildConfig: { ignoreModules: ['better-sqlite3'] },
  makers: [new MakerZIP({}, ['linux', 'win32'])],
  plugins: [new AutoUnpackNativesPlugin({}), new WebpackPlugin({
    mainConfig,
    devContentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: loom-art:; connect-src 'self' ws://localhost:*",
    renderer: { config: rendererConfig, entryPoints: [{
      html: './src/renderer/index.html', js: './src/renderer/renderer.tsx', name: 'main_window',
      preload: { js: './src/preload/preload.ts' },
    }] },
  })],
};
export default config;
