import imageCompression from 'browser-image-compression';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// ===== IMÁGENES =====
const IMAGE_OPTIONS = {
  maxSizeMB: 10,
  maxWidthOrHeight: 3840,
  useWebWorker: true,
  fileType: 'image/jpeg',
};

export async function compressImage(file, onProgress) {
  if (onProgress) onProgress('Comprimiendo imagen...');
  try {
    const compressed = await imageCompression(file, {
      ...IMAGE_OPTIONS,
      onProgress: (p) => onProgress && onProgress(`Comprimiendo imagen... ${p}%`),
    });
    // Mantener nombre original
    return new File([compressed], file.name, { type: compressed.type, lastModified: file.lastModified });
  } catch {
    return file; // Si falla, subir original
  }
}

// ===== VIDEOS =====
let ffmpeg = null;
let ffmpegLoaded = false;

async function getFFmpeg(onProgress) {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on('progress', ({ progress }) => {
    if (onProgress) {
      const pct = Math.round(progress * 100);
      onProgress(`Comprimiendo video... ${pct}%`);
    }
  });

  if (onProgress) onProgress('Cargando compresor de video...');

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegLoaded = true;
  return ffmpeg;
}

export async function compressVideo(file, onProgress) {
  if (onProgress) onProgress('Preparando compresión de video...');

  try {
    const ff = await getFFmpeg(onProgress);

    const inputName = 'input' + getExt(file.name);
    const outputName = 'output.mp4';

    await ff.writeFile(inputName, await fetchFile(file));

    // Compresión: CRF 28 (buena calidad, tamaño reducido), scale max 1080p
    await ff.exec([
      '-i', inputName,
      '-vf', 'scale=min(iw\\,1920):min(ih\\,1080):force_original_aspect_ratio=decrease',
      '-c:v', 'libx264',
      '-crf', '28',
      '-preset', 'fast',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', outputName,
    ]);

    const data = await ff.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // Limpiar
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);

    const compressedName = file.name.replace(/\.[^.]+$/, '.mp4');
    return new File([blob], compressedName, { type: 'video/mp4', lastModified: file.lastModified });
  } catch (err) {
    console.error('Error al comprimir video:', err);
    return file; // Si falla, devolver original
  }
}

function getExt(name) {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.substring(idx) : '.mp4';
}

// ===== PRINCIPAL =====
export async function compressFile(file, onProgress) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  if (isImage) {
    // Comprimir imágenes siempre (ahorra espacio)
    const compressed = await compressImage(file, onProgress);
    if (compressed.size > MAX_SIZE) {
      throw new Error(`La imagen sigue siendo muy grande (${formatMB(compressed.size)}). Máximo: 50MB.`);
    }
    return compressed;
  }

  if (isVideo) {
    if (file.size <= MAX_SIZE) {
      // Si ya cabe, comprimir igualmente para ahorrar espacio
      const compressed = await compressVideo(file, onProgress);
      return compressed.size < file.size ? compressed : file;
    }
    // Si supera 50MB, comprimir obligatorio
    const compressed = await compressVideo(file, onProgress);
    if (compressed.size > MAX_SIZE) {
      throw new Error(`El video comprimido sigue siendo muy grande (${formatMB(compressed.size)}). Máximo: 50MB.`);
    }
    return compressed;
  }

  return file;
}

export async function compressFiles(files, onProgress) {
  const result = [];
  for (let i = 0; i < files.length; i++) {
    const label = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
    const compressed = await compressFile(files[i], (msg) => onProgress && onProgress(`${label}${msg}`));
    result.push(compressed);
  }
  return result;
}

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
