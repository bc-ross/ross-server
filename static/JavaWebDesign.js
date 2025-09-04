/* ROSS front-end interactions
   - Autocomplete majors
   - Taken courses chips
   - Build schedule grid
   - Full "Course requirements" modal
   - Per-course popup: if ProgramRequired => show block message only
*/

(() => {
  // ---------------------------
  // Elements
  // ---------------------------
  const searchInput = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');
  const dropdownList = document.getElementById('dropdownList');
  const selectedList = document.getElementById('selectedList');

  const takenForm = document.getElementById('takenForm');
  const takenInput = document.getElementById('takenInput');
  const takenList = document.getElementById('takenList');

  const makeBtn = document.getElementById('makeScheduleBtn');
  const loadingEl = document.getElementById('loading');
  const resultEl = document.getElementById('result');

  const scheduleWrap = document.getElementById('scheduleWrap');
  const scheduleEl = document.getElementById('schedule');
  const reqBtnWrap = document.getElementById('reqBtnWrap');

  // Modals (who)
  const whoOverlay = document.getElementById('whoOverlay');
  document.getElementById('openWho')?.addEventListener('click', () => openModal(whoOverlay));
  document.getElementById('closeWho')?.addEventListener('click', () => closeModal(whoOverlay));

  // Modals (full reasons table)
  const reasonsOverlay = document.getElementById('reasonsOverlay');
  const reasonsTableBody = document.querySelector('#reasonsTable tbody');
  document.getElementById('openReasons')?.addEventListener('click', () => openModal(reasonsOverlay));
  document.getElementById('closeReasons')?.addEventListener('click', () => closeModal(reasonsOverlay));

  // Per-course modal
  const courseOverlay = document.getElementById('courseOverlay');
  const cdBlockMsg = document.getElementById('cdBlockMsg');
  const cdTableWrap = document.getElementById('cdTableWrap');
  const cdCourse = document.getElementById('cdCourse');
  const cdMajor = document.getElementById('cdMajor');
  const cdCore = document.getElementById('cdCore');
  const cdFoundations = document.getElementById('cdFoundations');
  const cdSkills = document.getElementById('cdSkills');
  document.getElementById('closeCourse')?.addEventListener('click', () => closeModal(courseOverlay));

  // Replacement popup elements
  const replacementOverlay = document.getElementById('replacementOverlay');
  const replacementList = document.getElementById('replacementList');
  const replacementFilters = document.getElementById('replacementFilters');
  document.getElementById('closeReplacement')?.addEventListener('click', () => closeModal(replacementOverlay));

  // Close modals on overlay click
  ;[whoOverlay, reasonsOverlay, courseOverlay].forEach(overlay => {
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
  });
  // Esc to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') [whoOverlay, reasonsOverlay, courseOverlay].forEach(closeModal);
  });

  // ---------------------------
  // State
  // ---------------------------
  let majors = [];            // fetched list for autocomplete
  let selectedMajors = [];    // user-selected majors
  let takenCourses = [];      // user-entered "already taken"
  let currentReasons = {};    // reasons payload from backend (keyed by "STEM-CODE")
  let scheduleId = null;      // opaque id from backend

  // ---------------------------
  // Utilities
  // ---------------------------
  function openModal(overlay) {
    if (!overlay) return;
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }
  function closeModal(overlay) {
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }
  function chip(label, onRemove) {
    const li = document.createElement('li');
    li.className = 'chip';
    li.innerHTML = `<span>${label}</span><button type="button" aria-label="Remove">×</button>`;
    li.querySelector('button')?.addEventListener('click', () => onRemove?.());
    return li;
  }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

  function isProgramRequired(reasonItems) {
    return Array.isArray(reasonItems) && reasonItems.some(r => r?.type === 'ProgramRequired');
  }
  function extractTags(reasonItems, kind) {
    // kind: 'Foundation' | 'SkillsAndPerspective' | 'Core'
    const set = new Set();
    (reasonItems || []).forEach(r => {
      if (r?.type === kind && r?.name) set.add(r.name);
    });
    return [...set];
  }

  function extractElectives(reasonItems) {
    // Returns array of "<program>:<name>" for ProgramElective type
    const out = [];
    (reasonItems || []).forEach(r => {
      if (r?.type === 'ProgramElective' && r?.program && r?.name) {
        out.push(`${r.program}: ${r.name}`);
      }
    });
    return out;
  }
  function renderBadgeList(names) {
    if (!names || names.length === 0) return '—';
    return names.map(n => `<span class="badge">${escapeHtml(n)}</span>`).join(' ');
  }
  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // ---------------------------
  // Autocomplete majors
  // ---------------------------
  async function fetchMajors() {
    try {
      const res = await fetch('/api/majors');
      const data = await res.json();
      majors = Array.isArray(data?.items) ? data.items : [];
    } catch (_) {
      majors = [];
    }
  }
  fetchMajors();

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) { dropdown.style.display = 'none'; return; }
    const matches = majors.filter(m => m.toLowerCase().includes(q)).slice(0, 20);
    clear(dropdownList);
    matches.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
      li.addEventListener('click', () => {
        if (!selectedMajors.includes(m)) {
          selectedMajors.push(m);
          renderSelected();
        }
        dropdown.style.display = 'none';
        searchInput.value = '';
      });
      dropdownList.appendChild(li);
    });
    dropdown.style.display = matches.length ? 'block' : 'none';
  });

  function renderSelected() {
    clear(selectedList);
    selectedMajors.forEach(m => {
      selectedList.appendChild(chip(m, () => {
        selectedMajors = selectedMajors.filter(x => x !== m);
        renderSelected();
      }));
    });
  }

  // ---------------------------
  // Taken courses input
  // ---------------------------
  takenForm?.addEventListener('submit', (e) => e.preventDefault());
  takenInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = takenInput.value.trim().toUpperCase();
      if (v && !takenCourses.includes(v)) {
        takenCourses.push(v);
        renderTaken();
      }
      takenInput.value = '';
    }
  });

  function renderTaken() {
    clear(takenList);
    takenCourses.forEach(c => {
      takenList.appendChild(chip(c, () => {
        takenCourses = takenCourses.filter(x => x !== c);
        renderTaken();
      }));
    });
  }

  // ---------------------------
  // Build schedule
  // ---------------------------
  makeBtn?.addEventListener('click', async () => {
    if (selectedMajors.length === 0) {
      resultEl.style.display = 'block';
      resultEl.textContent = 'Please select at least one major.';
      return;
    }
    resultEl.style.display = 'none';
    scheduleWrap.style.display = 'none';
    reqBtnWrap.style.display = 'none';
    clear(scheduleEl);

    loadingEl.style.display = 'block';
    makeBtn.disabled = true;

    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ majors: selectedMajors, courses_taken: takenCourses })
      });
      const data = await res.json();

      loadingEl.style.display = 'none';
      makeBtn.disabled = false;

      if (!res.ok) {
        resultEl.style.display = 'block';
        resultEl.textContent = data?.detail || 'Failed to build schedule.';
        return;
      }

      currentReasons = data?.reasons || {};
      scheduleId = data?.schedule_id || null;

      renderSchedule(data?.semesters || {});
      scheduleWrap.style.display = 'block';
      reqBtnWrap.style.display = 'flex';

      populateReasonsTable(currentReasons);

    } catch (err) {
      loadingEl.style.display = 'none';
      makeBtn.disabled = false;
      resultEl.style.display = 'block';
      resultEl.textContent = 'Network error.';
      console.error(err);
    }
  });

  function formatTermName(key) {
    if (!key) return '';
    const lower = key.toLowerCase();
    if (lower === 'incoming') return 'Incoming';
    if (lower.startsWith('semester-')) {
      const num = lower.split('-')[1];
      return `Semester ${num}`;
    }
    return key.charAt(0).toUpperCase() + key.slice(1);
  }


  function renderSchedule(semesters) {
    clear(scheduleEl);

    const terms = Object.entries(semesters)
      .filter(([_, rows]) => Array.isArray(rows))
      .sort((a, b) => {
        const [ka] = a, [kb] = b;
        if (ka.toLowerCase() === 'incoming') return -1;
        if (kb.toLowerCase() === 'incoming') return 1;
        return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: 'base' });
      });

    terms.forEach(([termName, rows]) => {
      const card = document.createElement('div');
      card.className = 'schedule-term';

      const h = document.createElement('h4');
      h.textContent = formatTermName(termName);
      card.appendChild(h);

      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Course</th>
          <th>Credits</th>
        </tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      let credits = 0;
      rows.forEach(item => {
        const stem = String(item[0] ?? '').trim();
        const code = String(item[1] ?? '').trim();
        const creditsVal = Number(item[2] ?? 0) || 0;
        credits += creditsVal;

        const courseKey = `${stem}-${code}`;
        const tr = document.createElement('tr');
        tr.className = 'course-row';
        tr.dataset.course = courseKey;

        const tdCourse = document.createElement('td');
        tdCourse.textContent = `${stem}-${code}`;
        const tdCred = document.createElement('td');
        tdCred.textContent = String(creditsVal);

        tr.appendChild(tdCourse);
        tr.appendChild(tdCred);

        tr.addEventListener('click', () => {
          // Mark as selected for replacement
          document.querySelectorAll('.course-row.selected').forEach(r => r.classList.remove('selected'));
          tr.classList.add('selected');
          openCourseDetails(courseKey);
        });

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);

      const summary = document.createElement('div');
      summary.className = 'schedule-summary';
      summary.textContent = `Total credits: ${credits}`;

      card.appendChild(table);
      card.appendChild(summary);
      scheduleEl.appendChild(card);
    });
  }

  // ---------------------------
  // Full reasons modal population
  // ---------------------------
  function populateReasonsTable(reasons) {
    clear(reasonsTableBody);
    const sortedKeys = Object.keys(reasons || {}).sort();
    sortedKeys.forEach(courseKey => {
      const items = reasons[courseKey] || [];
      const major = isProgramRequired(items);
      const foundations = extractTags(items, 'Foundation');
      const skills = extractTags(items, 'SkillsAndPerspective');
      const electives = extractElectives(items);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(courseKey)}</td>
        <td class="check">${major ? '✓' : ' '}</td>
        <td>${renderBadgeList(foundations)}</td>
        <td>${renderBadgeList(skills)}</td>
        <td>${renderBadgeList(electives)}</td>
      `;
      reasonsTableBody.appendChild(tr);
    });
  }

  // ---------------------------
  // Per-course details (with major-required block)
  // ---------------------------
  function openCourseDetails(courseKey) {
    // Clean slate each time
    cdBlockMsg?.classList.add('hidden');
    cdTableWrap?.classList.add('hidden');

    const items = currentReasons?.[courseKey] || [];
    const major = isProgramRequired(items);
    const foundations = extractTags(items, 'Foundation');
    const skills = extractTags(items, 'SkillsAndPerspective');
    const core = extractTags(items, 'Core');

    // Update modal title
    const titleEl = document.getElementById('courseTitle');
    if (titleEl) titleEl.textContent = `Course details — ${courseKey}`;

    // Add Find Replacement button if not already present
    let findBtn = document.getElementById('findReplacementBtn');
    if (!findBtn) {
      findBtn = document.createElement('button');
      findBtn.id = 'findReplacementBtn';
      findBtn.textContent = 'Find Replacement';
      findBtn.className = 'btn';
      findBtn.style.marginTop = '12px';
      cdTableWrap?.appendChild(findBtn);
    }
    findBtn.onclick = () => openReplacementPopup(courseKey, foundations, skills);

    if (major) {
      // Show ONLY the message
      cdBlockMsg?.classList.remove('hidden');
      findBtn.style.display = 'none';
    } else {
      // Show the details table
      if (cdCourse) cdCourse.textContent = courseKey;
      if (cdMajor) cdMajor.innerHTML = '—';
      if (cdCore) cdCore.innerHTML = renderBadgeList(core);
      if (cdFoundations) cdFoundations.innerHTML = renderBadgeList(foundations);
      if (cdSkills) cdSkills.innerHTML = renderBadgeList(skills);
      cdTableWrap?.classList.remove('hidden');
      findBtn.style.display = '';
    }

    openModal(courseOverlay);
  }

  // Open replacement popup and send request
  async function openReplacementPopup(courseKey, foundations, skills) {
    // Show loading state
    clear(replacementList);
    replacementList.innerHTML = '<div>Loading replacements...</div>';
    openModal(replacementOverlay);

    // Find the first reason for this course (or build a minimal one)
    const items = currentReasons?.[courseKey] || [];
    let reason = items[0] || { name: foundations[0] || '', type: 'Foundation' };

    // Send request to backend
    try {
      const res = await fetch('/api/replacements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to fetch replacements');
      renderReplacementList(data?.courses || [], foundations, skills);
    } catch (err) {
      replacementList.innerHTML = `<div class="error">${err.message}</div>`;
    }
  }

  // Render replacement courses and filters
  function renderReplacementList(courses) {
    clear(replacementList);
    clear(replacementFilters);

    if (!courses.length) {
      replacementList.innerHTML = '<div>No matching replacements found.</div>';
      return;
    }
    courses.forEach(c => {
      const div = document.createElement('div');
      div.className = 'replacement-course';
      div.innerHTML = `<strong>${escapeHtml(c.course)}</strong>`;
      div.style.cursor = 'pointer';
      div.title = 'Click to replace original course';
      div.onclick = () => {
        replaceCourseInSchedule(c.course);
        closeModal(replacementOverlay);
      };
      replacementList.appendChild(div);
    });
  }

  function replaceCourseInSchedule(newCourse) {
    // Find the selected course row in the schedule and replace its text
    const selectedRow = document.querySelector('.course-row.selected');
    if (selectedRow) {
      const tdCourse = selectedRow.querySelector('td');
      if (tdCourse) tdCourse.textContent = newCourse;
      // Do NOT remove 'selected' class so popup stays open and updates
    }
    // Update the course details popup content only (do not close)
    if (cdCourse) cdCourse.textContent = newCourse;
    const titleEl = document.getElementById('courseTitle');
    if (titleEl) titleEl.textContent = `Course details — ${newCourse}`;
    // Only close the replacement popup, not the course details popup
    closeModal(replacementOverlay);
  }
  }

)();
