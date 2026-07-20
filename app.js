// ==========================================================================
// Crypto Scalping Textbook Reader - Application Logic
// ==========================================================================

// Application state
const state = {
  chapters: [],
  activeChapter: null,
  editor: null,
  currentMode: 'read', // 'read' | 'edit' | 'split'
  autosaveEnabled: true,
  searchIndex: [], // Local cache of { filename, title, content } for offline searching
  lastSavedContent: '',
  autosaveTimer: null,
  // Detect if we are hosted on a static server (like GitHub Pages) or local filesystem
  isStaticMode: !['localhost', '127.0.0.1'].includes(window.location.hostname) && 
                !window.location.hostname.startsWith('192.168.') && 
                !window.location.hostname.startsWith('10.') && 
                !window.location.hostname.startsWith('172.')
};

// DOM Elements
const elements = {
  chapterList: document.getElementById('chapter-list'),
  currentTitle: document.getElementById('current-title'),
  currentCategory: document.getElementById('current-category'),
  readerPanel: document.getElementById('reader-panel'),
  readerContent: document.getElementById('reader-content'),
  editorPanel: document.getElementById('editor-panel'),
  outlineList: document.getElementById('outline-list'),
  
  // Buttons & Mode Controls
  sidebarToggle: document.getElementById('sidebar-toggle'),
  sidebar: document.querySelector('.sidebar'),
  themeToggle: document.getElementById('theme-toggle'),
  modeRead: document.getElementById('mode-read'),
  modeEdit: document.getElementById('mode-edit'),
  modeSplit: document.getElementById('mode-split'),
  autosaveToggle: document.getElementById('autosave-toggle'),
  saveBtn: document.getElementById('save-btn'),
  
  // Search
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  searchResultsPanel: document.getElementById('search-results-panel'),
  searchResultsList: document.getElementById('search-results-list'),
  searchQueryDisplay: document.getElementById('search-query-display'),
  closeSearch: document.getElementById('close-search'),
  
  // Toasts
  toastContainer: document.getElementById('toast-container')
};

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initLucide();
  initTheme();
  initMonaco();
  loadChapterList();
  setupEventListeners();
});

// Init Lucide icons
function initLucide() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Init theme (dark by default)
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);
}

function updateThemeUI(theme) {
  if (state.editor) {
    state.editor.updateOptions({
      theme: theme === 'dark' ? 'vs-dark' : 'vs'
    });
  }
}

// Initialize Monaco Editor
function initMonaco() {
  if (state.isStaticMode) return;
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' } });
  
  require(['vs/editor/editor.main'], () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    state.editor = monaco.editor.create(document.getElementById('monaco-container'), {
      value: '',
      language: 'markdown',
      theme: isDark ? 'vs-dark' : 'vs',
      automaticLayout: true,
      wordWrap: 'on',
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: 'Inter, monospace',
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8
      }
    });

    // Sync content changes
    state.editor.onDidChangeModelContent(() => {
      onEditorChange();
    });

    console.log('Monaco Editor loaded successfully');
  });
}

