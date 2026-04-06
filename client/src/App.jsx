import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchFiles, fetchStats, uploadFiles, deleteFile, batchDelete,
  toggleFavorite, login, logout, isLoggedIn,
  formatBytes, formatDate, groupByDate,
} from './api';
import { compressFiles } from './compress';

function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(password);
      onLogin();
    } catch {
      setError('Contraseña incorrecta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-box">
        <h1>🗂️ My<span>BDD</span></h1>
        <p>Introduce tu contraseña</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
        />
        {error && <div className="login-error">{error}</div>}
        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: 0, totalImages: 0, totalVideos: 0, totalFavorites: 0 });
  const [filter, setFilter] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [showFavs, setShowFavs] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [compressStatus, setCompressStatus] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [toasts, setToasts] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const searchTimeout = useRef(null);

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const handleAuthError = useCallback((err) => {
    if (err?.message === 'UNAUTHORIZED') {
      logout();
      setAuthed(false);
      return true;
    }
    return false;
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [filesData, statsData] = await Promise.all([
        fetchFiles({ type: filter, sort: sortDir, search: search || undefined, favorites: showFavs || undefined }),
        fetchStats(),
      ]);
      setFiles(filesData.files);
      setStats(statsData);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, sortDir, search, showFavs, toast, handleAuthError]);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  const handleSearch = (value) => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setSearch(value), 400);
  };

  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);
    setUploading(true);
    setUploadProgress(0);
    setCompressStatus('');
    try {
      // Comprimir antes de subir
      const compressed = await compressFiles(filesArray, setCompressStatus);
      setCompressStatus('Subiendo...');
      await uploadFiles(compressed, setUploadProgress);
      toast(`${filesArray.length} archivo(s) subido(s)`);
      await loadData();
    } catch (err) {
      if (!handleAuthError(err)) toast(err.message || 'Error al subir archivos', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setCompressStatus('');
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
    } catch (err) {
      if (!handleAuthError(err)) toast('Error al eliminar', 'error');
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`¿Eliminar ${selected.size} archivo(s)?`)) return;
    try {
      await batchDelete([...selected]);
      toast(`${selected.size} archivo(s) eliminado(s)`);
      setSelected(new Set());
      setSelectMode(false);
      await loadData();
    } catch (err) {
      if (!handleAuthError(err)) toast('Error al eliminar', 'error');
    }
  };

  const handleToggleFav = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await toggleFavorite(id);
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, isFavorite: res.isFavorite } : f));
      // Update stats inline
      setStats((prev) => ({
        ...prev,
        totalFavorites: prev.totalFavorites + (res.isFavorite ? 1 : -1),
      }));
    } catch (err) {
      if (!handleAuthError(err)) toast('Error al cambiar favorito', 'error');
    }
  };

  const handleDownload = async (e, file) => {
    e.stopPropagation();
    try {
      const res = await fetch(file.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.originalName;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast('Error al descargar', 'error');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

  const handleLogout = () => {
    logout();
    setAuthed(false);
  };

  // Keyboard navigation
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

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  const lbFile = lightboxIndex >= 0 && lightboxIndex < files.length ? files[lightboxIndex] : null;

  return (
    <div className="app">
      {/* Header */}
      <header>
        <h1>🗂️ My<span>BDD</span></h1>
        <div className="header-right">
          <span className="subtitle">Galería Personal</span>
          <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">🚪</button>
        </div>
      </header>

      {/* Stats */}
      <div className="stats">
        <div className="stat-card">
          <div className="number">{stats.totalFiles}</div>
          <div className="label">Total</div>
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
          <div className="number">{stats.totalFavorites}</div>
          <div className="label">⭐ Favoritos</div>
        </div>
        <div className="stat-card">
          <div className="number">{formatBytes(stats.totalSize)}</div>
          <div className="label">Espacio</div>
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
        <p>Arrastra archivos aquí o <span className="browse">selecciona</span></p>
        <p style={{ fontSize: '0.8rem', marginTop: 8 }}>Fotos y videos (hasta 50MB)</p>
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
          <div>{compressStatus || `Subiendo... ${uploadProgress}%`}</div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-filters">
          <button className={`filter-btn ${filter === null && !showFavs ? 'active' : ''}`} onClick={() => { setFilter(null); setShowFavs(false); }}>
            🗂️ Todos
          </button>
          <button className={`filter-btn ${filter === 'image' ? 'active' : ''}`} onClick={() => { setFilter('image'); setShowFavs(false); }}>
            📸 Fotos
          </button>
          <button className={`filter-btn ${filter === 'video' ? 'active' : ''}`} onClick={() => { setFilter('video'); setShowFavs(false); }}>
            🎥 Videos
          </button>
          <button className={`filter-btn ${showFavs ? 'active' : ''}`} onClick={() => { setShowFavs(!showFavs); setFilter(null); }}>
            ⭐ Favoritos
          </button>
        </div>
        <div className="toolbar-actions">
          <input
            type="text"
            className="search-input"
            placeholder="🔍 Buscar..."
            onChange={(e) => handleSearch(e.target.value)}
          />
          <button className="icon-btn" onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')} title="Cambiar orden">
            {sortDir === 'desc' ? '⬇️' : '⬆️'}
          </button>
          <button className={`icon-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode((v) => v === 'grid' ? 'list' : 'grid')} title="Cambiar vista">
            {viewMode === 'grid' ? '📋' : '🔲'}
          </button>
          <button className={`icon-btn ${selectMode ? 'active' : ''}`} onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }} title="Seleccionar">
            ☑️
          </button>
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectMode && selected.size > 0 && (
        <div className="batch-bar">
          <span>{selected.size} seleccionado(s)</span>
          <button onClick={handleBatchDelete} className="batch-delete-btn">🗑️ Eliminar selección</button>
          <button onClick={() => setSelected(new Set())} className="batch-clear-btn">Desmarcar todo</button>
        </div>
      )}

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
          <p style={{ marginTop: 8, fontSize: '0.9rem' }}>Sube fotos o videos desde tu celular o PC</p>
        </div>
      ) : (
        <div className="gallery-sections">
          {groupByDate(files).map(([dateLabel, groupFiles]) => (
            <div key={dateLabel} className="date-group">
              <h2 className="date-label">{dateLabel}</h2>
              <div className={`gallery ${viewMode}`}>
                {groupFiles.map((file) => {
                  const globalIdx = files.findIndex((f) => f.id === file.id);
                  const isSelected = selected.has(file.id);
                  return (
                    <div
                      key={file.id}
                      className={`gallery-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => selectMode ? toggleSelect(file.id) : setLightboxIndex(globalIdx)}
                    >
                      {selectMode && (
                        <div className={`select-check ${isSelected ? 'checked' : ''}`}>
                          {isSelected ? '✓' : ''}
                        </div>
                      )}
                      {file.type === 'image' ? (
                        <img src={file.url} alt={file.originalName} loading="lazy" />
                      ) : (
                        <video src={file.url} preload="metadata" muted />
                      )}
                      <span className="badge">{file.type === 'image' ? '📸' : '🎥'}</span>
                      <button
                        className={`fav-btn ${file.isFavorite ? 'active' : ''}`}
                        onClick={(e) => handleToggleFav(e, file.id)}
                        title="Favorito"
                      >
                        {file.isFavorite ? '⭐' : '☆'}
                      </button>
                      {!selectMode && (
                        <button className="delete-btn" onClick={(e) => handleDelete(e, file.id)} title="Eliminar">
                          ✕
                        </button>
                      )}
                      <div className="info">
                        <div className="name">{file.originalName}</div>
                        <div className="meta">
                          <span>{formatDate(file.createdAt)}</span>
                          <span>{formatBytes(file.size)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lbFile && (
        <div className="lightbox" onClick={() => setLightboxIndex(-1)}>
          <button className="lightbox-close" onClick={() => setLightboxIndex(-1)}>✕</button>

          <div className="lightbox-top-bar" onClick={(e) => e.stopPropagation()}>
            <span className="lightbox-filename">{lbFile.originalName}</span>
            <div className="lightbox-actions">
              <button onClick={(e) => handleToggleFav(e, lbFile.id)} title="Favorito">
                {lbFile.isFavorite ? '⭐' : '☆'}
              </button>
              <button onClick={(e) => handleDownload(e, lbFile)} title="Descargar">⬇️</button>
              <button onClick={(e) => handleDelete(e, lbFile.id)} title="Eliminar">🗑️</button>
            </div>
          </div>

          {lightboxIndex > 0 && (
            <button className="lightbox-nav prev" onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i - 1); }}>
              ‹
            </button>
          )}

          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            {lbFile.type === 'image' ? (
              <img src={lbFile.url} alt={lbFile.originalName} />
            ) : (
              <video src={lbFile.url} controls autoPlay />
            )}
          </div>

          {lightboxIndex < files.length - 1 && (
            <button className="lightbox-nav next" onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => i + 1); }}>
              ›
            </button>
          )}
        </div>
      )}

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
