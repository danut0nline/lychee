'use strict';

const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = require.resolve('stockfish/package.json');
const stockfishPackage = require(packageJsonPath);
const packageRoot = path.dirname(packageJsonPath);
const engineBaseName = `stockfish-${stockfishPackage.buildVersion}-lite-single`;
const sourceDirectory = path.join(packageRoot, 'bin');
const destinationDirectory = path.join(__dirname, '..', 'public', 'stockfish');
const assets = [
  `${engineBaseName}.js`,
  `${engineBaseName}.wasm`,
  'Copying.txt',
];

fs.mkdirSync(destinationDirectory, { recursive: true });

for (const asset of assets) {
  const sourcePath = path.join(
    asset === 'Copying.txt' ? packageRoot : sourceDirectory,
    asset
  );

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Stockfish asset not found: ${sourcePath}`);
  }

  fs.copyFileSync(sourcePath, path.join(destinationDirectory, asset));
}

console.log(
  `Prepared Stockfish ${stockfishPackage.version} lite single-threaded assets.`
);
