// -----------------------------
// Simple helpers
// -----------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function openOverlay(el) { el.style.display = "flex"; el.setAttribute("aria-hidden", "false"); }
function closeOverlay(el) { el.style.display = "none"; el.setAttribute("aria-hidden", "true"); }

// -----------------------------
// Modal: Who we are
// -----------------------------
(function initWhoModal(){
  const openBtn = $('#openWho');
  const overlay = $('#whoOverlay');
  const closeBtn = $('#closeWho');

  openBtn?.addEventListener('click', () => openOverlay(overlay));
  closeBtn?.addEventListener('click', () => closeOverlay(overlay));
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay(overlay);
  });
})();

// -----------------------------
// State
// -----------------------------
const state = {
  majors: [],           // selected majors
  taken: [],            // manually-entered completed courses
  reasons: null,        // reasons object from API
  semesters: null       // schedule grid from API
};

// -----------------------------
// Autocomplete (Majors)
// -----------------------------
(async function initMajorsAutocomplete(){
  const input = $('#searchInput');
  const dropdown = $('#dropdown');
  const list = $('#dropdownList');
  const selectedList = $('#selectedList');

  let allMajors = [];
  try {
    const res = await fetch('/api/majors');
    const data = await res.json();
    allMajors = Array.isArray(data.items) ? data.items : [];
  } catch (e) {
    // Non-fatal: allow manual entry fallback
    allMajors = [];
  }

  function renderSelected(){
    selectedList.innerHTML = '';
    state.majors.forEach((m, idx) => {
      const li = document.createElement('li');
      li.className = 'chip';
      li.innerHTML = `${m} <button aria-label="Remove">×</button>`;
      li.querySelector('button').addEventListener('click', () => {
        state.majors.splice(idx,1);
        renderSelected();
      });
      selectedList.appendChild(li);
    });
  }

  function showMatches(q){
    const ql = q.trim().toLowerCase();
    if (!ql) { dropdown.style.display = 'none'; return; }
    const items = allMajors.filter(m => m.toLowerCase().includes(ql) && !state.majors.includes(m)).slice(0,12);
    if (items.length === 0){ dropdown.style.display = 'none'; return; }
    list.innerHTML = '';
    items.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m;
      li.addEventListener('click', () => {
        state.majors.push(m);
        renderSelected();
        input.value = '';
        dropdown.style.display = 'none';
        input.focus();
      });
      list.appendChild(li);
    });
    dropdown.style.display = 'block';
  }

  input.addEventListener('input', () => showMatches(input.value));
  input.addEventListener('focus', () => showMatches(input.value));
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) dropdown.style.display = 'none';
  });

  renderSelected();
})();

