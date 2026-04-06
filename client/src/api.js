const API_BASE = import.meta.env.VITE_API_URL || '';

export async function fetchFiles(type = null, page = 1, limit = 50) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (type) params.set('type', type);
  const res = await fetch(`${API_BASE}/api/files?${params}`);
  if (!res.ok) throw new Error('Error al obtener archivos');
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error('Error al obtener estadísticas');
  return res.json();
}

export async function uploadFiles(files, onProgress) {
  const formData = new FormData();

  if (files.length === 1) {
    formData.append('file', files[0]);
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Error al subir archivo');
    return res.json();
  }

  for (const file of files) {
    formData.append('files', file);
  }

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Error al subir archivos'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Error de red')));

    xhr.open('POST', `${API_BASE}/api/upload-multiple`);
    xhr.send(formData);
  });
}

export async function deleteFile(id) {
  const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error al eliminar archivo');
  return res.json();
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function groupByDate(files) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const groups = {};

  for (const file of files) {
    const fileDate = new Date(file.createdAt);
    const fileDay = new Date(fileDate.getFullYear(), fileDate.getMonth(), fileDate.getDate());

    let label;
    if (fileDay.getTime() === today.getTime()) {
      label = 'Hoy';
    } else if (fileDay.getTime() === yesterday.getTime()) {
      label = 'Ayer';
    } else if (fileDay.getTime() > today.getTime() - 7 * 86400000) {
      label = fileDay.toLocaleDateString('es-ES', { weekday: 'long' });
      label = label.charAt(0).toUpperCase() + label.slice(1);
    } else {
      label = fileDay.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(file);
  }

  return Object.entries(groups);
}
