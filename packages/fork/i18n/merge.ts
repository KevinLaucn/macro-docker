import fs from 'node:fs';
import path from 'node:path';

const zhDictPath = path.resolve(__dirname, './locales/zh-CN.json');
const missingPath = path.resolve(__dirname, './diff/missing.json');
const obsoletePath = path.resolve(__dirname, './diff/obsolete.json');

function merge() {
  if (!fs.existsSync(missingPath)) {
    console.log('No diff/missing.json found.');
    return;
  }
  const existing = JSON.parse(fs.readFileSync(zhDictPath, 'utf-8'));
  const missing = JSON.parse(fs.readFileSync(missingPath, 'utf-8'));

  let mergedCount = 0;
  for (const [k, v] of Object.entries(missing)) {
    if (typeof v === 'string' && v.trim()) {
      const normalizedKey = k.trim().replace(/\s+/g, ' ');
      existing[normalizedKey] = v.trim();
      mergedCount++;
    }
  }

  // Handle optional obsolete cleanup
  let removedCount = 0;
  if (
    process.argv.includes('--clean-obsolete') &&
    fs.existsSync(obsoletePath)
  ) {
    const obsolete = JSON.parse(fs.readFileSync(obsoletePath, 'utf-8'));
    for (const key of Object.keys(obsolete)) {
      if (existing[key] && !key.includes('@@')) {
        delete existing[key];
        removedCount++;
      }
    }
  }

  fs.writeFileSync(zhDictPath, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(
    `✅ Successfully merged ${mergedCount} new translations into locales/zh-CN.json`
  );
  if (removedCount > 0) {
    console.log(
      `🧹 Cleaned up ${removedCount} obsolete keys from locales/zh-CN.json`
    );
  }
}

merge();