// -----------------------------
// Taken Courses input
// -----------------------------
(function initTakenInput(){
  const form = $('#takenForm');
  const input = $('#takenInput');
  const list = $('#takenList');

  function renderTaken(){
    list.innerHTML = '';
    state.taken.forEach((c, idx) => {
      const li = document.createElement('li');
      li.className = 'chip';
      li.innerHTML = `${c} <button aria-label="Remove">×</button>`;
      li.querySelector('button').addEventListener('click', () => {
        state.taken.splice(idx,1);
        renderTaken();
      });
      list.appendChild(li);
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = (input.value || '').trim().toUpperCase();
    if (!val) return;
    if (!state.taken.includes(val)) state.taken.push(val);
    input.value = '';
    renderTaken();
  });

  // Allow Enter on input to submit
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  renderTaken();
})();

// -----------------------------
// Build schedule grid
// -----------------------------
function renderSchedule(semesters){
  const wrap = $('#scheduleWrap');
  const container = $('#schedule');
  container.innerHTML = '';

  if (!semesters || typeof semesters !== 'object'){
    wrap.style.display = 'none';
    return;
  }

  // Sorted by natural term order if keys like "semester-1"
  const entries = Object.entries(semesters)
    .filter(([_, v]) => Array.isArray(v))
    .sort((a,b) => a[0].localeCompare(b[0], undefined, {numeric:true}));

  if (entries.length === 0){
    wrap.style.display = 'none';
    return;
  }

  for (const [term, rows] of entries){
    // rows like ["MATH","101",3,"Calculus I"] or tuples
    const div = document.createElement('div');
    div.className = 'schedule-term';

    const title = document.createElement('h4');
    title.textContent = term.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
    div.appendChild(title);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Course</th>
        <th>Code</th>
        <th>Credits</th>
        <th>Title</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    let total = 0;
    rows.forEach((r) => {
      // Expect [stem, code, credits?, title?]
      const stem = r[0];
      const code = r[1];
      const credits = r.length > 2 && r[2] != null ? r[2] : '';
      const title = r.length > 3 ? r[3] : '';
      if (typeof credits === 'number') total += credits;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${stem ?? ''}</td>
        <td>${code ?? ''}</td>
        <td>${credits === '' ? '' : credits}</td>
        <td>${title ?? ''}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    div.appendChild(table);

    const summary = document.createElement('div');
    summary.className = 'schedule-summary';
    summary.textContent = `Total credits: ${total}`;
    div.appendChild(summary);

    container.appendChild(div);
  }

  wrap.style.display = 'block';
}

// -----------------------------
// NEW: Build the Course Requirements table from reasons
// -----------------------------
function normalizeReasons(reasons){
  // returns array of {course, isMajorReq, foundations[], skills[]}
  const out = [];
  if (!reasons || typeof reasons !== 'object') return out;

  for (const [course, arr] of Object.entries(reasons)){
    const items = Array.isArray(arr) ? arr : [];
    let isMajor = false;
    const foundations = new Set();
    const skills = new Set();

    for (const obj of items){
      const t = obj?.type;
      if (t === 'ProgramRequired' || t === 'CourseReq'){
        isMajor = true;
      } else if (t === 'Foundation'){
        if (obj?.name) foundations.add(obj.name);
      } else if (t === 'SkillsAndPerspective'){
        if (obj?.name) skills.add(obj.name);
      }
      // Ignore "Core" for this table per request
    }

    out.push({
      course,
      isMajorReq: isMajor,
      foundations: Array.from(foundations),
      skills: Array.from(skills)
    });
  }

  // Stable sort: by course code
  out.sort((a,b) => a.course.localeCompare(b.course, undefined, {numeric:true}));
  return out;
}

function renderReasonsTable(reasons){
  const tbody = $('#reasonsTable tbody');
  tbody.innerHTML = '';
  const rows = normalizeReasons(reasons);

  rows.forEach(row => {
    const tr = document.createElement('tr');
    const majorCell = row.isMajorReq ? `<span class="check">✓</span>` : '';
    const fnds = row.foundations.map(n => `<span class="badge">${n}</span>`).join(' ');
    const skls = row.skills.map(n => `<span class="badge">${n}</span>`).join(' ');

    tr.innerHTML = `
      <td>${row.course}</td>
      <td>${majorCell}</td>
      <td>${fnds}</td>
      <td>${skls}</td>
    `;
    tbody.appendChild(tr);
  });
}

// -----------------------------
// Modal: Reasons (like Who we are)
// -----------------------------
(function initReasonsModal(){
  const overlay = $('#reasonsOverlay');
  const openBtn = $('#openReasons');
  const closeBtn = $('#closeReasons');

  openBtn?.addEventListener('click', () => {
    renderReasonsTable(state.reasons);
    openOverlay(overlay);
  });
  closeBtn?.addEventListener('click', () => closeOverlay(overlay));
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) closeOverlay(overlay);
  });
})();

// -----------------------------
// Make Schedule
// -----------------------------
(function initScheduleButton(){
  const btn = $('#makeScheduleBtn');
  const loading = $('#loading');
  const result = $('#result');
  const reqBtnWrap = $('#reqBtnWrap');

  btn.addEventListener('click', async () => {
    result.style.display = 'none';
    reqBtnWrap.style.display = 'none';

    loading.style.display = 'block';
    btn.disabled = true;

    try {
      const payload = {
        majors: state.majors,
        courses_taken: state.taken
      };

      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      state.semesters = data.semesters || null;
      state.reasons = data.reasons || null;

      renderSchedule(state.semesters);

      // Only show the "Course requirements" button if we got reasons
      if (state.reasons && Object.keys(state.reasons).length){
        reqBtnWrap.style.display = 'block';
      } else {
        reqBtnWrap.style.display = 'none';
      }

      loading.style.display = 'none';
      btn.disabled = false;

      result.textContent = data.message || 'Schedule created!';
      result.style.display = 'block';
    } catch (err) {
      loading.style.display = 'none';
      btn.disabled = false;
      result.textContent = 'Something went wrong creating your schedule.';
      result.style.display = 'block';
      console.error(err);
    }
  });
})();
