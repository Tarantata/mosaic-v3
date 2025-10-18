import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const DATA_DIR = process.env.DATA_DIR || '/data/images';
const THUMB_DIR = process.env.THUMB_DIR || '/data/thumbs';

export function ensureDirs() {
  [DATA_DIR, THUMB_DIR].forEach((p) => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
}

export async function saveFile(buffer: Buffer, filename: string) {
  ensureDirs();
  const filePath = path.join(DATA_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export async function makeThumb(filePath: string, filename: string) {
  ensureDirs();
  const thumbName = filename.replace(/(\.[a-zA-Z0-9]+)$/i, '_thumb$1');
  const thumbPath = path.join(THUMB_DIR, thumbName);
  await sharp(filePath).resize(320).toFile(thumbPath);
  return { thumbName, thumbPath };
}

export function getFilePath(filename: string, isThumb=false) {
  const base = isThumb ? THUMB_DIR : DATA_DIR;
  return path.join(base, filename);
}
