// Scrape Timeline Courses button handler
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('runScraperBtn');
      if (btn) {
    btn.addEventListener('click', async () => {
      // Inject content script to scrape the current tab
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.executeScript(
            tabs[0].id,
            {
              code: `Array.from(document.querySelectorAll('.dp-coursebubble-indentedtext')).map(b => {
                let isNonTerm = false;
                let el = b;
                while (el) {
                  if (el.classList && el.classList.contains('dp-nontermcourses')) {
                    isNonTerm = true;
                    break;
                  }
                  el = el.parentElement;
                }
                const bubble = b.closest('.dp-coursebubble');
                return JSON.stringify({
                  text: (bubble?.textContent.trim() || b.textContent.trim()),
                  isNonTerm
                });
              })`
            },
            function(results) {
              const modal = document.getElementById('scrapeModal');
              const resultsDiv = document.getElementById('scrapeResults');
              if (results && results[0] && results[0].length) {
                // Extract course codes and credits, but avoid picking up the course number as credits
                const codeRegex = /\b([a-z]{2,4})\s*-\s*([0-9]{3,4})\b/gi;
                // Credits: look for (3), (3.0), 3 credits, 3.0 cr, etc., but not the course number
                const creditRegexes = [
                  /\((\d+(?:\.\d+)?)\)/i, // (3) or (3.0)
                  /(?:credits?|cr)[:\s]*([0-9]+(?:\.[0-9]+)?)/i, // 'credits: 3', 'cr 3.0'
                  /([0-9]+(?:\.[0-9]+)?)\s*(?:credits?|cr)/i // '3 credits', '3.0 cr'
                ];
                const found = [];
                for (const raw of results[0]) {
                  let obj;
                  try { obj = JSON.parse(raw); } catch { continue; }
                  const txt = obj.text.trim();
                  const isNonTerm = obj.isNonTerm || /non[- ]?term/i.test(txt);
                  // Only include courses with a letter grade, 'Completed', or 'Credit Earned', and exclude 'Planned', 'In Progress', 'Future', etc.
                  const lower = txt.toLowerCase();
                  // Exclude if any of these words are present
                  if (/planned|in progress|future|not taken|not started|enrolled|register/i.test(lower)) continue;
                  // Include if any of these are present
                  if (!/completed|taken|credit( earned)?|grade[:]?|\b[a-df][+-]?\b|\bp\b|\bs\b/i.test(lower)) continue;
                  let codeMatch;
                  while ((codeMatch = codeRegex.exec(txt)) !== null) {
                    const code = `${codeMatch[1].toUpperCase()}-${codeMatch[2]}`;
                    // Remove the code from the string to avoid matching the course number
                    let txtNoCode = txt.replace(codeMatch[0], '');
                    let credits = null;
                    if (/no credits or ceus/i.test(txt)) {
                      credits = 'Placement';
                    } else {
                      for (const rx of creditRegexes) {
                        const m = rx.exec(txtNoCode);
                        if (m) {
                          credits = m[1];
                          break;
                        }
                      }
                    }
                    found.push({
                      code,
                      credits: credits || '?'
                    });
                  }
                }
                // Remove duplicates by code
                const unique = [];
                const seen = new Set();
                for (const item of found) {
                  if (!seen.has(item.code)) {
                    seen.add(item.code);
                    unique.push(item);
                  }
                }
                if (unique.length) {
                  // Build two lists: placement (no credits/CEUs) and for-credit
                  const placementList = unique.filter(t => t.credits === 'Placement').map(t => t.code);
                  const forCreditList = unique.filter(t => t.credits !== 'Placement' && t.credits !== '?').map(t => t.code);
                  // For now, log both lists to the console
                  console.log('Placement courses:', placementList);
                  console.log('For-credit courses:', forCreditList);
                  // Show both lists in the popup for user feedback
                  resultsDiv.innerHTML =
                    '<b>Placement (No Credits or CEUs):</b><br>' +
                    (placementList.length ? '<ul style="padding-left:18px;">' + placementList.map(c => `<li>${c}</li>`).join('') + '</ul>' : '<i>None</i>') +
                    '<br><b>For-credit courses:</b><br>' +
                    (forCreditList.length ? '<ul style="padding-left:18px;">' + forCreditList.map(c => `<li>${c}</li>`).join('') + '</ul>' : '<i>None</i>');
                } else {
                  resultsDiv.textContent = 'No matching course codes found.';
                }
              } else {
                resultsDiv.textContent = 'No course bubbles found or not on the correct page.';
              }
              modal.style.display = 'flex';
            }
          );
        });
      } else {
        alert('This feature requires Chrome extension APIs.');
      }
    });
  }

  // Close scrape modal logic
  const closeBtn = document.getElementById('closeScrapeModal');
  const modal = document.getElementById('scrapeModal');
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }
});
/* =========================
       LEFT: Autocomplete select
       ========================= */
