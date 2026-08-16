// Fetch a GitHub repo's full file tree via api.github.com + raw.githubusercontent.com
// Usage: node fetch-repo.js <owner> <repo> <branch> <targetDir>
const https = require('https');
const fs = require('fs');
const path = require('path');

const [owner, repo, branch, targetDir] = process.argv.slice(2);
const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
const MAX_SIZE = 5 * 1024 * 1024;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/vnd.github+json' } }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode} ${url}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout ' + url)));
  });
}

function download(url, file) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`HTTP ${r.statusCode} ${url}`)); }
      const len = parseInt(r.headers['content-length'] || '0', 10);
      if (len > MAX_SIZE) { r.resume(); return reject(new Error(`too large (${len}) ${url}`)); }
      const w = fs.createWriteStream(file);
      r.pipe(w);
      w.on('finish', () => { w.close(); resolve(); });
      w.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('timeout ' + url)));
  });
}

(async () => {
  const tree = await getJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
  const blobs = (tree.tree || []).filter((t) => t.type === 'blob');
  console.log(`[${owner}/${repo}] ${blobs.length} blobs`);
  let ok = 0, fail = 0;
  for (const b of blobs) {
    const file = path.join(targetDir, b.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      await download(base + encodeURI(b.path), file);
      ok++;
      console.log(`  ok   ${b.path} (${b.size}B)`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${b.path}: ${e.message}`);
    }
  }
  console.log(`[${owner}/${repo}] done: ${ok} ok, ${fail} fail`);
  process.exit(fail > 0 ? 2 : 0);
})();
