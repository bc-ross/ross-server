 /* =========================
       LEFT: Autocomplete select
       ========================= */
    const COURSES = [
       "BA Accounting ","BA Architecture ","BA Art ","BA Art Education ","BS Astronomy ","BA Athletic Health Care ","BA Biochemistry ","BS Biochemistry ","BA Biology ","BA Biology ","BS Biology ","BS Chemical Engineering ","BA Chemistry ","BA Chemistry ","BS Chemistry ","BS Civil Engineering ","BA Classics ","BA Computer Science ","BS Computer Science ","BA Criminology ","BA Economics ","BS Electrical Engineering ","BA Elementary Education ","BS Engineering Physics ","BA English ","BA English ","BA English ","BA and Theatre Arts ","BA Finance ","BA Foreign Languages ","BA French ","BA French and Secondary Education ","BA Graphic Design ","BA History ","BA International Business ","BA International Studies ","BA Journalism and Mass Communications ","BA Management ","BA Marketing ","BA Mathematics ","BA Mathematics ","BS Mechanical Engineering ","BA Music ","BME Music Education ","BSN Nursing ","BA Philosophy ","BA Philosophy ","BA Physics ","BA Physics ","BS Physics ","BA Politics and Government ","BA Psychology ","BA Secondary Education ","BA Social Science ","BA Sociology ","BA Spanish ","BA Spanish and Secondary Education ","BA Special Education ","BA Strength and Conditioning ","BA Theatre Arts ","BA Theatre Arts Management ","BA Theology ","BA Art ","BA Evangelization & Catechesis ","BA Evangelization & Catechesis ","BA Exercise Science ","BA Exercise Science ","BA Exercise Science ","BA Exercise Science ","BA Finance ","BA Music ","BA Music ","BA Politics and Government ","BA Theology "
    ];
    const input        = document.getElementById('searchInput');
    const dropdown     = document.getElementById('dropdown');
    const dropdownList = document.getElementById('dropdownList');
    const selectedList = document.getElementById('selectedList');
    const selectedSet  = new Set();

    function renderDropdown(items) {
      dropdownList.innerHTML = '';
      if (!items.length) {
        dropdown.style.display = 'none';
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      items.forEach((text, i) => {
        const li = document.createElement('li');
        li.textContent = text;
        li.role = 'option';
        if (i === 0) li.classList.add('active');
        li.addEventListener('click', () => selectCourse(text));
        dropdownList.appendChild(li);
      });
      dropdown.style.display = 'block';
      input.setAttribute('aria-expanded','true');
    }

    function filterCourses(q) {
      q = q.trim().toLowerCase();
      if (!q) {
        dropdown.style.display = 'none';
        input.setAttribute('aria-expanded','false');
        return;
      }
      const matches = COURSES.filter(c => c.toLowerCase().includes(q) && !selectedSet.has(c));
      renderDropdown(matches);
    }

    function addChip(listEl, setRef, text) {
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = text;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Remove');
      btn.textContent = '×';
      btn.addEventListener('click', () => {
        setRef.delete(text);
        listEl.removeChild(li);
        if (listEl === selectedList) filterCourses(input.value);
        saveTaken();
      });

      li.appendChild(btn);
      listEl.appendChild(li);
    }

    function selectCourse(text) {
      if (selectedSet.has(text)) return;
      selectedSet.add(text);
      addChip(selectedList, selectedSet, text);
      input.value = '';
      dropdown.style.display = 'none';
      input.setAttribute('aria-expanded','false');
      input.focus();
    }

    function moveActive(delta) {
      const items = [...dropdownList.querySelectorAll('li')];
      if (!items.length) return;
      let idx = items.findIndex(li => li.classList.contains('active'));
      if (idx === -1) idx = 0;
      items[idx].classList.remove('active');
      idx = (idx + delta + items.length) % items.length;
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', e => filterCourses(e.target.value));
    input.addEventListener('keydown', e => {
      if (dropdown.style.display !== 'block') return;
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const active = dropdownList.querySelector('li.active');
        if (active) selectCourse(active.textContent);
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        input.setAttribute('aria-expanded','false');
      }
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.field-wrap')) {
        dropdown.style.display = 'none';
        input.setAttribute('aria-expanded','false');
      }
    });

    /* =======================================
       RIGHT: Free-entry list with persistence
       ======================================= */
    const takenForm  = document.getElementById('takenForm');
    const takenInput = document.getElementById('takenInput');
    const takenList  = document.getElementById('takenList');
    const STORAGE_KEY = 'ross_taken_courses';
    const takenItems = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));

    function saveTaken(){
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...takenItems]));
    }

    function addTakenChip(text) {
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = text;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Remove');
      btn.textContent = '×';
      btn.addEventListener('click', () => {
        takenItems.delete(text);
        takenList.removeChild(li);
        saveTaken();
      });

      li.appendChild(btn);
      takenList.appendChild(li);
    }

    // Hydrate saved items
    takenItems.forEach(addTakenChip);

    // Prevent navigation
    takenForm.addEventListener('submit', e => e.preventDefault());

    // Enter to add
    takenInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        let val = takenInput.value.trim();
        if (!val) return;
        val = val.toUpperCase(); // normalize
        if (takenItems.has(val)) { takenInput.value=''; return; }
        takenItems.add(val);
        addTakenChip(val);
        saveTaken();
        takenInput.value = '';
      }
    });

    /* ============================
       CTA: Show loading + POST JSON
       ============================ */
    const btn      = document.getElementById('makeScheduleBtn');
    const loading  = document.getElementById('loading');
    const resultEl = document.getElementById('result');

    btn.addEventListener('click', async () => {
      // UI: show loader, lock button
      loading.style.display = 'block';
      resultEl.style.display = 'none';
      resultEl.textContent = '';
      btn.disabled = true;

      // Build JSON payload for backend
      const payload = {
        majors: Array.from(selectedSet),      // left column selections
        courses_taken: Array.from(takenItems) // right column free entries
      };

      try {
        const res = await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log('Response →', data);

        // Show server message (and optionally more details)
        loading.style.display = 'none';
        resultEl.style.display = 'block';
        resultEl.textContent = data?.message || data?.status || 'Schedule request received!';

        // Locate semesters in common shapes or fall back to a small mock so you see tables
        let semesters =
          data?.semesters ||
          data?.plan?.semesters ||
          data?.schedule?.semesters ||
          (data && typeof data === 'object' &&
           Object.keys(data).some(k => /^semester[- _]?\d+$/i.test(k)) ? data : null);

        if (!semesters) {
          console.warn('No semesters in response; using mock so the table renders.');
          semesters = {
            "semester-1": [
              ["MATH","101",3,"Calculus I"],["CHEM","110",4,"General Chemistry I"],
              ["ENGL","120",3,"Composition"],["THEO","1100",3,"Intro to Theology"],["HIST","150",3,"World History I"]
            ],
            "semester-2": [
              ["MATH","102",3,"Calculus II"],["CHEM","120",4,"General Chemistry II"],
              ["PHYS","130",4,"Physics I"],["PHIL","101",3,"Intro to Philosophy"],["ENGL","200",3,"Literature Survey"]
            ]
          };
        }

        renderSchedule(semesters);
      } catch (err) {
        loading.style.display = 'none';
        resultEl.style.display = 'block';
        resultEl.textContent = 'Something went wrong sending your data. Try again.';
        console.error(err);
        document.getElementById('scheduleWrap').style.display = 'none';
      } finally {
        btn.disabled = false; // make clickable again; remove if you want it to stay disabled
      }
    });

    /* ============================
       WHO WE ARE MODAL
       ============================ */
    const openWho   = document.getElementById('openWho');
    const overlay   = document.getElementById('whoOverlay');
    const closeWho  = document.getElementById('closeWho');
    let lastFocused = null;

    function getFocusable(container){
      return [...container.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )];
    }

    function openModal(){
      lastFocused = document.activeElement;
      overlay.style.display = 'flex';
      overlay.setAttribute('aria-hidden','false');
      // lock background scroll
      document.body.dataset.prevOverflow = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
      // focus first focusable in modal
      const focusables = getFocusable(overlay);
      if (focusables.length) focusables[0].focus();
      overlay.addEventListener('keydown', trapTab);
    }

    function closeModal(){
      overlay.style.display = 'none';
      overlay.setAttribute('aria-hidden','true');
      document.body.style.overflow = document.body.dataset.prevOverflow || '';
      if (lastFocused) lastFocused.focus();
      overlay.removeEventListener('keydown', trapTab);
    }

    function trapTab(e){
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab') return;
      const f = getFocusable(overlay);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    if (openWho) openWho.addEventListener('click', openModal);
    if (closeWho) closeWho.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    /* ============================
       SCHEDULE RENDERER (no Notes col)
       ============================ */
function renderSchedule(semesters) {
  const wrap = document.getElementById('scheduleWrap');
  const container = document.getElementById('schedule');
  container.innerHTML = '';

  if (!semesters || typeof semesters !== 'object') {
    wrap.style.display = 'none';
    return;
  }

  const entries = Object.entries(semesters)
    .filter(([_, v]) => Array.isArray(v))
    .map(([key, rows]) => {
      const num = (String(key).match(/\d+/) || [9999])[0];
      return { key, num: parseInt(num, 10), rows };
    })
    .sort((a, b) => a.num - b.num);

  if (!entries.length) {
    wrap.style.display = 'none';
    return;
  }

  for (const { key, rows } of entries) {
    const term = document.createElement('div');
    term.className = 'schedule-term';

    const h = document.createElement('h4');
    h.textContent = prettifyTermName(key);
    term.appendChild(h);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    // Two columns only
    thead.innerHTML = `<tr>
      <th>Course</th>
      <th>Credits</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let termCredits = 0;

    rows.forEach((row) => {
      let subject = '', code = '', credits = '';

      if (Array.isArray(row)) {
        if (row.length >= 3 && typeof row[0] === 'string' && typeof row[1] === 'string') {
          subject = row[0];
          code = row[1];
          credits = row[2];
        } else {
          const first = String(row[0] ?? '');
          const parts = first.split(/[\s-]+/);
          subject = parts[0] || '';
          code = parts.slice(1).join(' ') || '';
          credits = row[1] ?? '';
        }
      } else if (row && typeof row === 'object') {
        subject = row.subject || row.dept || '';
        code    = row.code || row.number || '';
        credits = row.credits ?? row.credit_hours ?? '';
      }

      const credNum = (credits !== '' && credits != null && !Number.isNaN(+credits)) ? +credits : '';
      if (credNum !== '' && Number.isFinite(credNum)) termCredits += credNum;

      const courseCode = [subject, code].filter(Boolean).join('-');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(courseCode)}</td>
        <td>${credNum !== '' ? credNum : ''}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    term.appendChild(table);

    const summary = document.createElement('div');
    summary.className = 'schedule-summary';
    summary.textContent = `Semester Credits: ${termCredits}`;
    term.appendChild(summary);

    container.appendChild(term);
  }

  wrap.style.display = 'block';
}

function prettifyTermName(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}