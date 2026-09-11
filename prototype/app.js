(() => {
  const views = [...document.querySelectorAll('[data-view]')];
  const routeLinks = [...document.querySelectorAll('[data-route]')];
  const collection = document.querySelector('#asset-collection');
  const tableHead = document.querySelector('.asset-table-head');
  const layoutButtons = [...document.querySelectorAll('.view-controls .icon-button')];
  const cards = collection ? [...collection.querySelectorAll('.asset-card')] : [];
  const searchInput = document.querySelector('#global-search');
  const activeQuery = document.querySelector('.active-query');
  const activeQueryText = activeQuery?.querySelector('strong');
  const emptyResults = document.querySelector('.empty-results');
  const dialog = document.querySelector('#capture-dialog');
  const toast = document.querySelector('.toast');
  let activeFilter = 'all';
  let toastTimer;

  const normalized = (value) => value
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  function routeName() {
    const name = window.location.hash.replace('#', '');
    return views.some((view) => view.dataset.view === name) ? name : 'items';
  }

  function showRoute(route, updateHash = true) {
    const validRoute = views.some((view) => view.dataset.view === route) ? route : 'start';
    views.forEach((view) => view.classList.toggle('is-visible', view.dataset.view === validRoute));
    routeLinks.forEach((link) => {
      const isActive = link.dataset.route === validRoute || (validRoute === 'detail' && link.dataset.route === 'items');
      link.classList.toggle('is-active', isActive);
      if (link.classList.contains('nav-link')) {
        link.setAttribute('aria-current', isActive ? 'page' : 'false');
      }
    });
    if (updateHash && window.location.hash !== `#${validRoute}`) {
      window.location.hash = validRoute;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showToast(title, detail = '') {
    if (!toast) return;
    toast.querySelector('strong').textContent = title;
    toast.querySelector('small').textContent = detail;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3100);
  }

  function applyCollectionFilters() {
    const query = normalized(searchInput?.value ?? '');
    const queryTokens = query.split(/\s+/).filter(Boolean);
    let visible = 0;
    cards.forEach((card) => {
      const haystack = normalized(card.dataset.search ?? '');
      const matchesText = queryTokens.length === 0 || queryTokens.every((token) => haystack.includes(token));
      const states = (card.dataset.state ?? '').split(' ');
      const matchesFilter = activeFilter === 'all' || states.includes(activeFilter);
      const matches = matchesText && matchesFilter;
      card.hidden = !matches;
      if (matches) visible += 1;
    });

    if (activeQuery && activeQueryText) {
      activeQuery.hidden = !query;
      activeQueryText.textContent = searchInput.value;
    }
    if (emptyResults) emptyResults.hidden = visible !== 0;
  }

  routeLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      showRoute(link.dataset.route);
    });
  });

  document.querySelectorAll('.route-button').forEach((button) => {
    button.addEventListener('click', () => showRoute(button.dataset.routeTarget));
  });

  document.querySelectorAll('.open-detail').forEach((element) => {
    const open = (event) => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      if (event.type === 'keydown') event.preventDefault();
      showRoute('detail');
    };
    element.addEventListener('click', open);
    element.addEventListener('keydown', open);
  });

  document.querySelectorAll('.open-capture').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof dialog?.showModal === 'function') dialog.showModal();
    });
  });

  document.querySelectorAll('.filter-chip').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.remove('is-active'));
      button.classList.add('is-active');
      activeFilter = button.dataset.filter;
      applyCollectionFilters();
    });
  });

  layoutButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const cardMode = button.getAttribute('aria-label') === 'Widok kart';
      layoutButtons.forEach((control) => control.classList.toggle('is-active', control === button));
      collection?.classList.toggle('is-card-mode', cardMode);
      tableHead?.classList.toggle('is-hidden', cardMode);
      showToast(cardMode ? 'Widok kart' : 'Widok listy', cardMode ? 'Alternatywny układ bez miniaturek.' : 'Więcej rekordów mieści się na ekranie.');
    });
  });

  document.querySelectorAll('.tag-filter').forEach((button) => {
    button.addEventListener('click', () => {
      searchInput.value = button.dataset.tag;
      activeFilter = 'all';
      document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.filter === 'all'));
      showRoute('items');
      applyCollectionFilters();
    });
  });

  searchInput?.addEventListener('input', () => {
    if (searchInput.value && routeName() !== 'items') showRoute('items');
    applyCollectionFilters();
  });

  document.querySelector('.active-query button')?.addEventListener('click', () => {
    searchInput.value = '';
    applyCollectionFilters();
    searchInput.focus();
  });

  document.querySelectorAll('.clear-search').forEach((button) => {
    button.addEventListener('click', () => {
      searchInput.value = '';
      activeFilter = 'all';
      document.querySelectorAll('.filter-chip').forEach((chip) => chip.classList.toggle('is-active', chip.dataset.filter === 'all'));
      applyCollectionFilters();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && !dialog?.open) {
      event.preventDefault();
      searchInput?.focus();
    }
    if (event.key.toLowerCase() === 'n' && (event.metaKey || event.ctrlKey) && !dialog?.open) {
      event.preventDefault();
      dialog?.showModal();
    }
  });

  document.querySelectorAll('.complete-maintenance').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const previous = button.innerHTML;
      button.innerHTML = '<img class="ui-icon" src="assets/icons/check.svg" alt="" aria-hidden="true"> Wykonano';
      button.disabled = true;
      showToast('Czynność zapisana', 'Kolejny termin został wyliczony.');
      window.setTimeout(() => {
        button.innerHTML = previous;
        button.disabled = false;
      }, 3500);
    });
  });

  document.querySelectorAll('.copy-button').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = 'Skopiowano';
        showToast('Skopiowano numer seryjny');
      } catch {
        button.textContent = button.dataset.copy;
        showToast('Numer seryjny', button.dataset.copy);
      }
      window.setTimeout(() => { button.textContent = 'Kopiuj'; }, 2000);
    });
  });

  document.querySelectorAll('.fake-upload').forEach((button) => {
    button.addEventListener('click', () => {
      const upload = document.querySelector('.upload-demo');
      const bar = upload.querySelector('.progress-track i');
      const counter = upload.querySelector('b');
      upload.hidden = false;
      let progress = 0;
      bar.style.width = '0%';
      const timer = window.setInterval(() => {
        progress = Math.min(100, progress + 8 + Math.round(Math.random() * 13));
        bar.style.width = `${progress}%`;
        counter.textContent = `${progress}%`;
        if (progress === 100) {
          window.clearInterval(timer);
          upload.querySelector('span').firstChild.textContent = 'Gotowe · ';
          showToast('Plik bezpiecznie zapisany', 'Oryginał IMG_2841.HEIC został zachowany.');
        }
      }, 160);
    });
  });

  document.querySelector('.save-draft')?.addEventListener('click', () => {
    const name = document.querySelector('#capture-name').value.trim();
    dialog.close();
    showToast('Szkic zapisany', name || 'Znajdziesz go w Skrzynce.');
    document.querySelector('#capture-name').value = '';
  });

  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  window.addEventListener('hashchange', () => showRoute(routeName(), false));
  showRoute(routeName(), false);
  applyCollectionFilters();
})();
