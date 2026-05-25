const express  = require('express');
const multer   = require('multer');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs       = require('fs');
const path     = require('path');

const app = express();

// ── Config ────────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'novajs-secret-key-change-in-prod';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'novajs-20';
const DATA_FILE  = path.join(__dirname, 'data', 'docs.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ── Ensure dirs/files exist ───────────────────────────────────────────────────
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ docs: [] }, null, 2));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded MD files as static (for direct access)
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Multer — only accept .md files ────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.md') {
      return cb(new Error('Only .md (Markdown) files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const readDocs  = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeDocs = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// ── JWT middleware ────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.admin = jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, username, expiresIn: '12h' });
});

// GET /api/admin/verify  — check if token still valid
app.get('/api/admin/verify', requireAuth, (req, res) => {
  res.json({ valid: true, admin: req.admin });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCS ROUTES — Public (read)
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/docs — list all docs (metadata only)
app.get('/api/docs', (req, res) => {
  const { docs } = readDocs();
  // Strip file paths from public response
  const safe = docs.map(({ id, title, category, description, createdAt, updatedAt, order }) =>
    ({ id, title, category, description, createdAt, updatedAt, order })
  );
  res.json({ docs: safe });
});

// GET /api/docs/:id — get a single doc with its content
app.get('/api/docs/:id', (req, res) => {
  const { docs } = readDocs();
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ error: 'Doc not found' });

  // Read the actual MD file
  try {
    const content = fs.readFileSync(path.join(UPLOAD_DIR, doc.filename), 'utf8');
    res.json({ ...doc, content });
  } catch {
    res.status(500).json({ error: 'Could not read file' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCS ROUTES — Admin (write)
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/docs — upload a new doc
app.post('/api/docs', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { title, category, description, order } = req.body;
  if (!title || !category) {
    // Clean up the orphaned upload
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'title and category are required' });
  }

  const data = readDocs();
  const doc = {
    id:          uuidv4(),
    title:       title.trim(),
    category:    category.trim(),
    description: (description || '').trim(),
    order:       parseInt(order) || data.docs.length + 1,
    filename:    req.file.filename,
    originalName: req.file.originalname,
    size:        req.file.size,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  data.docs.push(doc);
  writeDocs(data);

  console.log(`[NovaJS Docs] Uploaded: "${doc.title}" (${doc.id})`);
  res.status(201).json({ message: 'Doc uploaded', doc });
});

// PUT /api/docs/:id — update metadata (not file)
app.put('/api/docs/:id', requireAuth, (req, res) => {
  const data = readDocs();
  const idx  = data.docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Doc not found' });

  const { title, category, description, order } = req.body;
  const doc = data.docs[idx];

  if (title)       doc.title       = title.trim();
  if (category)    doc.category    = category.trim();
  if (description !== undefined) doc.description = description.trim();
  if (order)       doc.order       = parseInt(order);
  doc.updatedAt = new Date().toISOString();

  writeDocs(data);
  res.json({ message: 'Updated', doc });
});

// DELETE /api/docs/:id
app.delete('/api/docs/:id', requireAuth, (req, res) => {
  const data = readDocs();
  const idx  = data.docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Doc not found' });

  const [doc] = data.docs.splice(idx, 1);

  // Delete the actual file
  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, doc.filename));
  } catch {
    console.warn(`[NovaJS Docs] Could not delete file: ${doc.filename}`);
  }

  writeDocs(data);
  console.log(`[NovaJS Docs] Deleted: "${doc.title}" (${doc.id})`);
  res.json({ message: 'Deleted', id: doc.id });
});

// GET /api/docs/stats — admin stats
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const { docs } = readDocs();
  const categories = [...new Set(docs.map(d => d.category))];
  res.json({
    totalDocs: docs.length,
    categories: categories.length,
    categoryList: categories,
    recentDocs: docs.slice(-5).reverse()
  });
});

// ── Fallback to index.html for SPA-like nav ───────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[NovaJS Docs Error]', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n✦ NovaJS Docs running on http://localhost:${PORT}`);
  console.log(`  Admin panel → http://localhost:${PORT}/admin`);
  console.log(`  Admin login → ${ADMIN_USER} / ${ADMIN_PASS}\n`);
});
