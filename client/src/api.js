const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('mybdd_token') || '';
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Contraseña incorrecta');
  const data = await res.json();
  localStorage.setItem('mybdd_token', data.token);
  return data;
}

export function logout() {
  localStorage.removeItem('mybdd_token');
}

export function isLoggedIn() {
  return !!localStorage.getItem('mybdd_token');
}

export async function fetchFiles({ type, page = 1, limit = 50, sort = 'desc', search, favorites } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), sort });
  if (type) params.set('type', type);
  if (search) params.set('search', search);
  if (favorites) params.set('favorites', 'true');
  const res = await fetch(`${API_BASE}/api/files?${params}`, { headers: authHeaders() });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Error al obtener archivos');
  return res.json();
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/stats`, { headers: authHeaders() });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Error al obtener estadísticas');
  return res.json();
}

export async function uploadFiles(files, onProgress) {
  const formData = new FormData();
  const headers = authHeaders();

  if (files.length === 1) {
    formData.append('file', files[0]);
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (res.status === 401) throw new Error('UNAUTHORIZED');
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
      if (xhr.status === 401) return reject(new Error('UNAUTHORIZED'));
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Error al subir archivos'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Error de red')));

    xhr.open('POST', `${API_BASE}/api/upload-multiple`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  });
}

export async function deleteFile(id) {
  const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Error al eliminar archivo');
  return res.json();
}

export async function batchDelete(ids) {
  const res = await fetch(`${API_BASE}/api/files/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ids }),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Error al eliminar archivos');
  return res.json();
}

export async function toggleFavorite(id) {
  const res = await fetch(`${API_BASE}/api/files/${encodeURIComponent(id)}/favorite`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok) throw new Error('Error al cambiar favorito');
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
