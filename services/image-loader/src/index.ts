import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import archiver from 'archiver';
import { connectDB, ImageModel, CanvasModel } from './db.js';
import { saveFile, makeThumb, getFilePath, ensureDirs } from './storage.js';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import { asyncWrap, errorMiddleware } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());
app.use(morgan('dev'));

const PORT = CONFIG.PORT;
const SCALER_URL = CONFIG.SCALER_URL;
const SELF_BASE = `http://127.0.0.1:${PORT}`;
const INTERNAL_GALLERY_DIR = process.env.INTERNAL_GALLERY_DIR || '/internal-gallery';
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
const PUBLIC_DIR = path.resolve('public');

app.use('/static', express.static(PUBLIC_DIR));

// раздаём статически всё из /public/ui по префиксу /ui
app.use('/ui', express.static(CONFIG.PATHS.uiDir, {
  index: 'index.html',
  extensions: ['html']
}));

// ВАЖНО: /app/public примонтирован, поэтому используем процессную папку
app.use('/internal-gallery', express.static(path.resolve(process.cwd(), 'public/internal-gallery')));

connectDB().catch(err => console.error('[image-loader] connectDB failed', err));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type'));
  }
});

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'image-loader', port: PORT })
);

app.get('/internal-gallery/list', async (_req, res) => {
  try {
    const dir = path.resolve(process.cwd(), 'public/internal-gallery');
    const allow = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']); // регистронезависим
    let entries: string[] = [];
    try {
      entries = await fs.promises.readdir(dir);
    } catch {
      return res.json([]); // если папки нет — пусто (не 500)
    }
    const items = entries
      .filter(n => allow.has(path.extname(n).toLowerCase()))
      .map(name => ({
        name,
        url: `/internal-gallery/${encodeURIComponent(name)}`
      }));
    res.json(items);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.get('/internal-gallery/file/:name', (req, res) => {
  const p = path.join(INTERNAL_GALLERY_DIR, req.params.name);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// Upload via form-data: field "file"
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    await connectDB();
    ensureDirs();

    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
    const filename = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
    const savedPath = await saveFile(req.file.buffer, filename);

    const meta = await sharp(savedPath).metadata();
    const { thumbName } = await makeThumb(savedPath, filename);

    const doc = await ImageModel.create({
      originalName: req.file.originalname,
      filename,
      mime: req.file.mimetype,
      size: req.file.size,
      width: meta.width || null,
      height: meta.height || null,
      thumb: thumbName,
    });

    res.status(201).json({
      id: doc._id,
      filename,
      thumb: thumbName,
      width: doc.width,
      height: doc.height,
      mime: doc.mime,
      size: doc.size
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'upload failed' });
  }
});

// Импорт из внутренней галереи в проект (как будто загрузили)
app.post('/internal-gallery/import', async (req, res) => {
  try {
    await connectDB();

    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });

    // Берём файл из public/internal-gallery (рабочая папка контейнера)
    const srcDir  = path.resolve(process.cwd(), 'public/internal-gallery');
    const srcPath = path.join(srcDir, name);
    if (!fs.existsSync(srcPath)) {
      return res.status(404).json({ error: 'file not found', name, srcPath });
    }

    // Читаем и получаем метаданные
    const input = await fs.promises.readFile(srcPath);
    const meta  = await sharp(input).metadata();
    const mime  = (meta.format === 'png')  ? 'image/png'
                : (meta.format === 'jpeg') ? 'image/jpeg'
                : (meta.format === 'webp') ? 'image/webp'
                : (meta.format === 'gif')  ? 'image/gif'
                : 'application/octet-stream';

    // Генерация имён и каталогов
    const ts   = Date.now();
    const base = `${ts}_${Math.random().toString(16).slice(2, 10)}`;
    const outDir   = path.resolve(process.cwd(), 'uploads');
    const thumbsDir= path.resolve(process.cwd(), 'public', 'thumbs');
    await fs.promises.mkdir(outDir,    { recursive: true });
    await fs.promises.mkdir(thumbsDir, { recursive: true });

    const outName   = `${base}${path.extname(name).toLowerCase() || '.jpg'}`;
    const thumbName = `${base}_thumb.jpg`;
    const outPath   = path.join(outDir, outName);
    const thumbPath = path.join(thumbsDir, thumbName);

    // Записываем оригинал
    await fs.promises.writeFile(outPath, input);

    // Делаем превью
    await sharp(input).resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    // Сохраняем в БД
    const doc = await ImageModel.create({
      originalName: name,
      filename: outName,
      mime,
      size: input.length,
      width:  meta.width  || null,
      height: meta.height || null,
      thumb: thumbName
    });

    res.json({
      id: String(doc._id),
      filename: outName,
      thumb: thumbName,
      width: doc.width,
      height: doc.height,
      mime
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// List images (gallery)
app.get('/images', asyncWrap(async (req, res) => {
  const page  = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 12)));
  const q     = String(req.query.q || '').trim();
  const mime  = String(req.query.mime || '').trim();
  
  const sort  = (req.query.sort === 'oldest')
  ? ({ createdAt: 1 as const })
  : ({ createdAt: -1 as const });

  const filter: any = {};
  if (q)   filter.$text = { $search: q };
  if (mime) filter.mime = mime;

  const total = await ImageModel.countDocuments(filter);
  const items = await ImageModel
    .find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({ items, page, pages: Math.ceil(total / limit), total });
}));

// Очистить все загруженные изображения (dev-утилита)
app.delete('/images', async (_req, res) => {
  try {
    await connectDB();
    const list = await ImageModel.find({}, { filename: 1, thumb: 1 });

    for (const it of list) {
      const ff = [ (it as any).filename, (it as any).thumb ].filter(Boolean);
      for (const f of ff) {
        const pFull = getFilePath(String(f), f === (it as any).thumb);
        if (fs.existsSync(pFull)) {
          try { await fs.promises.unlink(pFull); } catch {}
        }
      }
    }
    const r = await ImageModel.deleteMany({});
    res.json({ deleted: r.deletedCount ?? 0 });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Удаление одного изображения по id
app.delete('/images/:id', async (req, res) => {
  try {
    await connectDB();

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id required' });

    // найдём doc, чтобы удалить файлы на диске
    const doc = await ImageModel.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'not found' });

    const filesToRemove = [doc.filename, doc.thumb].filter(Boolean) as string[];
    for (const f of filesToRemove) {
      const full = getFilePath(f, f === doc.thumb);
      // fs уже импортирован выше
      if (fs.existsSync(full)) {
        try { await fs.promises.unlink(full); } catch {}
      }
    }

    await ImageModel.deleteOne({ _id: id });

    res.json({ ok: true, deleted: 1, id });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Serve file or thumbnail by id
app.get('/images/:id/:kind', async (req, res) => {
  try {
    await connectDB();
    const doc = await ImageModel.findById(req.params.id);
    if (!doc) return res.status(404).end();

    const isThumb = req.params.kind === 'thumb';
    const fname = (isThumb ? doc.thumb : doc.filename) ?? null; // guard
    if (!fname) return res.status(404).json({ error: 'file not available' });

    const p = getFilePath(String(fname), isThumb);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.sendFile(p);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/project/canvas', asyncWrap(async (req, res) => {
  await connectDB();

  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });

  const found = await CanvasModel.findOne({ imageId: id }).lean();
  if (!found) return res.json({ id, canvas: null, updatedAt: null });

  res.json({ id, canvas: found.params || null, updatedAt: found.updatedAt || null });
}));

// Raw by filename (optional)
app.get('/file/:filename', (req, res) => {
  try {
    const isThumb = !!req.query.thumb;
    const p = getFilePath(req.params.filename, isThumb);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.sendFile(p);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Прокси к scaler (чтобы UI стучался только в image-loader)
app.post('/proxy-scale-by-id', async (req, res) => {
  try {
    const r = await fetch(`${SCALER_URL}/scale/by-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {})
    });

    const txt = await r.text();
    res
      .status(r.status)
      .set('content-type', r.headers.get('content-type') || 'application/json')
      .send(txt);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/proxy-scale-by-mm', async (req, res) => {
  try {
    const r = await fetch(`${SCALER_URL}/scale/by-mm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {})
    });

    const txt = await r.text();
    res
      .status(r.status)
      .set('content-type', r.headers.get('content-type') || 'application/json')
      .send(txt);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/project/save-canvas', asyncWrap(async (req, res) => {
  await connectDB();

  const body = req.body || {};
  const id = String(body.id || '').trim();
  const canvas = body.canvas || {};

  if (!id) return res.status(400).json({ error: 'id required' });

  const units = (canvas.units === 'mm') ? 'mm' : 'px';
  const width = Number(canvas.width || 0);
  const height = Number(canvas.height || 0);
  const dpi = units === 'mm' ? Number(canvas.dpi || 300) : undefined;

  const fitOptions = ['contain','cover','fill','inside','outside'] as const;
  const fit = fitOptions.includes(canvas.fit) ? canvas.fit : 'contain';
  const background = String(canvas.background || '#ffffff');

  if (!width || !height) {
    return res.status(400).json({ error: 'canvas.width and canvas.height required' });
  }

  const doc = {
    imageId: id,
    params: { units, width, height, dpi, fit, background },
    updatedAt: new Date()
  };

  await CanvasModel.updateOne({ imageId: id }, { $set: doc }, { upsert: true });
  res.json({ ok: true, id, canvas: doc.params, updatedAt: doc.updatedAt });
}));


/**
 * Экспорт проекта в .mosaic (ZIP)
 * Body: {
 *   id: string,
 *   canvas: { units:"px"|"mm", width:number, height:number, dpi?:number, fit:"contain"|"cover"|"fill"|"inside"|"outside", background:string },
 *   scaling: { kernel:"nearest"|"lanczos3", format:"png"|"jpeg"|"webp", quality:number }
 * }
 */
app.post('/project/export', async (req, res) => {
  try {
    const body = req.body || {};
    const { id, canvas, scaling } = body;

    // валидация
    if (!id) return res.status(400).json({ error: 'id required' });
    if (!canvas || !canvas.width || !canvas.height) {
      return res.status(400).json({ error: 'canvas.width, canvas.height required' });
    }

    const units = canvas.units === 'mm' ? 'mm' : 'px';
    const width = Number(canvas.width);
    const height = Number(canvas.height);
    const dpi = units === 'mm' ? Number(canvas.dpi || 300) : undefined;
    const fit = canvas.fit || 'contain';
    const background = canvas.background || '#ffffff';

    const kernel = (scaling?.kernel === 'nearest') ? 'nearest' : 'lanczos3';
    const format = (scaling?.format === 'png' || scaling?.format === 'webp') ? scaling.format : 'jpeg';
    const quality = Math.max(1, Math.min(100, Number(scaling?.quality || 92)));

    // 1) тянем оригинал у себя же
    const origResp = await fetch(`${SELF_BASE}/images/${encodeURIComponent(id)}/original`);
    if (!origResp.ok) {
      const txt = await origResp.text();
      return res.status(404).json({ error: `original not found: ${txt}` });
    }
    const origMime = origResp.headers.get('content-type') || 'image/jpeg';
    const origBuf = Buffer.from(await origResp.arrayBuffer());

    // 2) получаем предпросмотр через scaler
    let previewDataUrl: string;
    if (units === 'px') {
      const pr = await fetch(`${SCALER_URL}/scale/by-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, width, height, fit, background, format, quality, kernel })
      });
      if (!pr.ok) {
        const t = await pr.text(); 
        return res.status(500).json({ error: `scaler(px) failed: ${t}` });
      }
      const j = await pr.json();
      previewDataUrl = j.imageBase64;
    } else {
      // mm → px через dpi (scaler сам пересчитает, если вызовем by-mm)
      const b64 = origBuf.toString('base64');
      const imageBase64 = `data:${origMime};base64,${b64}`;
      const pr = await fetch(`${SCALER_URL}/scale/by-mm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mmWidth: width, mmHeight: height, dpi, fit, background, format, quality, kernel })
      });
      if (!pr.ok) {
        const t = await pr.text(); 
        return res.status(500).json({ error: `scaler(mm) failed: ${t}` });
      }
      const j = await pr.json();
      previewDataUrl = j.imageBase64;
    }

    // декодируем dataURL предпросмотра
    const m = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(previewDataUrl || '');
    if (!m) return res.status(500).json({ error: 'invalid preview data url from scaler' });
    const previewMime = m[1];
    const previewBuf = Buffer.from(m[2], 'base64');

    // 3) готовим manifest.json (минимальный)
    const nowIso = new Date().toISOString();
    const manifest = {
      format: 'mosaic-project',
      version: '1.0.0',
      createdAt: nowIso,
      app: { name: 'Mosaic', build: 'v3' },
      source: {
        id, mime: origMime, original: 'assets/source/original',
      },
      canvas: {
        units, width, height, dpi: dpi || null, fit, background
      },
      scaling: {
        kernel, format, quality,
        resultPreview: 'assets/previews/scaled'
      },
      notes: 'auto-generated draft'
    };

    // 4) собираем ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="project_${id}.mosaic"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err: any) => { try { res.status(500).end(); } catch {} });

    archive.pipe(res);

    // файлы внутри контейнера
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.append(origBuf, { name: 'assets/source/original' });         // без расширений — mime есть в манифесте
    archive.append(previewBuf, { name: 'assets/previews/scaled' });      // то же

    await archive.finalize();
    // поток закрывает сам res по завершению
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`[image-loader] listening on port ${PORT}`);
});
