const fs = require('fs');
const path = require('path');
const https = require('https');

const libsDir = path.join(__dirname, 'public', 'libs');

if (!fs.existsSync(libsDir)) {
  fs.mkdirSync(libsDir, { recursive: true });
}

const resources = [
  {
    url: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    dest: 'marked.min.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js',
    dest: 'katex.min.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css',
    dest: 'katex.min.css'
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
    dest: 'highlight.min.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css',
    dest: 'github-dark.min.css'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/lucide@0.395.0/dist/umd/lucide.min.js',
    dest: 'lucide.min.js'
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs/loader.min.js',
    dest: 'loader.min.js'
  }
];

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirect
        download(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (Status Code: ${res.statusCode})`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${path.basename(destPath)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log('Downloading frontend libraries locally...');
  for (const r of resources) {
    const destPath = path.join(libsDir, r.dest);
    try {
      await download(r.url, destPath);
    } catch (e) {
      console.error(`Error downloading ${r.url}:`, e.message);
    }
  }
  console.log('Finished downloading libraries.');
}

run();
