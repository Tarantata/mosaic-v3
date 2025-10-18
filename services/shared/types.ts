// services/shared/types.ts

export type FitMode = 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
export type KernelMode = 'nearest' | 'lanczos3';
export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface ScaleByIdRequest {
  id: string;
  width: number;
  height: number;
  fit?: FitMode;
  background?: string;
  format?: ImageFormat;
  quality?: number; // 1..100
  kernel?: KernelMode;
  withoutEnlargement?: boolean;
  sharpen?: boolean;
}

export interface ScaleByMmRequest {
  imageBase64: string; // data:image/...;base64,...
  mmWidth: number;
  mmHeight: number;
  dpi: number;
  fit?: FitMode;
  background?: string;
  format?: ImageFormat;
  quality?: number;
  kernel?: KernelMode;
  withoutEnlargement?: boolean;
  sharpen?: boolean;
}

export interface ExportProjectRequest {
  id: string;
  canvas: {
    units: 'px' | 'mm';
    width: number;
    height: number;
    dpi?: number;
    fit: FitMode;
    background: string;
  };
  scaling: {
    kernel: KernelMode;
    format: ImageFormat;
    quality: number;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
