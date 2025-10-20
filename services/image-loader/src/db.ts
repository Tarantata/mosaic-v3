import mongoose from 'mongoose';

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:27017/mosaic';

export async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URL, { dbName: 'mosaic' });
}

const ImageSchema = new mongoose.Schema({
  originalName: String,
  filename: String,
  mime: String,
  size: Number,
  width: Number,
  height: Number,
  thumb: String,
  createdAt: { type: Date, default: Date.now },
});

export const ImageModel = mongoose.model('images', ImageSchema);

// === Canvas Settings Model ===

const CanvasSchema = new mongoose.Schema({
  imageId: { type: String, required: true, unique: true },
  params: {
    units: { type: String, enum: ['px', 'mm'], default: 'px' },
    width: Number,
    height: Number,
    dpi: Number,
    fit: { type: String, enum: ['contain', 'cover', 'fill', 'inside', 'outside'], default: 'contain' },
    background: String,
  },
  updatedAt: { type: Date, default: Date.now },
});

export const CanvasModel = mongoose.model('canvas_settings', CanvasSchema);