let COURSES = [];

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/majors");
    const data = await res.json();
    COURSES = data.items || [];
  } catch (err) {
    console.error("Failed to load majors", err);
  }
});

const input = document.getElementById("searchInput");
const dropdown = document.getElementById("dropdown");
const dropdownList = document.getElementById("dropdownList");
const selectedList = document.getElementById("selectedList");
const selectedSet = new Set();

function renderDropdown(items) {
  dropdownList.innerHTML = "";
  if (!items.length) {
    dropdown.style.display = "none";
    input.setAttribute("aria-expanded", "false");
    return;
  }
  items.forEach((text, i) => {
    const li = document.createElement("li");
    li.textContent = text;
    li.role = "option";
    if (i === 0) li.classList.add("active");
    li.addEventListener("click", () => selectCourse(text));
    dropdownList.appendChild(li);
  });
  dropdown.style.display = "block";
  input.setAttribute("aria-expanded", "true");
}

function filterCourses(q) {
  q = q.trim().toLowerCase();
  if (!q) {
    dropdown.style.display = "none";
    input.setAttribute("aria-expanded", "false");
    return;
  }
  const matches = COURSES.filter(
    (c) => c.toLowerCase().includes(q) && !selectedSet.has(c)
  );
  renderDropdown(matches);
}

function addChip(listEl, setRef, text) {
  const li = document.createElement("li");
  li.className = "chip";
  li.textContent = text;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Remove");
  btn.textContent = "×";
  btn.addEventListener("click", () => {
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
  input.value = "";
  dropdown.style.display = "none";
  input.setAttribute("aria-expanded", "false");
  input.focus();
}

function moveActive(delta) {
  const items = [...dropdownList.querySelectorAll("li")];
  if (!items.length) return;
  let idx = items.findIndex((li) => li.classList.contains("active"));
  if (idx === -1) idx = 0;
  items[idx].classList.remove("active");
  idx = (idx + delta + items.length) % items.length;
  items[idx].classList.add("active");
  items[idx].scrollIntoView({ block: "nearest" });
}

input.addEventListener("input", (e) => filterCourses(e.target.value));
input.addEventListener("keydown", (e) => {
  if (dropdown.style.display !== "block") return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveActive(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveActive(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const active = dropdownList.querySelector("li.active");
    if (active) selectCourse(active.textContent);
  } else if (e.key === "Escape") {
    dropdown.style.display = "none";
    input.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".field-wrap")) {
    dropdown.style.display = "none";
    input.setAttribute("aria-expanded", "false");
  }
});

/* =======================================
       RIGHT: Free-entry list with persistence
       ======================================= */
const takenForm = document.getElementById("takenForm");
const takenInput = document.getElementById("takenInput");
const takenList = document.getElementById("takenList");
const STORAGE_KEY = "ross_taken_courses";
const takenItems = new Set(
  JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
);

function saveTaken() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...takenItems]));
}

function addTakenChip(text) {
  const li = document.createElement("li");
  li.className = "chip";
  li.textContent = text;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", "Remove");
  btn.textContent = "×";
  btn.addEventListener("click", () => {
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
takenForm.addEventListener("submit", (e) => e.preventDefault());

// Enter to add
takenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    let val = takenInput.value.trim();
    if (!val) return;
    val = val.toUpperCase(); // normalize
    if (takenItems.has(val)) {
      takenInput.value = "";
      return;
    }
    takenItems.add(val);
    addTakenChip(val);
    saveTaken();
    takenInput.value = "";
  }
});

/* ============================
       CTA: Show loading + POST JSON
       ============================ */
const btn = document.getElementById("makeScheduleBtn");
const loading = document.getElementById("loading");
const resultEl = document.getElementById("result");

