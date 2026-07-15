(() => {
  const state = {
    filter: 'all', // 'all' | 'favorites'
    albumId: null,
    tag: null,
    query: '',
    sort: 'newest',
    photos: [],
    albums: [],
    tags: [],
    activePhotoId: null,
  };

  const $ = (sel) => document.querySelector(sel);
  const grid = $('#grid');
  const emptyState = $('#emptyState');
  const albumList = $('#albumList');
  const tagCloud = $('#tagCloud');
  const dropzone = $('#dropzone');
  const toast = $('#toast');

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.hidden = true), 2500);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---- Data loading ----

  async function loadAlbums() {
    const { albums } = await api('/api/albums');
    state.albums = albums;
    renderAlbums();
  }

  async function loadTags() {
    const { tags } = await api('/api/tags');
    state.tags = tags;
    renderTags();
  }

  async function loadPhotos() {
    const params = new URLSearchParams();
    if (state.filter === 'favorites') params.set('favorite', '1');
    if (state.albumId) params.set('album', state.albumId);
    if (state.tag) params.set('tag', state.tag);
    if (state.query) params.set('q', state.query);
    params.set('sort', state.sort);

    const { photos } = await api(`/api/photos?${params.toString()}`);
    state.photos = photos;
    renderGrid();
  }

  async function refreshAll() {
    await Promise.all([loadAlbums(), loadTags(), loadPhotos()]);
  }

  // ---- Rendering ----

  function renderAlbums() {
    albumList.innerHTML = '';
    for (const album of state.albums) {
      const li = document.createElement('li');
      li.className = state.albumId === album.id ? 'active' : '';
      li.innerHTML = `<span class="name"></span><span class="count">${album.count}</span><button class="icon-btn del" title="Delete album">✕</button>`;
      li.querySelector('.name').textContent = album.name;
      li.addEventListener('click', (e) => {
        if (e.target.closest('.del')) return;
        state.filter = 'all';
        state.tag = null;
        state.albumId = state.albumId === album.id ? null : album.id;
        setActiveNav();
        renderAlbums();
        loadPhotos();
      });
      li.querySelector('.del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete album "${album.name}"? Photos will not be deleted.`)) return;
        await api(`/api/albums/${album.id}`, { method: 'DELETE' });
        if (state.albumId === album.id) state.albumId = null;
        await Promise.all([loadAlbums(), loadPhotos()]);
      });
      albumList.appendChild(li);
    }
    // keep album select (in lightbox) in sync
    const sel = $('#lbAlbumSelect');
    const current = sel.value;
    sel.innerHTML = '<option value="">Add to album…</option>';
    for (const album of state.albums) {
      const opt = document.createElement('option');
      opt.value = album.id;
      opt.textContent = album.name;
      sel.appendChild(opt);
    }
    sel.value = current;
  }

  function renderTags() {
    tagCloud.innerHTML = '';
    for (const tag of state.tags) {
      const pill = document.createElement('button');
      pill.className = 'tag-pill' + (state.tag === tag.name ? ' active' : '');
      pill.textContent = `${tag.name} (${tag.count})`;
      pill.addEventListener('click', () => {
        state.filter = 'all';
        state.albumId = null;
        state.tag = state.tag === tag.name ? null : tag.name;
        setActiveNav();
        renderTags();
        renderAlbums();
        loadPhotos();
      });
      tagCloud.appendChild(pill);
    }
  }

  function renderGrid() {
    grid.innerHTML = '';
    emptyState.hidden = state.photos.length > 0;
    for (const photo of state.photos) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <img loading="lazy" src="${photo.thumbUrl}" alt="${escapeHtml(photo.originalName)}" />
        ${photo.favorite ? '<div class="fav-badge">★</div>' : ''}
        <div class="card-name"></div>
      `;
      card.querySelector('.card-name').textContent = photo.originalName;
      card.addEventListener('click', () => openLightbox(photo.id));
      grid.appendChild(card);
    }
  }

  function setActiveNav() {
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.filter === state.filter && !state.albumId && !state.tag);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Nav events ----

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter;
      state.albumId = null;
      state.tag = null;
      setActiveNav();
      renderAlbums();
      renderTags();
      loadPhotos();
    });
  });

  $('#searchInput').addEventListener('input', debounce((e) => {
    state.query = e.target.value.trim();
    loadPhotos();
  }, 250));

  $('#sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    loadPhotos();
  });

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---- New album ----

  $('#newAlbumBtn').addEventListener('click', async () => {
    const name = prompt('Album name:');
    if (!name || !name.trim()) return;
    try {
      await api('/api/albums', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      await loadAlbums();
    } catch (err) {
      showToast(err.message);
    }
  });

  // ---- Upload ----

  const fileInput = $('#fileInput');
  $('#uploadBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) uploadFiles(fileInput.files);
    fileInput.value = '';
  });

  let dragCounter = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragCounter++;
    dropzone.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) dropzone.hidden = true;
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropzone.hidden = true;
    if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files);
  });

  async function uploadFiles(fileList) {
    const form = new FormData();
    for (const file of fileList) form.append('photos', file);
    showToast(`Uploading ${fileList.length} photo${fileList.length > 1 ? 's' : ''}…`);
    try {
      const { photos } = await api('/api/photos', { method: 'POST', body: form });
      const failed = photos.filter((p) => p.error);
      if (failed.length) showToast(`${failed.length} file(s) failed to upload`);
      else showToast('Upload complete');
      await Promise.all([loadTags(), loadPhotos()]);
    } catch (err) {
      showToast(err.message);
    }
  }

  // ---- Lightbox ----

  const lightbox = $('#lightbox');
  const lbImage = $('#lbImage');
  const lbName = $('#lbName');
  const lbMeta = $('#lbMeta');
  const lbFavorite = $('#lbFavorite');
  const lbTags = $('#lbTags');
  const lbAlbums = $('#lbAlbums');
  const lbTagForm = $('#lbTagForm');
  const lbTagInput = $('#lbTagInput');
  const lbAlbumSelect = $('#lbAlbumSelect');
  const lbDelete = $('#lbDelete');

  function findPhoto(id) {
    return state.photos.find((p) => p.id === id) || null;
  }

  function openLightbox(id) {
    state.activePhotoId = id;
    renderLightbox();
    lightbox.hidden = false;
  }

  function closeLightbox() {
    lightbox.hidden = true;
    state.activePhotoId = null;
  }

  function renderLightbox() {
    const photo = findPhoto(state.activePhotoId);
    if (!photo) return closeLightbox();

    lbImage.src = photo.url;
    lbImage.alt = photo.originalName;
    lbName.textContent = photo.originalName;
    lbFavorite.textContent = photo.favorite ? '★' : '☆';
    lbFavorite.style.color = photo.favorite ? '#ffd23f' : '';

    const dims = photo.width && photo.height ? `${photo.width}×${photo.height} · ` : '';
    const taken = photo.takenAt ? new Date(photo.takenAt).toLocaleString() : null;
    const uploaded = new Date(photo.uploadedAt).toLocaleDateString();
    lbMeta.textContent = `${dims}${formatBytes(photo.size)} · ${taken ? `taken ${taken}` : `uploaded ${uploaded}`}`;
    lbDescription.value = photo.description || '';

    lbTags.innerHTML = '';
    for (const tag of photo.tags) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span></span><button title="Remove tag">✕</button>`;
      chip.querySelector('span').textContent = tag;
      chip.querySelector('button').addEventListener('click', async () => {
        await api(`/api/photos/${photo.id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
        await Promise.all([loadTags(), loadPhotos()]);
        renderLightbox();
      });
      lbTags.appendChild(chip);
    }

    lbAlbums.innerHTML = '';
    for (const album of photo.albums) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span></span><button title="Remove from album">✕</button>`;
      chip.querySelector('span').textContent = album.name;
      chip.querySelector('button').addEventListener('click', async () => {
        await api(`/api/albums/${album.id}/photos/${photo.id}`, { method: 'DELETE' });
        await Promise.all([loadAlbums(), loadPhotos()]);
        renderLightbox();
      });
      lbAlbums.appendChild(chip);
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  $('#lbClose').addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });

  lbFavorite.addEventListener('click', async () => {
    const photo = findPhoto(state.activePhotoId);
    if (!photo) return;
    await api(`/api/photos/${photo.id}`, { method: 'PATCH', body: JSON.stringify({ favorite: !photo.favorite }) });
    await loadPhotos();
    renderLightbox();
  });

  lbTagForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = lbTagInput.value.trim();
    if (!value) return;
    const photo = findPhoto(state.activePhotoId);
    await api(`/api/photos/${photo.id}/tags`, { method: 'POST', body: JSON.stringify({ tag: value }) });
    lbTagInput.value = '';
    await Promise.all([loadTags(), loadPhotos()]);
    renderLightbox();
  });

  lbAlbumSelect.addEventListener('change', async () => {
    const albumId = lbAlbumSelect.value;
    if (!albumId) return;
    const photo = findPhoto(state.activePhotoId);
    await api(`/api/albums/${albumId}/photos`, { method: 'POST', body: JSON.stringify({ photoId: photo.id }) });
    lbAlbumSelect.value = '';
    await Promise.all([loadAlbums(), loadPhotos()]);
    renderLightbox();
  });

  lbDelete.addEventListener('click', async () => {
    const photo = findPhoto(state.activePhotoId);
    if (!photo) return;
    if (!confirm(`Delete "${photo.originalName}" permanently?`)) return;
    await api(`/api/photos/${photo.id}`, { method: 'DELETE' });
    closeLightbox();
    await refreshAll();
  });

  // ---- Description (lightbox) ----

  const lbDescription = $('#lbDescription');
  const lbDescribeBtn = $('#lbDescribeBtn');

  lbDescription.addEventListener('blur', async () => {
    const photo = findPhoto(state.activePhotoId);
    if (!photo || lbDescription.value === (photo.description || '')) return;
    await api(`/api/photos/${photo.id}`, { method: 'PATCH', body: JSON.stringify({ description: lbDescription.value }) });
    await loadPhotos();
  });

  lbDescribeBtn.addEventListener('click', async () => {
    const photo = findPhoto(state.activePhotoId);
    if (!photo) return;
    lbDescribeBtn.disabled = true;
    lbDescribeBtn.textContent = 'Describing…';
    try {
      await api(`/api/photos/${photo.id}/describe`, { method: 'POST' });
      await loadPhotos();
      renderLightbox();
    } catch (err) {
      showToast(err.message);
    } finally {
      lbDescribeBtn.disabled = false;
      lbDescribeBtn.textContent = 'Describe with AI';
    }
  });

  // ---- Settings & scanning ----

  const settingsModal = $('#settingsModal');
  const scanBanner = $('#scanBanner');
  const scanBannerText = $('#scanBannerText');
  const scanBannerBtn = $('#scanBannerBtn');
  const apiKeySaved = $('#apiKeySaved');
  const apiKeyForm = $('#apiKeyForm');
  const apiKeyInput = $('#apiKeyInput');
  const modelChoices = $('#modelChoices');
  const scanStats = $('#scanStats');
  const settingsScanBtn = $('#settingsScanBtn');
  const settingsRetryBtn = $('#settingsRetryBtn');

  let settingsInfo = { hasApiKey: false, model: null, models: [] };
  let scanStatus = { status: 'idle', scanned: 0, errors: 0, total: 0, lastError: null };
  let scanPollTimer = null;

  function scanBannerLabel() {
    switch (scanStatus.status) {
      case 'scanning':
        return `Describing photos… ${scanStatus.scanned} done${scanStatus.errors ? `, ${scanStatus.errors} failed` : ''}`;
      case 'paused':
        return 'Scan paused';
      case 'done':
        return `Scan complete — ${scanStatus.scanned} photo${scanStatus.scanned === 1 ? '' : 's'} described`;
      case 'error':
        return scanStatus.lastError || 'Scan failed';
      default:
        return null;
    }
  }

  function renderScanUi() {
    const isActive = scanStatus.status === 'scanning';
    const label = scanBannerLabel();

    if (label && (isActive || scanStatus.status === 'paused' || scanStatus.status === 'error')) {
      scanBanner.hidden = false;
      scanBannerText.textContent = label;
      scanBannerBtn.textContent = isActive ? 'Pause' : 'Resume';
    } else {
      scanBanner.hidden = true;
    }

    const undescribed = Math.max(0, (scanStatus.total || 0) - (scanStatus.scanned || 0) - (scanStatus.errors || 0));
    scanStats.textContent = `${scanStatus.total || 0} photo${scanStatus.total === 1 ? '' : 's'} indexed · ${scanStatus.scanned || 0} described` +
      (scanStatus.errors ? ` · ${scanStatus.errors} failed` : '') +
      (undescribed ? ` · ${undescribed} remaining` : '');
    settingsScanBtn.textContent = isActive ? 'Pause scan' : undescribed ? `Scan ${undescribed} photo${undescribed === 1 ? '' : 's'}` : 'Scan library';
    settingsRetryBtn.hidden = !scanStatus.errors;

    if (isActive && !scanPollTimer) {
      scanPollTimer = setInterval(refreshScanStatus, 2000);
    } else if (!isActive && scanPollTimer) {
      clearInterval(scanPollTimer);
      scanPollTimer = null;
    }
  }

  async function refreshScanStatus() {
    scanStatus = await api('/api/scan');
    renderScanUi();
    if (scanStatus.status === 'done' || scanStatus.status === 'scanning') loadPhotos();
  }

  scanBannerBtn.addEventListener('click', async () => {
    scanStatus = scanStatus.status === 'scanning' ? await api('/api/scan/pause', { method: 'POST' }) : await api('/api/scan', { method: 'POST' });
    renderScanUi();
  });

  settingsScanBtn.addEventListener('click', async () => {
    try {
      scanStatus = scanStatus.status === 'scanning' ? await api('/api/scan/pause', { method: 'POST' }) : await api('/api/scan', { method: 'POST' });
      renderScanUi();
    } catch (err) {
      showToast(err.message);
    }
  });

  settingsRetryBtn.addEventListener('click', async () => {
    scanStatus = await api('/api/scan/retry', { method: 'POST' });
    renderScanUi();
  });

  function renderModelChoices() {
    modelChoices.innerHTML = '';
    for (const model of settingsInfo.models) {
      const label = document.createElement('label');
      label.className = 'model-choice';
      label.innerHTML = `<input type="radio" name="model" value="${model.id}" /> <span></span>`;
      label.querySelector('input').checked = settingsInfo.model === model.id;
      label.querySelector('span').textContent = model.label;
      label.querySelector('input').addEventListener('change', async () => {
        settingsInfo = await api('/api/settings', { method: 'POST', body: JSON.stringify({ model: model.id }) });
      });
      modelChoices.appendChild(label);
    }
  }

  async function loadSettings() {
    settingsInfo = await api('/api/settings');
    apiKeySaved.hidden = !settingsInfo.hasApiKey;
    apiKeyForm.hidden = settingsInfo.hasApiKey;
    renderModelChoices();
  }

  $('#settingsBtn').addEventListener('click', async () => {
    await Promise.all([loadSettings(), refreshScanStatus()]);
    settingsModal.hidden = false;
  });
  $('#settingsClose').addEventListener('click', () => (settingsModal.hidden = true));
  settingsModal.querySelector('.lightbox-backdrop').addEventListener('click', () => (settingsModal.hidden = true));

  apiKeyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = apiKeyInput.value.trim();
    if (!value) return;
    settingsInfo = await api('/api/settings', { method: 'POST', body: JSON.stringify({ apiKey: value }) });
    apiKeyInput.value = '';
    apiKeySaved.hidden = !settingsInfo.hasApiKey;
    apiKeyForm.hidden = settingsInfo.hasApiKey;
  });

  $('#apiKeyRemove').addEventListener('click', async () => {
    await api('/api/settings/api-key', { method: 'DELETE' });
    settingsInfo.hasApiKey = false;
    apiKeySaved.hidden = true;
    apiKeyForm.hidden = false;
  });

  refreshAll();
  refreshScanStatus();
})();
