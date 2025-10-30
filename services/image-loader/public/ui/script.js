// services/image-loader/public/ui/script.js

// Ловим неожиданные ошибки, чтобы не «тихо» ломалось
window.addEventListener('error', (e) => {
  console.error('Global JS error:', e.error || e.message || e);
  alert('Ошибка скрипта UI: ' + (e.message || e.error || e));
});

window.addEventListener('DOMContentLoaded', () => {
  // --- DOM
  const gallerySection     = document.getElementById('gallerySection');
  const galleryEl          = document.getElementById('gallery');
  const internalSection    = document.getElementById('internalSection');
  const internalGalleryEl  = document.getElementById('internalGallery');

  const btnShowGallery     = document.getElementById('btnShowGallery');
  const btnClearGallery    = document.getElementById('btnClearGallery');
  const btnShowInternal    = document.getElementById('btnShowInternal');
  const btnImportSelected  = document.getElementById('btnImportSelected');
  const btnDeleteSelected  = document.getElementById('btnDeleteSelected');

  const dropzone           = document.getElementById('dropzone');
  const fileInput          = document.getElementById('fileInput');
  const btnUpload          = document.getElementById('btnUpload');
  const uploadLog          = document.getElementById('uploadLog');

  // Admin
  const adminPanel         = document.getElementById('adminPanel');
  const adminToggle        = document.getElementById('adminToggle');
  const adminControls      = document.getElementById('adminControls');
  const adminOutput        = document.getElementById('adminOutput');
  const adminPreview       = document.getElementById('adminPreview');

  const userPanel    = document.getElementById('userPanel');
  const userUnits    = document.getElementById('userUnits');
  const userW        = document.getElementById('userW');
  const userH        = document.getElementById('userH');
  const userDpiBox   = document.getElementById('userDpiBox');
  const userDpi      = document.getElementById('userDpi');
  const userFit      = document.getElementById('userFit');
  const userBg       = document.getElementById('userBg');
  const btnUserSave  = document.getElementById('btnUserSave');
  const btnExportProject = document.getElementById('btnExportProject');
  const btnTestExport    = document.getElementById('btnTestExport');
  const userSavedNote = document.getElementById('userSavedNote');
  const selectedIdBox      = document.getElementById('selectedIdBox');
  const unitsEl            = document.getElementById('units');
  const targetWEl          = document.getElementById('targetW');
  const targetHEl          = document.getElementById('targetH');
  const dpiBox             = document.getElementById('dpiBox');
  const dpiEl              = document.getElementById('dpi');
  const fitEl              = document.getElementById('fit');
  const bgEl               = document.getElementById('bg');
  const fmtEl              = document.getElementById('fmt');
  const qualityEl          = document.getElementById('quality');
  const kernelEl           = document.getElementById('kernel');
  const btnAdminPreview    = document.getElementById('btnAdminPreview');

  const searchEl      = document.getElementById('search');
  const mimeFilterEl  = document.getElementById('mimeFilter');
  const limitEl       = document.getElementById('limit');
  const sortEl        = document.getElementById('sort');
  const prevPageBtn   = document.getElementById('prevPage');
  const nextPageBtn   = document.getElementById('nextPage');
  const pageInfoEl    = document.getElementById('pageInfo');

  // Проверка наличия ключевых элементов
  const req = (el, id) => { if (!el) throw new Error(`Не найден элемент #${id}`); return el; };
  req(gallerySection,'gallerySection'); req(galleryEl,'gallery');
  req(internalSection,'internalSection'); req(internalGalleryEl,'internalGallery');
  req(btnShowGallery,'btnShowGallery'); req(btnClearGallery,'btnClearGallery');
  req(btnShowInternal,'btnShowInternal'); req(btnImportSelected,'btnImportSelected');
  req(btnDeleteSelected, 'btnDeleteSelected');
  req(dropzone,'dropzone'); req(fileInput,'fileInput'); req(btnUpload,'btnUpload'); req(uploadLog,'uploadLog');
  req(adminPanel,'adminPanel'); req(adminToggle,'adminToggle'); req(adminControls,'adminControls');
  req(adminOutput,'adminOutput'); req(adminPreview,'adminPreview'); req(selectedIdBox,'selectedIdBox');
  req(unitsEl,'units'); req(targetWEl,'targetW'); req(targetHEl,'targetH'); req(fitEl,'fit');
  req(bgEl,'bg'); req(fmtEl,'fmt'); req(qualityEl,'quality'); req(kernelEl,'kernel'); req(btnAdminPreview,'btnAdminPreview');
  req(userPanel,'userPanel'); req(userUnits,'userUnits'); req(userW,'userW'); req(userH,'userH');
  req(userDpiBox,'userDpiBox'); req(userFit,'userFit'); req(userBg,'userBg');
  req(btnUserSave,'btnUserSave'); req(btnExportProject,'btnExportProject'); req(btnTestExport,'btnTestExport'); req(userSavedNote,'userSavedNote');
  req(searchEl,'search'); req(mimeFilterEl,'mimeFilter'); req(limitEl,'limit');
  req(sortEl,'sort'); req(prevPageBtn,'prevPage'); req(nextPageBtn,'nextPage'); req(pageInfoEl,'pageInfo');

  if (!userDpi) console.warn('userDpi not found (ok for px mode)');

  let galleryVisible   = true;   // по умолчанию видна
  let internalVisible  = false;  // по умолчанию скрыта (в HTML есть класс hidden)
  const selectedInternal = new Set();  // внутренняя галерея
  let selectedUploaded = new Set();   // пользовательские загрузки
  let currentImageId   = null;
  let userParams = {
    units: 'px',
    width: 1200,
    height: 900,
    dpi: 300,
    fit: 'contain',
    background: '#ffffff'
  };
  let uploadedState = {
    q: '',
    mime: '',
    limit: 12,
    sort: 'newest',
    page: 1,
    pages: 1,
    total: 0
  };

  function loadUserParams() {
    try {
      const raw = localStorage.getItem('mosaic_user_params');
      if (raw) userParams = { ...userParams, ...JSON.parse(raw) };
    } catch {}
    // применяем в UI
    userUnits.value = userParams.units;
    userW.value = String(userParams.width);
    userH.value = String(userParams.height);
    userFit.value = userParams.fit;
    userBg.value = userParams.background;
    if (userParams.units === 'mm') {
      userDpiBox.classList.remove('hidden');
      if (userDpi) userDpi.value = String(userParams.dpi || 300);
    } else {
      userDpiBox.classList.add('hidden');
    }
  }

  function saveUserParams() {
    userParams = {
      units: userUnits.value,
      width: Number(userW.value) || 0,
      height: Number(userH.value) || 0,
      dpi: Number(userDpi?.value || 300) || 300,
      fit: userFit.value,
      background: userBg.value || '#ffffff'
    };
    localStorage.setItem('mosaic_user_params', JSON.stringify(userParams));
  }

  applyStateToControls();

  // загрузить/сохранить в localStorage
function loadUploadedState() {
  try { const s = JSON.parse(localStorage.getItem('uploadedState') || ''); if (s) uploadedState = { ...uploadedState, ...s }; } catch {}
}
function saveUploadedState() {
  localStorage.setItem('uploadedState', JSON.stringify(uploadedState));
}
loadUploadedState();

// применить состояние в контролы
function applyStateToControls() {
  searchEl.value     = uploadedState.q;
  mimeFilterEl.value = uploadedState.mime;
  limitEl.value      = String(uploadedState.limit);
  sortEl.value       = uploadedState.sort;
  renderPagination();
}

function buildQuery() {
  const p = new URLSearchParams();
  if (uploadedState.q)    p.set('q', uploadedState.q);
  if (uploadedState.mime) p.set('mime', uploadedState.mime);
  if (uploadedState.sort) p.set('sort', uploadedState.sort);
  p.set('page',  String(uploadedState.page));
  p.set('limit', String(uploadedState.limit));
  return '/images?' + p.toString();
}

function renderPagination() {
  pageInfoEl.textContent = `Стр. ${uploadedState.page} / ${uploadedState.pages} · всего ${uploadedState.total}`;
  prevPageBtn.disabled = uploadedState.page <= 1;
  nextPageBtn.disabled = uploadedState.page >= uploadedState.pages;
}

  async function fetchJSON(url, opts = {}) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      throw new Error(`HTTP ${r.status}${t ? ': ' + t : ''}`);
    }
    return r.json();
  }

  // стартовая подгрузка
  loadUserParams();
  loadGallery().catch(err => console.error('loadGallery failed', err));

  // === ГАЛЕРЕЯ ЗАГРУЖЕННЫХ ===
  async function loadGallery() {
    // запрос с параметрами
    const url  = buildQuery();
    console.log('📦 gallery request →', url);
    const data = await fetchJSON(url);
    const list = Array.isArray(data) ? data : (data.items || []);
    // если сервер вернул расширенный ответ — обновим стейт страниц
    if (!Array.isArray(data)) {
      uploadedState.page  = Number(data.page  || 1);
      uploadedState.pages = Number(data.pages || 1);
      uploadedState.total = Number(data.total || list.length || 0);
      renderPagination();
      saveUploadedState();
    }
    
    galleryEl.innerHTML = '';
    selectedUploaded.clear();
    btnDeleteSelected.classList.add('hidden');
    selectedUploaded.clear?.();    // если есть набор выбранных
    if (btnDeleteSelected) btnDeleteSelected.classList.add('hidden');

    list.forEach(it => {
      const card = document.createElement('div'); card.className = 'card';
      const img = document.createElement('img'); img.className = 'thumb';
      img.src = `/images/${it._id}/thumb`;

      const meta = document.createElement('div');
      meta.innerHTML = `<div><b>${it.originalName || it.filename}</b></div>
        <div>${it.mime || ''} ${it.width || '?'}×${it.height || '?'}</div>`;

      // чекбокс для удаления
      const actions = document.createElement('div');
      const select = document.createElement('input');
      select.type = 'checkbox';
      select.addEventListener('change', () => {
        const id = String(it._id);
        if (select.checked) selectedUploaded.add(id);
        else selectedUploaded.delete(id);
        btnDeleteSelected.classList.toggle('hidden', selectedUploaded.size === 0);
      });
      actions.appendChild(select);
      card.appendChild(actions);  

      // выбор источника для Admin
      card.addEventListener('click', () => {
        currentImageId = it._id;
        selectedIdBox.textContent = currentImageId;
        [...galleryEl.querySelectorAll('.card')].forEach(c => c.style.outline = 'none');
        card.style.outline = '2px solid #16a34a';
      });

      card.appendChild(img);
      card.appendChild(meta);
      card.appendChild(actions);
      galleryEl.appendChild(card);
    });
  }

  // === ВНУТРЕННЯЯ ГАЛЕРЕЯ ===
  async function loadInternal() {
    const list = await fetchJSON('/internal-gallery/list');
    internalGalleryEl.innerHTML = '';
    selectedInternal.clear();
    btnImportSelected.classList.add('hidden');

    list.forEach(it => {
      const card = document.createElement('div'); card.className = 'card'; card.style.cursor='pointer';
      const img = document.createElement('img'); img.className = 'thumb'; img.src = it.url;
      const meta = document.createElement('div'); meta.innerHTML = `<div><b>${it.name}</b></div>`;

      const actions = document.createElement('div');
      const select = document.createElement('input'); select.type = 'checkbox';
      select.addEventListener('change', () => {
        if (select.checked) selectedInternal.add(it.name); else selectedInternal.delete(it.name);
        btnImportSelected.classList.toggle('hidden', selectedInternal.size === 0);
        card.style.outline = select.checked ? '2px solid #3b82f6' : 'none';
      });

      const importOne = document.createElement('button'); importOne.textContent = 'Импортировать';
      importOne.addEventListener('click', async () => {
        importOne.disabled = true;
        try {
          await fetchJSON(`/internal-gallery/import?name=${encodeURIComponent(it.name)}`, { method: 'POST' });
          await loadGallery();
          alert(`Импортировано: ${it.name}`);
        } catch (e) {
          console.error(e);
          alert(`Ошибка импорта: ${it.name}\n${e.message}`);
        } finally {
          importOne.disabled = false;
        }
      });

      // двойной клик — быстрый импорт
      card.addEventListener('dblclick', () => importOne.click());

      actions.appendChild(select);
      actions.appendChild(importOne);

      card.appendChild(img);
      card.appendChild(meta);
      card.appendChild(actions);
      internalGalleryEl.appendChild(card);
    });
  }

  // === ЗАГРУЗКА ===
  async function uploadFile(file) {
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/upload', { method: 'POST', body: fd });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  btnUpload.addEventListener('click', async () => {
    const f = fileInput.files?.[0];
    if (!f) return alert('Выбери файл');
    try {
      const res = await uploadFile(f);
      uploadLog.textContent = JSON.stringify(res, null, 2);
      if (galleryVisible) await loadGallery();
    } catch (e) {
      uploadLog.textContent = 'Ошибка: ' + e.message;
    }
  });

  btnDeleteSelected.addEventListener('click', async () => {
    if (selectedUploaded.size === 0) return;
    if (!confirm(`Удалить выбранные (${selectedUploaded.size})?`)) return;
    btnDeleteSelected.disabled = true;
    try {
      const ids = Array.from(selectedUploaded);
      for (const id of ids) {
        const r = await fetch(`/images/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!r.ok) {
          const t = await r.text().catch(()=> '');
          alert(`Не удалось удалить ${id}: ${t || r.status}`);
        }
      }
      await loadGallery();
      alert('Удаление завершено');
    } finally {
      btnDeleteSelected.disabled = false;
    }
  });  

    // --- Поиск/фильтры/пагинация (2.4)
  let searchTimer = null;

  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      uploadedState.q = searchEl.value.trim();
      uploadedState.page = 1;
      saveUploadedState();
      loadGallery().catch(console.error);
    }, 250);
  });

  mimeFilterEl.addEventListener('change', () => {
    uploadedState.mime = mimeFilterEl.value;
    uploadedState.page = 1;
    saveUploadedState();
    loadGallery().catch(console.error);
  });

  limitEl.addEventListener('change', () => {
    uploadedState.limit = Math.max(1, Number(limitEl.value || 12));
    uploadedState.page = 1;
    saveUploadedState();
    loadGallery().catch(console.error);
  });

  sortEl.addEventListener('change', () => {
    uploadedState.sort = sortEl.value;
    uploadedState.page = 1;
    saveUploadedState();
    loadGallery().catch(console.error);
  });

  prevPageBtn.addEventListener('click', () => {
    if (uploadedState.page > 1) {
      uploadedState.page--;
      saveUploadedState();
      loadGallery().catch(console.error);
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (uploadedState.page < uploadedState.pages) {
      uploadedState.page++;
      saveUploadedState();
      loadGallery().catch(console.error);
    }
  });

  // Глобальная блокировка дефолтного drop
  ['dragover','drop'].forEach(ev => {
    window.addEventListener(ev, (e) => e.preventDefault(), { passive:false });
  });

  // Drag&Drop зона
  ['dragenter','dragover'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(ev => {
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', async (e) => {
    const files = e.dataTransfer?.files || [];
    if (!files.length) return;
    try {
      const res = await uploadFile(files[0]);
      uploadLog.textContent = JSON.stringify(res, null, 2);
      if (galleryVisible) await loadGallery();
    } catch (e) {
      uploadLog.textContent = 'Ошибка: ' + e.message;
    }
  });

  // ===== Admin =====
  adminPanel.classList.remove('hidden');

  adminToggle.addEventListener('change', () => {
    const on = adminToggle.checked;
    adminControls.classList.toggle('hidden', !on);
    adminOutput.classList.toggle('hidden', !on);
  });

  unitsEl.addEventListener('change', () => {
    const u = unitsEl.value;
    if (dpiBox) dpiBox.classList.toggle('hidden', u !== 'mm');
  });

  btnAdminPreview.addEventListener('click', async () => {
    if (!currentImageId) return alert('Сначала выбери источник: кликни карточку в «Загруженных».');

    const fit = fitEl.value;
    const background = bgEl.value || '#ffffff';
    const format = fmtEl.value;
    const quality = Math.max(1, Math.min(100, Number(qualityEl.value) || 92));
    const kernel = kernelEl.value; // 'nearest' — пиксели

    try {
      let dataUrl;
      if (unitsEl.value === 'px') {
        const width = Number(targetWEl.value), height = Number(targetHEl.value);
        if (!width || !height) return alert('Задай ширину/высоту.');
        const body = { id: currentImageId, width, height, fit, background, format, quality, kernel };
        const r = await fetch('/proxy-scale-by-id', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();
        dataUrl = j.imageBase64;
      } else {
        const mmWidth = Number(targetWEl.value), mmHeight = Number(targetHEl.value), dpi = Number(dpiEl.value) || 300;
        if (!mmWidth || !mmHeight) return alert('Задай ширину/высоту в мм.');
        const orig = await fetch(`/images/${currentImageId}/original`);
        if (!orig.ok) throw new Error('Не удалось получить оригинал');
        const blob = await orig.blob();
        const buf = await blob.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const mime = blob.type || 'image/jpeg';
        const imageBase64 = `data:${mime};base64,${b64}`;
        const body = { imageBase64, mmWidth, mmHeight, dpi, fit, background, format, quality, kernel };
        const r = await fetch('/proxy-scale-by-mm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();
        dataUrl = j.imageBase64;
      }

      adminPreview.src = dataUrl || '';
      adminPreview.style.imageRendering = (kernel === 'nearest') ? 'pixelated' : 'auto';
    } catch (e) {
      alert('Ошибка предпросмотра: ' + e.message);
    }
  });

  // переключение единиц для User
  userUnits.addEventListener('change', () => {
    const u = userUnits.value;
    userDpiBox.classList.toggle('hidden', u !== 'mm');
  });

  // Сохранение
  btnUserSave.addEventListener('click', () => {
    if (!Number(userW.value) || !Number(userH.value)) { alert('Задай ширину/высоту'); return; }
    saveUserParams();
    userSavedNote.classList.remove('hidden');
    setTimeout(() => userSavedNote.classList.add('hidden'), 1200);
  });

  btnExportProject.addEventListener('click', async () => {
    if (!currentImageId) return alert('Сначала выбери источник: кликни карточку в «Загруженных».');
    // гарантируем актуальность userParams
    saveUserParams();

    // возьмём скалинг из Admin, если он открыт; иначе — дефолты
    const kernel = (kernelEl?.value || 'nearest');
    const format = (fmtEl?.value || 'jpeg');
    const quality = Math.max(1, Math.min(100, Number(qualityEl?.value || 92)));

    const body = {
      id: currentImageId,
      canvas: {
        units: userParams.units,
        width: userParams.width,
        height: userParams.height,
        dpi: userParams.units === 'mm' ? (userParams.dpi || 300) : undefined,
        fit: userParams.fit,
        background: userParams.background
      },
      scaling: { kernel, format, quality }
    };

    try {
      const r = await fetch('/project/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      // инициируем скачивание .mosaic
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `project_${currentImageId}.mosaic`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка экспорта: ' + (e.message || e));
    }
  });

    // Проверка экспорта без скачивания файла
  btnTestExport.addEventListener('click', async () => {
    if (!currentImageId) return alert('Сначала выбери источник: кликни карточку в «Загруженных».');

    // синхронизируем актуальные значения из формы User
    saveUserParams();

    // возьмём скалинг из Admin (если задан) либо дефолты
    const kernel  = (kernelEl?.value || 'nearest');
    const format  = (fmtEl?.value    || 'jpeg');
    const quality = Math.max(1, Math.min(100, Number(qualityEl?.value || 92)));

    const body = {
      id: currentImageId,
      canvas: {
        units: userParams.units,
        width: userParams.width,
        height: userParams.height,
        dpi: userParams.units === 'mm' ? (userParams.dpi || 300) : undefined,
        fit: userParams.fit,
        background: userParams.background
      },
      scaling: { kernel, format, quality }
    };

    try {
      const r = await fetch('/project/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      // если сервер вернул ошибку — прочитаем текст и покажем
      if (!r.ok) {
        const errTxt = await r.text().catch(()=> '');
        return alert('Ошибка экспорта: ' + (errTxt || r.status));
      }

      // успешный ответ — это ZIP (application/zip). Прочитаем только заголовки/размер.
      const ct = r.headers.get('content-type') || '';
      const blob = await r.blob();
      const sizeKB = Math.round(blob.size / 1024);

      if (/application\/zip/i.test(ct) || /\.mosaic$/i.test(r.headers.get('content-disposition') || '')) {
        alert(`Экспорт ОК: получен ZIP (${sizeKB} KB). Значит /project/export работает.`);
      } else {
        // иногда в прокси может прийти JSON — выведем на всякий случай
        const txt = await blob.text().catch(()=> '');
        alert('Ответ не похож на ZIP:\n' + (txt.slice(0, 500) || '(пусто)'));
      }
    } catch (e) {
      alert('Ошибка запроса: ' + (e.message || e));
    }
  });

  // === Делегирование кликов по кнопкам тулбара (ЕДИНСТВЕННЫЙ обработчик для них) ===
  document.addEventListener('click', async (ev) => {
    const btn = ev.target && (ev.target.closest ? ev.target.closest('button') : null);
    if (!btn || !btn.id) return;

    try {
      switch (btn.id) {
        case 'btnShowGallery': {
          console.log('[click] btnShowGallery');
          galleryVisible = !galleryVisible;
          gallerySection.classList.toggle('hidden', !galleryVisible);
          if (galleryVisible) await loadGallery();
          break;
        }
        case 'btnClearGallery': {
          console.log('[click] btnClearGallery');
          if (!confirm('Удалить все загруженные изображения?')) return;
          await fetchJSON('/images', { method: 'DELETE' });
          if (galleryVisible) await loadGallery();
          alert('Галерея очищена');
          break;
        }
        case 'btnShowInternal': {
          console.log('[click] btnShowInternal');
          internalVisible = !internalVisible;
          internalSection.classList.toggle('hidden', !internalVisible);
          btnImportSelected.classList.toggle('hidden', !internalVisible || (selectedInternal.size === 0));
          if (internalVisible) await loadInternal();
          break;
        }
        case 'btnImportSelected': {
          console.log('[click] btnImportSelected');
          if (selectedInternal.size === 0) return;
          const names = Array.from(selectedInternal);
          btn.disabled = true;
          try {
            for (const n of names) {
              try {
                await fetchJSON(`/internal-gallery/import?name=${encodeURIComponent(n)}`, { method: 'POST' });
              } catch (e) {
                console.error(e);
                alert(`Ошибка импорта: ${n}\n${e.message}`);
              }
            }
            selectedInternal.clear();
            btnImportSelected.classList.add('hidden');
            if (galleryVisible) await loadGallery();
            alert('Импорт завершён');
          } finally {
            btn.disabled = false;
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error('Delegated handler error for', btn.id, err);
      alert('Ошибка: ' + (err.message || err));
    }
  });

  // стартовая подгрузка
  loadGallery().catch(err => console.error('loadGallery failed', err));
});