// ==========================================================================
// Event Listeners
// ==========================================================================
function setupEventListeners() {
  // Configure UI for static mode
  if (state.isStaticMode) {
    if (elements.modeEdit) elements.modeEdit.style.display = 'none';
    if (elements.modeSplit) elements.modeSplit.style.display = 'none';
    const autosaveWrapper = document.querySelector('.autosave-wrapper');
    if (autosaveWrapper) autosaveWrapper.style.display = 'none';
    if (elements.saveBtn) elements.saveBtn.style.display = 'none';
    
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');
    if (statusText) statusText.textContent = 'Онлайн-версія';
    if (statusDot) {
      statusDot.style.backgroundColor = 'var(--accent-color, #38bdf8)';
      statusDot.style.boxShadow = '0 0 8px var(--accent-color, #38bdf8)';
    }
  }

  // Sidebar toggler
  elements.sidebarToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.innerWidth <= 768) {
      elements.sidebar.classList.toggle('active');
    } else {
      elements.sidebar.classList.toggle('collapsed');
    }
  });

  // Close sidebar drawer on mobile when clicking on main content
  document.querySelector('.main-content').addEventListener('click', () => {
    if (window.innerWidth <= 768 && elements.sidebar.classList.contains('active')) {
      elements.sidebar.classList.remove('active');
    }
  });

  // Close sidebar drawer on mobile when clicking on a chapter item
  elements.chapterList.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && (e.target.closest('.chapter-list-item') || e.target.closest('a'))) {
      elements.sidebar.classList.remove('active');
    }
  });

  // Theme toggle
  elements.themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeUI(newTheme);
  });

  // Mode selectors
  [elements.modeRead, elements.modeEdit, elements.modeSplit].forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.getAttribute('data-mode');
      setWorkspaceMode(mode);
    });
  });

  // Autosave toggle
  elements.autosaveToggle.addEventListener('change', (e) => {
    state.autosaveEnabled = e.target.checked;
    showToast(`Автозбереження ${state.autosaveEnabled ? 'увімкнено' : 'вимкнено'}`, 'info');
  });

  // Manual save button
  elements.saveBtn.addEventListener('click', () => {
    triggerManualSave();
  });

  // Search logic
  elements.searchInput.addEventListener('input', debounce((e) => {
    const query = e.target.value.trim();
    if (query.length > 2) {
      elements.clearSearch.classList.add('visible');
      performSearch(query);
    } else {
      elements.clearSearch.classList.remove('visible');
      elements.searchResultsPanel.classList.add('hidden');
    }
  }, 300));

  elements.clearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.clearSearch.classList.remove('visible');
    elements.searchResultsPanel.classList.add('hidden');
  });

  elements.closeSearch.addEventListener('click', () => {
    elements.searchResultsPanel.classList.add('hidden');
  });

  // Catch clicking on dynamically rendered Wiki Links in reading mode
  elements.readerContent.addEventListener('click', (e) => {
    if (e.target.classList.contains('wiki-link')) {
      e.preventDefault();
      const filename = e.target.getAttribute('data-filename');
      const anchor = e.target.getAttribute('data-anchor');
      
      const found = state.chapters.find(c => c.filename === filename);
      if (found) {
        loadChapter(filename, anchor);
      } else {
        // Try looking up clean filenames
        const cleanName = filename.toLowerCase();
        const foundAlternative = state.chapters.find(c => c.filename.toLowerCase().includes(cleanName) || cleanName.includes(c.filename.toLowerCase()));
        if (foundAlternative) {
          loadChapter(foundAlternative.filename, anchor);
        } else {
          showToast(`Файл ${filename} не знайдено в підручнику`, 'error');
        }
      }
    }
  });

  // Synchronized scrolling in Split view
  let isSyncScrolling = false;
  elements.readerPanel.addEventListener('scroll', () => {
    if (state.currentMode !== 'split' || !state.editor || isSyncScrolling) return;
    isSyncScrolling = true;
    
    // Calculate scroll percentage
    const readerScrollHeight = elements.readerPanel.scrollHeight - elements.readerPanel.clientHeight;
    const readerScrollTop = elements.readerPanel.scrollTop;
    const percentage = readerScrollHeight > 0 ? readerScrollTop / readerScrollHeight : 0;
    
    // Scroll editor
    const editorScrollHeight = state.editor.getScrollHeight() - state.editor.getLayoutInfo().height;
    state.editor.setScrollTop(percentage * editorScrollHeight);
    
    setTimeout(() => { isSyncScrolling = false; }, 50);
  });
}

