
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/project1', express.static(path.join(__dirname, '../project1')));
app.use('/project2', express.static(path.join(__dirname, '../project2')));
app.use('/project3', express.static(path.join(__dirname, '../project3')));
app.use('/project4', express.static(path.join(__dirname, '../project4')));
app.use('/project5', express.static(path.join(__dirname, '../project5')));

app.get('/', (req, res) => res.redirect('/project1/index.html'));

const db = new sqlite3.Database('./school.db', (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('✅ Connected to SQLite database');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name TEXT NOT NULL,
    father_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    mobile TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    password TEXT NOT NULL
  )`);

  // ✅ UPDATED: gallery table ab media_type column ke saath (image ya video)
  db.run(`CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    media_type TEXT DEFAULT 'image',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Purani gallery table me media_type column add karo agar nahi hai
  db.run(`ALTER TABLE gallery ADD COLUMN media_type TEXT DEFAULT 'image'`, () => {});

  const hashedPw = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO admins (id, admin_name, mobile, password) VALUES (1, 'Admin', '9236942184', ?)`, [hashedPw]);
});

// ✅ UPDATED: Multer storage - images aur videos dono ke liye
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedImages = /jpeg|jpg|png|gif|webp/;
    const allowedVideos = /mp4|webm|ogg|mov|avi|mkv/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowedImages.test(ext) || allowedVideos.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Sirf image (JPG, PNG, GIF, WEBP) aur video (MP4, WEBM, MOV) files allowed hain!'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max (videos ke liye)
});

// Student Register
app.post('/api/register', async (req, res) => {
  const { student_name, father_name, email, mobile, password } = req.body;
  if (!student_name || !father_name || !email || !mobile || !password)
    return res.json({ success: false, message: 'All fields are required!' });
  const hashed = bcrypt.hashSync(password, 10);
  db.run(
    `INSERT INTO students (student_name, father_name, email, mobile, password) VALUES (?,?,?,?,?)`,
    [student_name, father_name, email, mobile, hashed],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.json({ success: false, message: 'Email already registered!' });
        return res.json({ success: false, message: 'Registration failed!' });
      }
      res.json({ success: true, message: 'Registration successful! You can now login.' });
    }
  );
});

// Student Login
app.post('/api/login', (req, res) => {
  const { student_name, mobile, password } = req.body;
  if (!student_name || !mobile || !password)
    return res.json({ success: false, message: 'All fields are required!' });
  db.get(`SELECT * FROM students WHERE student_name=? AND mobile=?`, [student_name, mobile], (err, row) => {
    if (err || !row) return res.json({ success: false, message: 'Student not found!' });
    if (!bcrypt.compareSync(password, row.password))
      return res.json({ success: false, message: 'Incorrect password!' });
    res.json({ success: true, message: `Welcome back, ${row.student_name}!` });
  });
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { admin_name, mobile, password } = req.body;
  if (!admin_name || !mobile || !password)
    return res.json({ success: false, message: 'All fields are required!' });
  db.get(`SELECT * FROM admins WHERE admin_name=? AND mobile=?`, [admin_name, mobile], (err, row) => {
    if (err || !row) return res.json({ success: false, message: 'Admin not found!' });
    if (!bcrypt.compareSync(password, row.password))
      return res.json({ success: false, message: 'Incorrect password!' });
    res.json({ success: true, message: 'Admin login successful!', adminId: row.id });
  });
});

// ✅ UPDATED: Upload Image ya Video
app.post('/api/upload', upload.single('media'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: 'Koi file upload nahi hui!' });

  const videoExts = /mp4|webm|ogg|mov|avi|mkv/;
  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const mediaType = videoExts.test(ext) ? 'video' : 'image';

  db.run(
    `INSERT INTO gallery (filename, original_name, media_type) VALUES (?,?,?)`,
    [req.file.filename, req.file.originalname, mediaType],
    function (err) {
      if (err) return res.json({ success: false, message: 'Upload database error!' });
      res.json({
        success: true,
        message: `${mediaType === 'video' ? 'Video' : 'Image'} upload ho gayi!`,
        filename: req.file.filename,
        media_type: mediaType
      });
    }
  );
});

// Get Gallery
app.get('/api/gallery', (req, res) => {
  db.all(`SELECT * FROM gallery ORDER BY uploaded_at DESC`, [], (err, rows) => {
    if (err) return res.json({ success: false, images: [] });
    res.json({ success: true, images: rows });
  });
});

// Delete Image/Video
app.delete('/api/gallery/:id', (req, res) => {
  db.get(`SELECT * FROM gallery WHERE id=?`, [req.params.id], (err, row) => {
    if (!row) return res.json({ success: false, message: 'File not found!' });
    const filePath = path.join(__dirname, 'uploads', row.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.run(`DELETE FROM gallery WHERE id=?`, [req.params.id], (err) => {
      if (err) return res.json({ success: false, message: 'Delete failed!' });
      res.json({ success: true, message: 'File delete ho gayi!' });
    });
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Website chal rahi hai: http://localhost:${PORT}`);
  console.log(`   Home     → http://localhost:${PORT}/project1/index.html`);
  console.log(`   Register → http://localhost:${PORT}/project2/index.html`);
  console.log(`   Login    → http://localhost:${PORT}/project3/index.html`);
  console.log(`   Admin    → http://localhost:${PORT}/project4/index.html`);
  console.log(`   Gallery  → http://localhost:${PORT}/project5/index.html`);
  console.log(`\n   Admin Login: Name= Owner | Mobile=9236942184 | Pass=admin184\n`);
});