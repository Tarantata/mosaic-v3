import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import sharp from 'sharp';

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(cors());
app.use(morgan('dev'));

const PORT = Number(process.env.PORT) || 3002;
const IMAGE_LOADER_URL = process.env.IMAGE_LOADER_URL || 'http://image-loader:3001';

type Fit = 'cover'|'contain'|'inside'|'outside';
type Position = 'center'|'entropy'|'attention';
type Kernel = 'nearest'|'lanczos3';

function parseDataUrl(dataUrl: string) {
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw new Error('invalid data URL');
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  return { mime, buf };
}

async function sharpResize(
  input: Buffer,
  opts: {
    width: number; height: number;
    fit?: Fit; position?: Position;
    background?: string;
    withoutEnlargement?: boolean;
    format?: 'jpeg'|'png'|'webp';
    quality?: number;
    sharpen?: boolean;
    kernel?: Kernel; // 'nearest' для пиксельного увеличения
  }
): Promise<{ buf: Buffer; mime: string }> {
  const {
    width, height,
    fit = 'cover',
    position = 'center',
    background = '#ffffff',
    withoutEnlargement = false,
    format = 'jpeg',
    quality = 90,
    sharpen = false,
    kernel = 'lanczos3'
  } = opts;

  let pipe = sharp(input).resize({
    width: Math.round(width),
    height: Math.round(height),
    fit,
    position,
    background,
    withoutEnlargement,
    kernel: kernel === 'nearest' ? sharp.kernel.nearest : sharp.kernel.lanczos3
  });

  if (sharpen) pipe = pipe.sharpen();

  let mime = `image/${format}`;
  if (format === 'jpeg') pipe = pipe.jpeg({ quality, chromaSubsampling: '4:4:4' });
  if (format === 'png')  pipe = pipe.png({ compressionLevel: 9 });
  if (format === 'webp') pipe = pipe.webp({ quality });

  const buf = await pipe.toBuffer();
  return { buf, mime };
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'scaler', port: PORT }));

// Масштаб по px (dataURL вход)
app.post('/scale', async (req, res) => {
  try {
    const { imageBase64, width, height, fit, position, background, withoutEnlargement, format, quality, sharpen, kernel } = req.body || {};
    if (!imageBase64 || !width || !height) return res.status(400).json({ error: 'imageBase64, width, height required' });
    const { buf: input } = parseDataUrl(String(imageBase64));
    const { buf, mime } = await sharpResize(input, {
      width: Number(width), height: Number(height),
      fit, position, background, withoutEnlargement, format, quality, sharpen, kernel
    });
    res.json({ imageBase64: `data:${mime};base64,${buf.toString('base64')}`, width, height, mime });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Масштаб по мм + DPI (dataURL вход)
app.post('/scale/by-mm', async (req, res) => {
  try {
    const { imageBase64, mmWidth, mmHeight, dpi = 300, fit, position, background, withoutEnlargement, format, quality, sharpen, kernel } = req.body || {};
    if (!imageBase64 || !mmWidth || !mmHeight) return res.status(400).json({ error: 'imageBase64, mmWidth, mmHeight required' });

    const pxW = Math.round((Number(mmWidth)  / 25.4) * Number(dpi));
    const pxH = Math.round((Number(mmHeight) / 25.4) * Number(dpi));

    const { buf: input } = parseDataUrl(String(imageBase64));
    const { buf, mime } = await sharpResize(input, {
      width: pxW, height: pxH,
      fit, position, background, withoutEnlargement, format, quality, sharpen, kernel
    });
    res.json({ imageBase64: `data:${mime};base64,${buf.toString('base64')}`, width: pxW, height: pxH, dpi, mime });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

// Масштаб по id из image-loader (без перегонки большого base64)
app.post('/scale/by-id', async (req, res) => {
  try {
    const { id, kind = 'original', width, height, fit, position, background, withoutEnlargement, format, quality, sharpen, kernel } = req.body || {};
    if (!id || !width || !height) return res.status(400).json({ error: 'id, width, height required' });

    const url = `${IMAGE_LOADER_URL}/images/${encodeURIComponent(id)}/${kind}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(404).json({ error: `image not found by id=${id}` });
    const input = Buffer.from(await r.arrayBuffer());

    const { buf, mime } = await sharpResize(input, {
      width: Number(width), height: Number(height),
      fit, position, background, withoutEnlargement, format, quality, sharpen, kernel
    });
    res.json({ imageBase64: `data:${mime};base64,${buf.toString('base64')}`, width, height, mime });
  } catch (e:any) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[scaler] listening on port ${PORT}`);
});
