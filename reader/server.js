const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const bookDir = path.resolve(__dirname, '../book');
const backupDir = path.resolve(__dirname, 'backups');

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' })); // Support large markdown files
app.use(express.static(path.join(__dirname, 'public')));

// Ensure folders exist
if (!fs.existsSync(bookDir)) {
  console.error(`Error: Book directory not found at ${bookDir}`);
  process.exit(1);
}
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Copy new cropped favicon if it exists in system artifacts
const croppedFaviconSrc = '/Users/kostantinkrivula/.gemini/antigravity-ide/brain/4f2261be-1e29-4c6f-bbdd-e005fe4e8d83/favicon_upward_chart_1784458344748.png';
const faviconDest = path.join(__dirname, 'public/favicon.png');
if (fs.existsSync(croppedFaviconSrc)) {
  try {
    fs.copyFileSync(croppedFaviconSrc, faviconDest);
    console.log('Favicon successfully updated to the cropped no-background version.');
  } catch (err) {
    console.error(`Favicon copy error: ${err.message}`);
  }
}

// Helper to check path safety (prevent directory traversal)
const getSafePath = (filename) => {
  const resolved = path.resolve(bookDir, filename);
  if (!resolved.startsWith(bookDir)) {
    throw new Error('Directory traversal attempt detected');
  }
  return resolved;
};

// API: Get all chapters
app.get('/api/chapters', (req, res) => {
  try {
    const files = fs.readdirSync(bookDir).filter(file => file.endsWith('.md'));
    
    // Sort logic: index.md -> schema.md -> log.md -> Chapters numerically
    const priorityOrder = ['index.md', 'schema.md', 'log.md'];
    files.sort((a, b) => {
      const idxA = priorityOrder.indexOf(a);
      const idxB = priorityOrder.indexOf(b);
      
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      
      // Extract numbers for chapters, e.g., "Розділ 1" -> 1
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });

    const chapters = files.map(file => {
      const stats = fs.statSync(path.join(bookDir, file));
      
      // Generate clean title
      let title = file.replace('.md', '');
      return {
        filename: file,
        title: title,
        size: stats.size,
        mtime: stats.mtime
      };
    });

    res.json(chapters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get single chapter content
app.get('/api/chapters/:name', (req, res) => {
  try {
    const safePath = getSafePath(req.params.name);
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(safePath, 'utf-8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Update chapter content (with auto-backup)
app.post('/api/chapters/:name', (req, res) => {
  try {
    const { content } = req.body;
    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const safePath = getSafePath(req.params.name);
    
    // 1. Create backup of current file if it exists
    if (fs.existsSync(safePath)) {
      const currentContent = fs.readFileSync(safePath, 'utf-8');
      
      // Clean filename for backup file (replace spaces/special chars)
      const sanitizedName = req.params.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const backupPath = path.join(backupDir, `${sanitizedName}.${timestamp}.bak`);
      
      fs.writeFileSync(backupPath, currentContent, 'utf-8');
      console.log(`Backup created: ${backupPath}`);
    }

    // 2. Write new content
    fs.writeFileSync(safePath, content, 'utf-8');
    res.json({ success: true, message: 'File saved successfully' });
  } catch (error) {
    console.error(`Save error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`==================================================`);
    console.log(`📚 Crypto Textbook Reader/Editor is running!`);
    console.log(`🔗 Local URL: http://localhost:${port}`);
    console.log(`📂 Textbook Dir: ${bookDir}`);
    console.log(`📂 Backups Dir: ${backupDir}`);
    console.log(`==================================================`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(err);
    }
  });
};

startServer(PORT);
