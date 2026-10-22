import type { Configuration } from 'webpack';
import { rules } from './webpack_rules';
export const mainConfig: Configuration = {
  entry: './src/main/main.ts', module: { rules }, resolve: { extensions: ['.js', '.ts', '.tsx', '.json'] },
};
