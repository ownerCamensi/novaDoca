# NovaJS Docs — Documentation Site

Official documentation site for the NovaJS WebGL2 engine.

## Stack

- **Express** — web server
- **Multer** — markdown file uploads
- **jsonwebtoken** — admin auth (JWT)
- **uuid** — unique doc IDs
- **marked.js** (CDN) — client-side markdown rendering
- **docs.json** — flat file storage (no database needed)

## Setup

```bash
npm install
npm start
# → http://localhost:3000
```

## Default Admin Credentials

```
Username: admin
Password: novajs2024
```

Change these via environment variables before deploying:

```bash
ADMIN_USER=yourname ADMIN_PASS=yourpassword JWT_SECRET=your-secret node server.js
```

## How It Works

### Public Users
- Visit `/` to read docs
- No account needed
- Sidebar shows all uploaded docs grouped by category
- Full markdown rendering (code blocks, tables, etc.)

### Admin
- Visit `/admin` → login
- Upload `.md` files with a title, category, optional description and display order
- Delete docs with one click
- JWT token stored in localStorage, expires in 12h

## File Structure

```
novajs-docs/
├── server.js          ← Express server + all API routes
├── package.json
├── data/
│   └── docs.json      ← Doc metadata (auto-managed)
├── uploads/           ← Uploaded .md files (auto-created)
└── public/
    ├── index.html     ← Public documentation reader
    └── admin.html     ← Admin login + dashboard
```

## API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/admin/login` | No | Get JWT token |
| GET | `/api/admin/verify` | Yes | Check token |
| GET | `/api/admin/stats` | Yes | Doc/category counts |
| GET | `/api/docs` | No | List all docs |
| GET | `/api/docs/:id` | No | Get doc + content |
| POST | `/api/docs` | Yes | Upload new doc |
| PUT | `/api/docs/:id` | Yes | Update metadata |
| DELETE | `/api/docs/:id` | Yes | Delete doc + file |
