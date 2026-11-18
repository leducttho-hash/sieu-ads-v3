import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const deploymentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(deploymentDirectory, '..');
const publicDirectory = resolve(deploymentDirectory, 'public');
const assets = [
  'index.html',
  'excel-preview-worker.js',
  'vendor-exceljs-4.4.0.min.js',
  'EXCELJS-LICENSE.txt',
];

await rm(publicDirectory, { recursive: true, force: true });
await mkdir(publicDirectory, { recursive: true });
await Promise.all(assets.map(file => copyFile(
  resolve(repositoryDirectory, file),
  resolve(publicDirectory, file),
)));
console.log('Prepared Siêu Ads assets for Cloudflare Workers.');
