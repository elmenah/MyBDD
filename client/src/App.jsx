import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchFiles, fetchStats, uploadFiles, deleteFile, formatBytes, formatDate } from './api';

function App() {
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: 0, totalImages: 0, totalVideos: 0 });
  const [filter, setFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [toasts, setToasts] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [filesData, statsData] = await Promise.all([
        fetchFiles(filter),
        fetchStats(),
      ]);
      setFiles(filesData.files);
      setStats(statsData);
    } catch {
      toast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    setUploading(true);
    setUploadProgress(0);

    try {
      await uploadFiles(filesArray, setUploadProgress);
      toast(`${filesArray.length} archivo(s) subido(s)`);
      await loadData();
    } catch {
      toast('Error al subir archivos', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este archivo?')) return;
    try {
      await deleteFile(id);
      toast('Archivo eliminado');
      await loadData();
      if (lightboxIndex >= 0) setLightboxIndex(-1);
    } catch {
      toast('Error al eliminar', 'error');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  // Navegación del lightbox con teclado
  useEffect(() => {
    const handleKey = (e) => {
      if (lightboxIndex < 0) return;
      if (e.key === 'Escape') setLightboxIndex(-1);
      if (e.key === 'ArrowRight' && lightboxIndex < files.length - 1) setLightboxIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex((i) => i - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, files.length]);

  return (
    <div className="app">
      {/* Header */}
      <header>
        <h1>🗂️ My<span>BDD</span></h1>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Galería Personal
        </div>
      </header>

      {/* Stats */}
      <div className="stats">
        <div className="stat-card">
          <div className="number">{stats.totalFiles}</div>
          <div className="label">Total archivos</div>
        </div>
        <div className="stat-card">
          <div className="number">{stats.totalImages}</div>
          <div className="label">📸 Fotos</div>
        </div>
        <div className="stat-card">
          <div className="number">{stats.totalVideos}</div>
          <div className="label">🎥 Videos</div>
        </div>
        <div className="stat-card">
          <div className="number">{formatBytes(stats.totalSize)}</div>
          <div className="label">Espacio usado</div>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragOver ? 'dragover' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="icon">📤</div>
        <p>
          Arrastra archivos aquí o <span className="browse">selecciona</span>
        </p>
        <p style={{ fontSize: '0.8rem', marginTop: 8 }}>
          Fotos y videos (hasta 500MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="upload-progress">
          <div>Subiendo... {uploadProgress}%</div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="toolbar">
        <button className={`filter-btn ${filter === null ? 'active' : ''}`} onClick={() => setFilter(null)}>
          🗂️ Todos
        </button>
        <button className={`filter-btn ${filter === 'image' ? 'active' : ''}`} onClick={() => setFilter('image')}>
          📸 Fotos
        </button>
        <button className={`filter-btn ${filter === 'video' ? 'active' : ''}`} onClick={() => setFilter('video')}>
          🎥 Videos
        </button>
      </div>

      {/* Gallery */}
      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p style={{ marginTop: 12 }}>Cargando...</p>
        </div>
      ) : files.length === 0 ? (
        <div className="empty">
          <div className="icon">📭</div>
          <p>No hay archivos todavía</p>
          <p style={{ marginTop: 8, fontSize: '0.9rem' }}>
            Sube fotos o videos desde tu celular o PC
          </p>
        </div>
      ) : (
        <div className="gallery">
          {files.map((file, idx) => (
            <div key={file.id} className="gallery-item" onClick={() => setLightboxIndex(idx)}>
              {file.type === 'image' ? (
                <img src={file.url} alt={file.originalName} loading="lazy" />
              ) : (
                <video src={file.url} preload="metadata" muted />
              )}
              <span className="badge">{file.type === 'image' ? '📸' : '🎥'}</span>
              <button className="delete-btn" onClick={(e) => handleDelete(e, file.id)} title="Eliminar">
                ✕
              </button>
              <div className="info">
                <div className="name">{file.originalName}</div>
                <div className="date">{formatDate(file.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex >= 0 && lightboxIndex < files.length && (
        <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
          <button className="lightbox-close" onClick={() => setLightboxIndex(-1)}>✕</button>

          {lightboxIndex > 0 && (
            <button
              className="lightbox-nav prev"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i - 1); }}
            >
              ‹
            </button>
          )}

          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            {files[lightboxIndex].type === 'image' ? (
              <img src={files[lightboxIndex].url} alt={files[lightboxIndex].originalName} />
            ) : (
              <video src={files[lightboxIndex].url} controls autoPlay />
            )}
          </div>

          {lightboxIndex < files.length - 1 && (
            <button
              className="lightbox-nav next"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i + 1); }}
            >
              ›
            </button>
          )}
        </div>
      )}

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