btn.addEventListener("click", async () => {
  // UI: show loader, lock button
  loading.style.display = "block";
  resultEl.style.display = "none";
  resultEl.textContent = "";
  btn.disabled = true;

  // Build JSON payload for backend
  const payload = {
    majors: Array.from(selectedSet), // left column selections
    courses_taken: Array.from(takenItems), // right column free entries
  };

  try {
    const res = await fetch("http://127.0.0.1:8000/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log("Response →", data);

    // Show server message (and optionally more details)
    loading.style.display = "none";
    resultEl.style.display = "block";
    resultEl.textContent =
      data?.message || data?.status || "Schedule request received!";

    // Locate semesters in common shapes or fall back to a small mock so you see tables
    let semesters =
      data?.semesters ||
      data?.plan?.semesters ||
      data?.schedule?.semesters ||
      (data &&
      typeof data === "object" &&
      Object.keys(data).some((k) => /^semester[- _]?\d+$/i.test(k))
        ? data
        : null);
      
      // -----------------------------------------------
      // FIND A BETTER WAY TO DO THIS
      // -----------------------------------------------
      
      if (!semesters) {
      console.warn(
        "No semesters in response; using mock so the table renders."
      );
      semesters = {
        "semester-1": [
          ["MATH", "101", 3, "Calculus I"],
          ["CHEM", "110", 4, "General Chemistry I"],
          ["ENGL", "120", 3, "Composition"],
          ["THEO", "1100", 3, "Intro to Theology"],
          ["HIST", "150", 3, "World History I"],
        ],
        "semester-2": [
          ["MATH", "102", 3, "Calculus II"],
          ["CHEM", "120", 4, "General Chemistry II"],
          ["PHYS", "130", 4, "Physics I"],
          ["PHIL", "101", 3, "Intro to Philosophy"],
          ["ENGL", "200", 3, "Literature Survey"],
        ],
      };
    }

    renderSchedule(semesters);
  } catch (err) {
    loading.style.display = "none";
    resultEl.style.display = "block";
    resultEl.textContent = "Something went wrong sending your data. Try again.";
    console.error(err);
    document.getElementById("scheduleWrap").style.display = "none";
  } finally {
    btn.disabled = false; // make clickable again; remove if you want it to stay disabled
  }
});

/* ============================
       WHO WE ARE MODAL
       ============================ */
const openWho = document.getElementById("openWho");
const overlay = document.getElementById("whoOverlay");
const closeWho = document.getElementById("closeWho");
let lastFocused = null;

function getFocusable(container) {
  return [
    ...container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    ),
  ];
}

function openModal() {
  lastFocused = document.activeElement;
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");
  // lock background scroll
  document.body.dataset.prevOverflow = document.body.style.overflow || "";
  document.body.style.overflow = "hidden";
  // focus first focusable in modal
  const focusables = getFocusable(overlay);
  if (focusables.length) focusables[0].focus();
  overlay.addEventListener("keydown", trapTab);
}

function closeModal() {
  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = document.body.dataset.prevOverflow || "";
  if (lastFocused) lastFocused.focus();
  overlay.removeEventListener("keydown", trapTab);
}

function trapTab(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeModal();
    return;
  }
  if (e.key !== "Tab") return;
  const f = getFocusable(overlay);
  if (!f.length) return;
  const first = f[0],
    last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

if (openWho) openWho.addEventListener("click", openModal);
if (closeWho) closeWho.addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeModal();
});

/* ============================
SCHEDULE RENDERER (no Notes col)
============================ */
function renderSchedule(semesters) {
  const wrap = document.getElementById("scheduleWrap");
  const container = document.getElementById("schedule");
  container.innerHTML = "";

  if (!semesters || typeof semesters !== "object") {
    wrap.style.display = "none";
    return;
  }

  const entries = Object.entries(semesters)
    .filter(([_, v]) => Array.isArray(v))
    .map(([key, rows]) => {
      const isIncoming = String(key).toLowerCase() === "incoming";
      const num = isIncoming ? -1 : (String(key).match(/\d+/) || [9999])[0];
      return { key, isIncoming, num: parseInt(num, 10), rows };
    })
    .sort((a, b) => {
      // incoming always first
      if (a.isIncoming && !b.isIncoming) return -1;
      if (!a.isIncoming && b.isIncoming) return 1;
      return a.num - b.num;
    });

  if (!entries.length) {
    wrap.style.display = "none";
    return;
  }

  for (const { key, rows } of entries) {
    const term = document.createElement("div");
    term.className = "schedule-term";

    const h = document.createElement("h4");
    h.textContent = prettifyTermName(key);
    term.appendChild(h);

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>
      <th>Course</th>
      <th>Credits</th>
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let termCredits = 0;

    rows.forEach((row) => {
      if (!Array.isArray(row) || row.length < 2) return;

      const stem = String(row[0] ?? "").trim();
      const code = String(row[1] ?? "").trim();
      const rawCredits = row[2];
      const credNum = Number.isFinite(Number(rawCredits)) ? Number(rawCredits) : 0;

      termCredits += credNum;

      const courseCode = [stem, code].filter(Boolean).join("-");

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(courseCode)}</td>
        <td>${credNum}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    term.appendChild(table);

    const summary = document.createElement("div");
    summary.className = "schedule-summary";
    summary.textContent = `Semester Credits: ${termCredits}`;
    term.appendChild(summary);

    container.appendChild(term);
  }

  wrap.style.display = "block";
}



function prettifyTermName(key) {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
