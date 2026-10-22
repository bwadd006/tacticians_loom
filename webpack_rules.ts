import type { ModuleOptions } from 'webpack';
export const rules: Required<ModuleOptions>['rules'] = [
  { test: /native_modules[/\\].+\.node$/, use: 'node-loader' },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: { loader: '@vercel/webpack-asset-relocator-loader', options: { outputAssetBase: 'native_modules' } },
  },
  { test: /\.tsx?$/, exclude: /node_modules/, use: { loader: 'ts-loader', options: { transpileOnly: true, compilerOptions: { noEmit: false } } } },
  { test: /\.(webp|png)$/, type: 'asset/resource' },
];
