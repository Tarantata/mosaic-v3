// services/image-loader/src/config.ts
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function env(name: string, def?: string) {
  const v = process.env[name];
  if (v == null || v === '') {
    if (def === undefined) {
      throw new Error(`Missing required env: ${name}`);
    }
    return def;
  }
  return v;
}

export const CONFIG = {
  NODE_ENV: env('NODE_ENV', 'development'),
  PORT: Number(env('PORT', '3001')),
  MONGO_URL: env('MONGO_URL', 'mongodb://mongo:27017/mosaic'),
  SCALER_URL: env('SCALER_URL', 'http://scaler:3002'),
  PATHS: {
    uiDir: path.join(__dirname, '../public/ui'),
  },
} as const;