// ==========================================================================
// Mode Changer
// ==========================================================================
function setWorkspaceMode(mode) {
  state.currentMode = mode;
  
  // Update buttons
  [elements.modeRead, elements.modeEdit, elements.modeSplit].forEach(btn => {
    if (btn.getAttribute('data-mode') === mode) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update layout wrapper classes
  const main = document.querySelector('.main-content');
  if (mode === 'split') {
    main.classList.add('split-mode');
    elements.readerPanel.classList.add('active-panel');
    elements.editorPanel.classList.add('active-panel');
    
    // Live update editor contents to reader in split screen
    updateReaderContent(state.editor.getValue());
  } else {
    main.classList.remove('split-mode');
    if (mode === 'read') {
      elements.readerPanel.classList.add('active-panel');
      elements.editorPanel.classList.remove('active-panel');
      // Update reading render from editor value just in case
      if (state.editor) updateReaderContent(state.editor.getValue());
    } else { // edit mode
      elements.readerPanel.classList.remove('active-panel');
      elements.editorPanel.classList.add('active-panel');
    }
  }

  // Force layout recalculation in Monaco
  if (state.editor) {
    state.editor.layout();
  }
}

// ==========================================================================
// Load Data
// ==========================================================================
async function loadChapterList() {
  try {
    const url = state.isStaticMode ? 'chapters.json' : '/api/chapters';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Не вдалося завантажити список розділів');
    
    state.chapters = await res.json();
    renderChapterList();
    
    // Load first chapter by default
    if (state.chapters.length > 0) {
      const savedFilename = localStorage.getItem('last_active_chapter') || state.chapters[0].filename;
      const found = state.chapters.some(c => c.filename === savedFilename) ? savedFilename : state.chapters[0].filename;
      loadChapter(found);
    }

    // Load search indexes in the background
    preloadSearchIndex();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderChapterList() {
  elements.chapterList.innerHTML = '';
  
  state.chapters.forEach(ch => {
    const li = document.createElement('li');
    if (state.activeChapter && state.activeChapter.filename === ch.filename) {
      li.className = 'active';
    }
    
    // Set category tags based on filename
    let categoryBadge = '';
    let displayName = ch.title;
    
    if (ch.filename.startsWith('Розділ')) {
      const match = ch.title.match(/Розділ\s*(\d+)/i);
      const number = match ? match[1] : '•';
      categoryBadge = `<span class="chapter-number-badge">${number}</span>`;
      displayName = ch.title.replace(/^Розділ\s*\d+\.\s*/i, '');
    } else if (ch.filename === 'index.md') {
      categoryBadge = `<i data-lucide="home" style="width: 14px; height: 14px; margin-right: 4px;"></i>`;
    } else if (ch.filename === 'schema.md') {
      categoryBadge = `<i data-lucide="settings" style="width: 14px; height: 14px; margin-right: 4px;"></i>`;
    } else if (ch.filename === 'log.md') {
      categoryBadge = `<i data-lucide="history" style="width: 14px; height: 14px; margin-right: 4px;"></i>`;
    }

    li.innerHTML = `
      <div class="chapter-list-item ${state.activeChapter && state.activeChapter.filename === ch.filename ? 'active' : ''}" data-file="${ch.filename}">
        ${categoryBadge}
        <span class="chapter-title-text">${displayName}</span>
      </div>
    `;
    
    li.querySelector('.chapter-list-item').addEventListener('click', () => {
      loadChapter(ch.filename);
    });
    
    elements.chapterList.appendChild(li);
  });
  
  initLucide();
}

async function loadChapter(filename, anchor = null) {
  try {
    const url = state.isStaticMode ? `book/${filename}` : `/api/chapters/${filename}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Не вдалося завантажити вміст файлу');
    
    let content;
    if (state.isStaticMode) {
      content = await res.text();
    } else {
      const data = await res.json();
      content = data.content;
    }
    
    // Check if there are unsaved changes on the current active chapter
    if (isContentChanged()) {
      const confirmDiscard = confirm('Ви маєте незбережені зміни! Перейти без збереження?');
      if (!confirmDiscard) return;
    }

    state.activeChapter = state.chapters.find(c => c.filename === filename);
    state.lastSavedContent = content;
    
    localStorage.setItem('last_active_chapter', filename);

    // Update active state in sidebar
    document.querySelectorAll('.chapter-list-item').forEach(item => {
      if (item.getAttribute('data-file') === filename) {
        item.classList.add('active');
        item.parentElement.classList.add('active');
      } else {
        item.classList.remove('active');
        item.parentElement.classList.remove('active');
      }
    });

    // Update headers
    elements.currentTitle.textContent = state.activeChapter.title;
    
    let category = 'Довідник';
    if (filename.startsWith('Розділ')) {
      category = 'Підручник';
    } else if (['index.md', 'schema.md', 'log.md'].includes(filename)) {
      category = 'Системні';
    }
    elements.currentCategory.textContent = category;

    // Load content to editor
    if (state.editor) {
      state.editor.setValue(content);
    } else {
      // Monaco is still loading, wait a bit
      setTimeout(() => {
        if (state.editor) state.editor.setValue(content);
      }, 500);
    }

    // Render HTML in reader
    updateReaderContent(content);
    
    // Generate Outline (TOC)
    generateOutline();
    
    // Save button state
    elements.saveBtn.classList.add('disabled');
    elements.saveBtn.disabled = true;
    
    // Handle anchor links scrolling
    if (anchor) {
      setTimeout(() => {
        scrollToAnchor(anchor);
      }, 300);
    } else {
      elements.readerPanel.scrollTop = 0;
    }

    showToast(`Завантажено: ${state.activeChapter.title}`, 'info');

  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ==========================================================================
// Markdown Rendering Post & Pre-processing
// ==========================================================================
function updateReaderContent(markdownText) {
  // Pre-process markdown: Custom [[Wiki-links]]
  let processedMarkdown = preprocessMarkdown(markdownText);
  
  // Basic markdown render
  let html = marked.parse(processedMarkdown);
  
  // Post-process HTML: GitHub-style blockquotes (alerts)
  let processedHTML = postprocessHTML(html);
  
  elements.readerContent.innerHTML = processedHTML;
  
  // Syntax Highlight code blocks
  elements.readerContent.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
  
  // Re-init Lucide Icons inside the alerts
  initLucide();
}

function preprocessMarkdown(md) {
  // Convert [[wiki-links]] to normal HTML links
  md = md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, p1, p2) => {
    const target = p1.trim();
    const label = p2 ? p2.trim() : target;
    
    // Parse anchor if present (e.g. [[Chapter 1#section]])
    const parts = target.split('#');
    let filename = parts[0].trim();
    const anchor = parts[1] ? '#' + parts[1].trim() : '';
    
    // Auto-append .md to textbook chapters
    if (filename.startsWith('Розділ') && !filename.endsWith('.md')) {
      filename += '.md';
    } else if (['index', 'schema', 'log'].includes(filename) && !filename.endsWith('.md')) {
      filename += '.md';
    }
    
    return `<a class="wiki-link" href="#" data-filename="${filename}" data-anchor="${anchor}">${label}</a>`;
  });
  
  return md;
}

function postprocessHTML(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  
  // Render GitHub-Style alerts inside blockquotes
  const blockquotes = container.querySelectorAll('blockquote');
  blockquotes.forEach(bq => {
    const firstP = bq.querySelector('p');
    if (firstP) {
      const text = firstP.innerHTML;
      const alertTypes = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];
      
      for (const type of alertTypes) {
        const regex = new RegExp(`^\\[!${type}\\]\\s*(?:<br>|\\n)?`, 'i');
        if (regex.test(text)) {
          // Add custom alert classes
          bq.className = `markdown-alert markdown-alert-${type.toLowerCase()}`;
          
          // Alert Icon mapping
          let icon = 'info';
          if (type === 'TIP') icon = 'sparkles';
          if (type === 'WARNING') icon = 'alert-triangle';
          if (type === 'CAUTION') icon = 'alert-octagon';
          if (type === 'IMPORTANT') icon = 'alert-circle';
          
          // Remove tag from paragraph
          firstP.innerHTML = text.replace(regex, '');
          
          // Prepend alert title
          const titleDiv = document.createElement('div');
          titleDiv.className = 'markdown-alert-title';
          titleDiv.innerHTML = `<i data-lucide="${icon}"></i>${type}`;
          bq.insertBefore(titleDiv, firstP);
          break;
        }
      }
    }
  });
  
  return container.innerHTML;
}

// Generate Outline dynamically from headings
function generateOutline() {
  elements.outlineList.innerHTML = '';
  
  const headings = elements.readerContent.querySelectorAll('h1, h2, h3, h4');
  
  if (headings.length === 0) {
    elements.outlineList.innerHTML = '<li class="empty-outline">Немає змісту для цього розділу</li>';
    return;
  }
  
  headings.forEach((heading, idx) => {
    // Ensure every heading has a unique ID for scrolling
    const id = `heading-${idx}`;
    heading.id = id;
    
    const li = document.createElement('li');
    const cleanText = heading.textContent.replace(/\[!.*?\]/g, ''); // strip alert titles if they leak
    
    li.innerHTML = `
      <a class="outline-${heading.tagName.toLowerCase()}" data-target="${id}">
        ${cleanText}
      </a>
    `;
    
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      elements.readerPanel.scrollTo({
        top: heading.offsetTop - 20,
        behavior: 'smooth'
      });
      
      // Update active state in outline
      document.querySelectorAll('#outline-list a').forEach(a => a.classList.remove('active-outline'));
      e.target.classList.add('active-outline');
    });
    
    elements.outlineList.appendChild(li);
  });
}

function scrollToAnchor(anchor) {
  // Convert markdown-anchor link name to clean string (e.g. #6-концепція -> text-match)
  const decodedAnchor = decodeURIComponent(anchor.replace('#', '')).toLowerCase();
  
  // Find heading with match
  const headings = elements.readerContent.querySelectorAll('h1, h2, h3, h4');
  let matchHeading = null;
  
  for (const h of headings) {
    const textClean = h.textContent.toLowerCase().replace(/[^a-z0-9а-яіїєґ]/gi, '-');
    if (textClean.includes(decodedAnchor) || decodedAnchor.includes(textClean)) {
      matchHeading = h;
      break;
    }
  }
  
  if (matchHeading) {
    elements.readerPanel.scrollTo({
      top: matchHeading.offsetTop - 20,
      behavior: 'smooth'
    });
  }
}

// ==========================================================================
// Editor Content Tracking & Autosave
// ==========================================================================
function onEditorChange() {
  if (!state.editor || !state.activeChapter) return;
  
  const currentContent = state.editor.getValue();
  
  // Split Mode live render
  if (state.currentMode === 'split') {
    updateReaderContent(currentContent);
  }
  
  // Check if content differs from disk
  if (currentContent !== state.lastSavedContent) {
    elements.saveBtn.classList.remove('disabled');
    elements.saveBtn.disabled = false;
    
    // Trigger autosave if enabled
    if (state.autosaveEnabled) {
      clearTimeout(state.autosaveTimer);
      state.autosaveTimer = setTimeout(() => {
        saveActiveChapter(currentContent);
      }, 3000); // 3 seconds delay
    }
  } else {
    elements.saveBtn.classList.add('disabled');
    elements.saveBtn.disabled = true;
  }
}

function isContentChanged() {
  if (!state.editor) return false;
  return state.editor.getValue() !== state.lastSavedContent;
}

function triggerManualSave() {
  if (!state.editor || !state.activeChapter) return;
  const content = state.editor.getValue();
  saveActiveChapter(content);
}

async function saveActiveChapter(content) {
  if (!state.activeChapter) return;
  
  try {
    const filename = state.activeChapter.filename;
    const res = await fetch(`/api/chapters/${filename}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
    
    if (!res.ok) throw new Error('Помилка при збереженні файлу');
    
    state.lastSavedContent = content;
    elements.saveBtn.classList.add('disabled');
    elements.saveBtn.disabled = true;
    
    // Update offline search index for this file
    const searchIdx = state.searchIndex.findIndex(item => item.filename === filename);
    if (searchIdx !== -1) {
      state.searchIndex[searchIdx].content = content;
    }
    
    showToast('Зміни успішно збережено + створено резервну копію', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ==========================================================================
// Offline Indexing & Global Search
// ==========================================================================
async function preloadSearchIndex() {
  state.searchIndex = [];
  
  // Background parallel downloads for instant searching
  const promises = state.chapters.map(async (ch) => {
    try {
      const url = state.isStaticMode ? `book/${ch.filename}` : `/api/chapters/${ch.filename}`;
      const res = await fetch(url);
      if (res.ok) {
        let content;
        if (state.isStaticMode) {
          content = await res.text();
        } else {
          const data = await res.json();
          content = data.content;
        }
        state.searchIndex.push({
          filename: ch.filename,
          title: ch.title,
          content: content
        });
      }
    } catch (e) {
      console.warn(`Failed to preload search index for ${ch.filename}`);
    }
  });
  
  await Promise.all(promises);
  console.log(`Global search indexing complete: cached ${state.searchIndex.length} chapters.`);
}

function performSearch(query) {
  const cleanQuery = query.toLowerCase();
  elements.searchQueryDisplay.textContent = query;
  elements.searchResultsList.innerHTML = '';
  
  const results = [];
  
  state.searchIndex.forEach(item => {
    const content = item.content.toLowerCase();
    const idx = content.indexOf(cleanQuery);
    
    if (idx !== -1 || item.title.toLowerCase().includes(cleanQuery)) {
      // Extract small snippet around match
      const start = Math.max(0, idx - 60);
      const end = Math.min(item.content.length, idx + query.length + 100);
      let snippet = item.content.substring(start, end);
      
      // Clean up markdown markers from snippet for clean view
      snippet = snippet.replace(/[#*`_\[\]]/g, ' ');
      
      // Highlight query with HTML <mark>
      const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
      const highlightedSnippet = snippet.replace(regex, '<mark>$1</mark>');
      
      results.push({
        filename: item.filename,
        title: item.title,
        snippet: highlightedSnippet
      });
    }
  });
  
  if (results.length === 0) {
    elements.searchResultsList.innerHTML = '<div class="no-results">Нічого не знайдено за вашим запитом</div>';
  } else {
    results.forEach(res => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `
        <div class="result-title">${res.title}</div>
        <div class="result-snippet">... ${res.snippet} ...</div>
      `;
      div.addEventListener('click', () => {
        elements.searchResultsPanel.classList.add('hidden');
        elements.searchInput.value = '';
        elements.clearSearch.classList.remove('visible');
        loadChapter(res.filename);
      });
      elements.searchResultsList.appendChild(div);
    });
  }
  
  elements.searchResultsPanel.classList.remove('hidden');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==========================================================================
// Toast Alerts System
// ==========================================================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'x-circle';
  
  toast.innerHTML = `
    <i data-lucide="${icon}" class="toast-icon"></i>
    <span>${message}</span>
  `;
  
  elements.toastContainer.appendChild(toast);
  initLucide();
  
  // Auto remove toast after 4.5 seconds
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4500);
}

// ==========================================================================
// Helpers
// ==========================================================================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
