import { buildDatabase } from './database_builder';
try {
  console.log(JSON.stringify(buildDatabase(process.cwd()), null, 2));
} catch (error) {
  console.error('Reference build failed; the previous database was not replaced.', error);
  process.exitCode = 1;
}
