// Publish a UI update: node src/release-ui.js 2.0.1 "What changed"
// Bump app/version.json first. Writes update/ui-<ver>.json and updates update/manifest.json.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [ver, notes = ''] = process.argv.slice(2);
if (!ver) throw new Error('usage: node src/release-ui.js <version> "notes"');
const appDir = path.join(__dirname, 'app'), out = path.join(__dirname, '..', 'update');
const files = {};
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files[path.relative(appDir, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64'); } })(appDir);
files['version.json'] = Buffer.from(JSON.stringify({ version: ver })).toString('base64');
const buf = Buffer.from(JSON.stringify({ version: ver, files }));
fs.writeFileSync(path.join(out, `ui-${ver}.json`), buf);
const mp = path.join(out, 'manifest.json');
const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
m.ui = { version: ver, url: `ui-${ver}.json`, sha256: crypto.createHash('sha256').update(buf).digest('hex'), minShell: 2, notes };
fs.writeFileSync(mp, JSON.stringify(m, null, 2));
console.log('UI', ver, 'ready — commit & push update/ to ship it');
