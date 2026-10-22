import type Database from 'better-sqlite3';

// Explicit package entry points let Webpack locate v13's bundled N-API binaries.
// This avoids bundling the package's dynamically computed require path.
export function loadSqlite(): typeof Database {
  if (process.platform === 'win32') {
    if (process.arch === 'x64') return require('better-sqlite3/win32-x64');
    if (process.arch === 'arm64') return require('better-sqlite3/win32-arm64');
  }
  if (process.platform === 'linux') {
    const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
    if (report.header.glibcVersionRuntime) {
      if (process.arch === 'x64') return require('better-sqlite3/linux-x64');
      if (process.arch === 'arm64') return require('better-sqlite3/linux-arm64');
    } else {
      if (process.arch === 'x64') return require('better-sqlite3/linuxmusl-x64');
      if (process.arch === 'arm64') return require('better-sqlite3/linuxmusl-arm64');
    }
  }
  throw new Error(`Unsupported SQLite platform: ${process.platform}/${process.arch}`);
}
