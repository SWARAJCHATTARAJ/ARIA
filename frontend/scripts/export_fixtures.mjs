import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import mock data source
const mockFile = path.resolve(__dirname, '../src/fixtures/mockData.ts');
const rawTs = fs.readFileSync(mockFile, 'utf8');

// Simple regex extraction of json objects
const jsonStart = rawTs.indexOf('export const MOCK_FIXTURES');
const objStart = rawTs.indexOf('{', jsonStart);
const tsCode = rawTs.slice(objStart);

// Write as .sse directly
const fixturesDir = path.resolve(__dirname, '../public/fixtures');
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

console.log('Target dir:', fixturesDir);
