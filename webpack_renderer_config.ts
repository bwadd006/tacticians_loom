import type { Configuration } from 'webpack';
import { rules } from './webpack_rules';
export const rendererConfig: Configuration = {
  // Avoid eval-based development bundles so the production CSP also works in dev.
  devtool: 'source-map',
  module: { rules: [...rules, { test: /\.css$/, use: ['style-loader', 'css-loader'] }] },
  resolve: { extensions: ['.js', '.ts', '.tsx', '.json'] },
};
