'use strict';
/* ToánKho — Trang học sinh làm bài kiểm tra (web/src/kiem-tra/kiem-tra.js)
   - Đồng bộ phong cách với trang chính ToánKho (.shell + .paper + thẻ màu)
   - Chia đề theo đúng bố cục từng phần: PHẦN I (TN4), PHẦN II (Đúng/Sai), PHẦN III (Trả lời ngắn), PHẦN IV (Tự luận)
   - Đảo thứ tự câu hỏi trong nội bộ từng phần (không trộn lẫn các phần với nhau)
   - Bảng điều hướng câu hỏi & thời gian cố định bên phải (sticky), phân biệt rõ: Đã làm / Làm dở / Đánh dấu xem lại / Chưa làm, nhấn vào nhảy tới đúng câu hỏi
   - Trang đầu hiển thị đầy đủ Tên bài kiểm tra, Thời gian làm bài, Số lượng câu hỏi từng phần */

const PART_META = {
  TN4: {
    roman: 'I',
    code: 'TN4',
    title: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn',
    shortTitle: 'Phần I · Trắc nghiệm (TN4)',
    guide: 'Mỗi câu hỏi học sinh chỉ chọn một phương án đúng.',
    pointText: '0,25 điểm',
    colorVar: 'var(--y)',
    tagCls: 'y',
  },
  DS: {
    roman: 'II',
    code: 'DS',
    title: 'PHẦN II. Câu trắc nghiệm đúng sai',
    shortTitle: 'Phần II · Đúng – Sai (ĐS)',
    guide: 'Trong mỗi ý a), b), c), d) ở mỗi câu, học sinh chọn Đúng hoặc Sai.',
    pointText: 'Tối đa 1,0 điểm',
    colorVar: 'var(--p)',
    tagCls: 'p',
  },
  TLN: {
    roman: 'III',
    code: 'TLN',
    title: 'PHẦN III. Câu trắc nghiệm trả lời ngắn',
    shortTitle: 'Phần III · Trả lời ngắn (TLN)',
    guide: 'Học sinh điền đáp số (tối đa 4 ký tự: chữ số, dấu - và dấu , hoặc .) vào ô trả lời.',
    pointText: '0,5 điểm',
    colorVar: 'var(--b)',
    tagCls: 'b',
  },
  TL: {
    roman: 'IV',
    code: 'TL',
    title: 'PHẦN IV. Tự luận',
    shortTitle: 'Phần IV · Tự luận (TL)',
    guide: 'Học sinh trình bày lời giải hoặc đáp số theo yêu cầu của giáo viên.',
    pointText: 'Tự luận',
    colorVar: 'var(--g)',
    tagCls: 'g',
  },
};
const PART_ORDER = ['TN4', 'DS', 'TLN', 'TL'];

const ktState = {
  appsScriptUrl: '',
  examCode: '',
  sessionId: '',
  studentName: '',
  className: '',
  title: 'ĐỀ KIỂM TRA',
  durationMinutes: 0,
  openTime: '',
  closeTime: '',
  startTimeMs: 0,
  deadlineMs: 0,
  serverOffsetMs: 0,
  shuffleQuestions: true,
  shuffleChoices: true,
  questions: [],
  sections: [],           // [{ key, meta, items: [renderedQuestion] }]
  flatRendered: [],       // danh sách phẳng các câu đã sắp theo Phần I, II, III, IV
  answers: {},            // lưu theo nhãn gốc của đề để chấm chính xác trên Apps Script
  flagged: {},            // { [qId]: true } đánh dấu câu cần xem lại
  viewMode: 'all',        // 'all' (xem cả đề) | 'single' (xem từng câu)
  currentUid: '',         // câu đang chọn/xem
  timerId: null,
  submitting: false,
  submitted: false,
  lastResult: null,
  previewCounts: null,
};

const $kt = (s, r = document) => r.querySelector(s);

function storageKey(code) {
  return 'toankho.kiemtra.v1.' + String(code || '').trim().toUpperCase();
}
function metaStorageKey(code) {
  return 'toankho.exam_meta.v1.' + String(code || '').trim().toUpperCase();
}

function saveDraft() {
  if (!ktState.examCode) return;
  try {
    localStorage.setItem(storageKey(ktState.examCode), JSON.stringify({
      appsScriptUrl: ktState.appsScriptUrl,
      examCode: ktState.examCode,
      sessionId: ktState.sessionId,
      studentName: ktState.studentName,
      className: ktState.className,
      title: ktState.title,
      durationMinutes: ktState.durationMinutes,
      openTime: ktState.openTime,
      closeTime: ktState.closeTime,
      startTimeMs: ktState.startTimeMs,
      deadlineMs: ktState.deadlineMs,
      serverOffsetMs: ktState.serverOffsetMs,
      shuffleQuestions: ktState.shuffleQuestions,
      shuffleChoices: ktState.shuffleChoices,
      questions: ktState.questions,
      answers: ktState.answers,
      flagged: ktState.flagged,
      submitted: ktState.submitted,
      lastResult: ktState.lastResult,
    }));
  } catch {}
}

function loadDraft(code) {
  if (!code) return null;
  try {
    const raw = localStorage.getItem(storageKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePreviewMeta(code, meta) {
  if (!code || !meta) return;
  try {
    localStorage.setItem(metaStorageKey(code), JSON.stringify(meta));
  } catch {}
}

function loadPreviewMeta(code) {
  if (!code) return null;
  try {
    const raw = localStorage.getItem(metaStorageKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function showBanner(msg, type = 'warn') {
  const b = $kt('#ktBanner');
  if (!msg) {
    b.hidden = true;
    b.textContent = '';
    return;
  }
  b.textContent = msg;
  b.className = 'kt-Banner' + (type === 'err' ? ' err' : type === 'ok' ? ' ok' : '');
  b.hidden = false;
}

// Bộ sinh số ngẫu nhiên có hạt giống (seeded PRNG) theo mã phiên để mỗi học sinh một thứ tự nhưng cố định khi F5
function createSeededRng(seedStr) {
  let hVal = 2166136261 >>> 0;
  const s = String(seedStr || 'TOANKHO');
  for (let i = 0; i < s.length; i++) {
    hVal ^= s.charCodeAt(i);
    hVal = Math.imul(hVal, 16777619);
  }
  return function () {
    hVal += hVal << 13; hVal ^= hVal >>> 7;
    hVal += hVal << 3;  hVal ^= hVal >>> 17;
    hVal += hVal << 5;
    return (hVal >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Chia danh sách câu hỏi vào đúng từng Phần I (TN4), Phần II (DS), Phần III (TLN), Phần IV (TL).
 * Nếu bật shuffleQuestions, chỉ đảo thứ tự câu hỏi TRONG NỘI BỘ TỪNG PHẦN.
 */
function buildSectionsAndQuestions() {
  const baseSeed = ktState.sessionId || ktState.examCode || 'DEFAULT';
  const labels = ['A', 'B', 'C', 'D'];
  const sections = [];
  const flat = [];
  let globalIdx = 0;

  for (const partKey of PART_ORDER) {
    const partMeta = PART_META[partKey];
    const partRng = createSeededRng(baseSeed + '_' + partKey);

    let group = (ktState.questions || []).filter(
      (q) => String(q.loai || q.type || 'TN4').toUpperCase() === partKey
    );
    if (!group.length) continue;

    if (ktState.shuffleQuestions) {
      group = seededShuffle(group, partRng);
    }

    const items = group.map((q, idxInPart) => {
      globalIdx++;
      const qId = q.ma || q.id || (`${partKey}_${idxInPart + 1}`);
      const stem = q.de || q.stem || '';
      const hinh = Array.isArray(q.hinh) ? q.hinh : (q.svg ? [{ id: qId, svg: q.svg }] : []);

      let rawChoices = [];
      if (Array.isArray(q.choices)) {
        rawChoices = q.choices;
      } else if (q.choices && typeof q.choices === 'object') {
        rawChoices = [q.choices.A, q.choices.B, q.choices.C, q.choices.D].filter((x) => x !== undefined);
      }

      let rawTf = [];
      if (Array.isArray(q.tf)) {
        rawTf = q.tf;
      } else if (q.items && typeof q.items === 'object') {
        rawTf = [q.items.a, q.items.b, q.items.c, q.items.d].filter((x) => x !== undefined);
      }

      let choiceMapping = [];
      if (partKey === 'TN4' && rawChoices.length) {
        const choiceRng = createSeededRng(baseSeed + '_CHOICE_' + qId);
        const origIndices = rawChoices.map((_, i) => i);
        const orderedIndices = ktState.shuffleChoices ? seededShuffle(origIndices, choiceRng) : origIndices;
        choiceMapping = orderedIndices.map((origIdx, displayIdx) => ({
          displayLabel: labels[displayIdx] || String(displayIdx + 1),
          originalKey: labels[origIdx] || String(origIdx + 1),
          content: rawChoices[origIdx] || '',
        }));
      }

      const item = {
        uid: `q_${partKey}_${idxInPart + 1}`,
        id: qId,
        partKey,
        partRoman: partMeta.roman,
        numberInPart: idxInPart + 1,
        globalNumber: globalIdx,
        type: partKey,
        stem,
        hinh,
        tf: rawTf,
        choiceMapping,
      };
      flat.push(item);
      return item;
    });

    sections.push({
      key: partKey,
      meta: partMeta,
      items,
    });
  }

  ktState.sections = sections;
  ktState.flatRendered = flat;
  if (!ktState.currentUid && flat.length) {
    ktState.currentUid = flat[0].uid;
  }
}

/**
 * Kiểm tra trạng thái làm bài của 1 câu hỏi:
 * - 'done': đã làm đầy đủ (TN4 đã chọn, DS đủ 4/4 ý, TLN đã nhập)
 * - 'partial': đang làm dở (DS mới chọn 1..3 ý)
 * - 'empty': chưa làm
 */
function getQuestionStatus(rq) {
  const ans = ktState.answers[rq.id];
  if (rq.type === 'TN4') {
    if (ans && String(ans).trim() !== '') {
      // Tìm nhãn đang hiển thị trên màn hình của học sinh (A/B/C/D)
      const found = rq.choiceMapping.find((cm) => cm.originalKey === ans);
      return { state: 'done', badge: found ? found.displayLabel : ans, detail: 'Đã chọn ' + (found ? found.displayLabel : ans) };
    }
    return { state: 'empty', badge: '—', detail: 'Chưa chọn' };
  }
  if (rq.type === 'DS') {
    if (!ans || typeof ans !== 'object') return { state: 'empty', badge: '0/4', detail: 'Chưa làm (0/4 ý)' };
    const keys = ['a', 'b', 'c', 'd'];
    const count = keys.filter((k) => ans[k] === 'Đ' || ans[k] === 'S').length;
    if (count === 0) return { state: 'empty', badge: '0/4', detail: 'Chưa làm (0/4 ý)' };
    if (count < 4) return { state: 'partial', badge: `${count}/4`, detail: `Đang làm (${count}/4 ý)` };
    const summary = keys.map((k) => ans[k]).join('');
    return { state: 'done', badge: summary, detail: 'Đã làm đủ 4/4 ý' };
  }
  if (rq.type === 'TLN' || rq.type === 'TL') {
    const s = String(ans ?? '').trim();
    if (s !== '') return { state: 'done', badge: s, detail: 'Đã điền: ' + s };
    return { state: 'empty', badge: '—', detail: 'Chưa điền đáp số' };
  }
  return { state: 'empty', badge: '—', detail: 'Chưa làm' };
}

/**
 * Vẽ giao diện các Phần I, II, III, IV và danh sách câu hỏi bên cột trái
 */
function renderExamSections() {
  const root = $kt('#ktQuestionSections');
  root.replaceChildren();

  for (const sec of ktState.sections) {
    const secEl = h('section', { class: 'kt-part-sec', 'data-part': sec.key });

    // Tiêu đề phần (PHẦN I, PHẦN II, PHẦN III, PHẦN IV)
    const headEl = h('div', { class: 'kt-part-head', style: `--c:${sec.meta.colorVar}` },
      h('span', { class: 'kt-part-badge' }, `PHẦN ${sec.meta.roman}`),
      h('div', { class: 'grow' },
        h('div', { class: 'kt-part-title' }, sec.meta.title),
        h('div', { class: 'kt-part-sub' }, `${sec.meta.guide} (${sec.items.length} câu · ${sec.meta.pointText}/câu)`)));
    secEl.append(headEl);

    const qList = h('div', { class: 'qlist' });
    for (const rq of sec.items) {
      qList.append(renderQuestionCard(rq));
    }
    secEl.append(qList);
    root.append(secEl);
  }

  applyViewModeFilter();
  renderNavigationSidebar();
}

function renderQuestionCard(rq) {
  const st = getQuestionStatus(rq);
  const isFlagged = Boolean(ktState.flagged[rq.id]);
  const meta = PART_META[rq.type] || PART_META.TN4;

  const statusTag = h('span', {
    class: 'tag ' + (st.state === 'done' ? 'g' : st.state === 'partial' ? 'y' : ''),
    id: `status_${rq.uid}`,
  }, st.detail);

  const flagBtn = h('button', {
    type: 'button',
    class: 'kt-flag-btn' + (isFlagged ? ' on' : ''),
    onclick: () => {
      if (ktState.flagged[rq.id]) delete ktState.flagged[rq.id];
      else ktState.flagged[rq.id] = true;
      flagBtn.classList.toggle('on', Boolean(ktState.flagged[rq.id]));
      flagBtn.textContent = ktState.flagged[rq.id] ? '★ Đã đánh dấu xem lại' : '☆ Đánh dấu xem lại';
      card.classList.toggle('flagged-card', Boolean(ktState.flagged[rq.id]));
      saveDraft();
      renderNavigationSidebar();
    },
  }, isFlagged ? '★ Đã đánh dấu xem lại' : '☆ Đánh dấu xem lại');

  const card = h('article', {
    class: 'q kt-q' + (st.state === 'done' ? ' done-card' : '') + (isFlagged ? ' flagged-card' : ''),
    id: rq.uid,
    'data-uid': rq.uid,
  },
  h('div', { class: 'q-head' },
    h('span', { class: 'tag k' }, `Câu ${rq.numberInPart} (Phần ${rq.partRoman})`),
    h('span', { class: 'tag ' + meta.tagCls }, meta.pointText),
    statusTag,
    h('span', { class: 'grow' }),
    flagBtn));

  const body = h('div', { class: 'q-body' }, h('div', { html: renderRich(rq.stem) }));
  rq.hinh.forEach((f) => body.append(figEl(f, '../')));
  card.append(body);

  // Dạng 1: Trắc nghiệm 4 lựa chọn (TN4)
  if (rq.type === 'TN4') {
    const curAns = ktState.answers[rq.id] || '';
    const maxLen = Math.max(0, ...rq.choiceMapping.map((c) => c.content.length));
    const gridCls = maxLen < 16 ? 'c4' : maxLen < 68 ? '' : 'c1';
    const choiceWrap = h('div', { class: 'kt-choices-grid ' + gridCls });

    rq.choiceMapping.forEach((cm) => {
      const btn = h('button', {
        type: 'button',
        class: 'kt-choice' + (curAns === cm.originalKey ? ' selected' : ''),
        onclick: () => {
          ktState.answers[rq.id] = cm.originalKey;
          ktState.currentUid = rq.uid;
          saveDraft();
          choiceWrap.querySelectorAll('.kt-choice').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          refreshQuestionCardState(rq, card);
          renderNavigationSidebar();
        },
      },
      h('span', { class: 'kt-choice-badge' }, cm.displayLabel),
      h('div', { class: 'q-body', style: 'margin:0', html: renderRich(cm.content).replace(/^<p>|<\/p>$/g, '') }));
      choiceWrap.append(btn);
    });
    card.append(choiceWrap);
  }
  // Dạng 2: Đúng / Sai 4 ý (DS)
  else if (rq.type === 'DS') {
    const curDs = (ktState.answers[rq.id] && typeof ktState.answers[rq.id] === 'object') ? ktState.answers[rq.id] : {};
    const dsTable = h('div', { class: 'kt-ds-table' });
    const keys = ['a', 'b', 'c', 'd'];

    rq.tf.forEach((statement, idx) => {
      const k = keys[idx] || String(idx);
      const btnD = h('button', { type: 'button', class: 'kt-ds-btn' + (curDs[k] === 'Đ' ? ' on-d' : '') }, 'Đúng');
      const btnS = h('button', { type: 'button', class: 'kt-ds-btn' + (curDs[k] === 'S' ? ' on-s' : '') }, 'Sai');

      const choose = (val) => {
        if (!ktState.answers[rq.id] || typeof ktState.answers[rq.id] !== 'object') ktState.answers[rq.id] = {};
        ktState.answers[rq.id][k] = val;
        ktState.currentUid = rq.uid;
        saveDraft();
        btnD.classList.toggle('on-d', val === 'Đ');
        btnS.classList.toggle('on-s', val === 'S');
        refreshQuestionCardState(rq, card);
        renderNavigationSidebar();
      };

      btnD.onclick = () => choose('Đ');
      btnS.onclick = () => choose('S');

      dsTable.append(h('div', { class: 'kt-ds-row' },
        h('div', { class: 'q-body', style: 'flex:1;margin:0', html: `<b>${k})</b> ` + renderRich(statement).replace(/^<p>|<\/p>$/g, '') }),
        h('div', { class: 'kt-ds-btns' }, btnD, btnS)));
    });
    card.append(dsTable);
  }
  // Dạng 3: Trả lời ngắn (TLN) - giới hạn 4 ký tự kèm 4 ô hiển thị trực quan
  else if (rq.type === 'TLN' || rq.type === 'TL') {
    const initVal = String(ktState.answers[rq.id] || '');
    const slotsWrap = h('div', { class: 'kt-tln-slots', 'aria-hidden': 'true' });
    const updateSlots = (val) => {
      slotsWrap.replaceChildren();
      for (let i = 0; i < 4; i++) {
        const ch = val[i] || '';
        slotsWrap.append(h('span', { class: 'kt-tln-slot' + (ch ? ' filled' : '') }, ch));
      }
    };
    updateSlots(initVal);

    const inp = h('input', {
      type: 'text',
      inputmode: 'decimal',
      maxlength: '4',
      class: 'kt-tln-input',
      placeholder: 'Nhập đáp số',
      value: initVal,
      oninput: (ev) => {
        const cleaned = ev.target.value
          .replace(/[−–—]/g, '-')
          .replace(/[^0-9\-,.]/g, '')
          .slice(0, 4);
        if (ev.target.value !== cleaned) ev.target.value = cleaned;
        ktState.answers[rq.id] = cleaned;
        ktState.currentUid = rq.uid;
        updateSlots(cleaned);
        saveDraft();
        refreshQuestionCardState(rq, card);
        renderNavigationSidebar();
      },
    });

    card.append(h('div', { class: 'kt-tln-box' },
      h('label', { style: 'font-weight:600;font-size:14px' }, 'Đáp số của em:'),
      inp,
      slotsWrap,
      h('span', { class: 'muted small' }, 'Tối đa 4 ký tự (chữ số, dấu - và dấu , hoặc .)')));
  }

  // Thanh điều hướng Câu trước / Câu tiếp khi đang ở chế độ xem "Từng câu"
  const singleNav = h('div', { class: 'q-act kt-single-nav', hidden: ktState.viewMode !== 'single', style: 'justify-content:space-between' },
    h('button', { type: 'button', class: 'btn ghost sm', onclick: () => stepQuestion(-1) }, '← Câu trước'),
    h('span', { class: 'muted small' }, `Câu ${rq.globalNumber} / ${ktState.flatRendered.length}`),
    h('button', { type: 'button', class: 'btn sm', onclick: () => stepQuestion(1) }, 'Câu tiếp theo →'));
  card.append(singleNav);

  return card;
}

function refreshQuestionCardState(rq, card) {
  const st = getQuestionStatus(rq);
  card.classList.toggle('done-card', st.state === 'done');
  const tag = $kt(`#status_${rq.uid}`, card);
  if (tag) {
    tag.className = 'tag ' + (st.state === 'done' ? 'g' : st.state === 'partial' ? 'y' : '');
    tag.textContent = st.detail;
  }
}

/**
 * Vẽ Bảng điều hướng câu hỏi & Tiến độ ở góc bên phải (Sticky Right Sidebar)
 * Khi học sinh nhấn vào bất kỳ câu hỏi nào trên bảng này -> nhảy/cuộn mượt đến đúng câu đó
 */
function renderNavigationSidebar() {
  const navBox = $kt('#ktNavContainer');
  if (!navBox) return;
  navBox.replaceChildren();

  let doneCount = 0;
  let partialCount = 0;
  const totalCount = ktState.flatRendered.length;

  for (const sec of ktState.sections) {
    let secDone = 0;
    const grid = h('div', { class: 'kt-nav-grid' });

    for (const rq of sec.items) {
      const st = getQuestionStatus(rq);
      if (st.state === 'done') { doneCount++; secDone++; }
      else if (st.state === 'partial') partialCount++;

      const isCurrent = ktState.currentUid === rq.uid;
      const isFlagged = Boolean(ktState.flagged[rq.id]);

      const btn = h('button', {
        type: 'button',
        class: 'kt-nav-btn'
          + (st.state === 'done' ? ' done' : st.state === 'partial' ? ' partial' : '')
          + (isCurrent ? ' current' : '')
          + (isFlagged ? ' flagged' : ''),
        title: `Phần ${sec.meta.roman} · Câu ${rq.numberInPart}: ${st.detail}`,
        onclick: () => jumpToQuestion(rq.uid),
      },
      h('span', { class: 'n' }, rq.numberInPart),
      h('span', { class: 'a' }, st.badge));

      grid.append(btn);
    }

    const partBlock = h('div', { class: 'kt-nav-part' },
      h('div', { class: 'kt-nav-part-title' },
        h('span', null, sec.meta.shortTitle),
        h('span', null, `${secDone}/${sec.items.length}`)),
      grid);
    navBox.append(partBlock);
  }

  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  $kt('#ktProgressText').textContent = `${doneCount} / ${totalCount} câu`;
  $kt('#ktProgressBar').style.width = `${pct}%`;
  $kt('#ktMobileProgress').textContent = `Đã làm: ${doneCount}/${totalCount}` + (partialCount ? ` (${partialCount} làm dở)` : '');
}

/**
 * Khi học sinh nhấn vào ô số câu hỏi trên bảng bên phải:
 * - Nếu đang ở chế độ "Từng câu": hiện ngay đúng câu đó
 * - Nếu đang ở chế độ "Cả đề": cuộn mượt đến đúng câu đó và nháy viền nổi bật
 */
function jumpToQuestion(uid) {
  ktState.currentUid = uid;
  applyViewModeFilter();
  renderNavigationSidebar();

  const card = document.getElementById(uid);
  if (!card) return;

  document.querySelectorAll('.q.kt-q.active-focus').forEach((el) => el.classList.remove('active-focus'));
  card.classList.add('active-focus');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => card.classList.remove('active-focus'), 1800);
}

function stepQuestion(delta) {
  const list = ktState.flatRendered;
  if (!list.length) return;
  const idx = Math.max(0, list.findIndex((x) => x.uid === ktState.currentUid));
  const nextIdx = Math.min(list.length - 1, Math.max(0, idx + delta));
  jumpToQuestion(list[nextIdx].uid);
}

function applyViewModeFilter() {
  const single = ktState.viewMode === 'single';
  $kt('#ktModeAllBtn')?.classList.toggle('on', !single);
  $kt('#ktModeSingleBtn')?.classList.toggle('on', single);

  document.querySelectorAll('.kt-single-nav').forEach((el) => { el.hidden = !single; });

  for (const sec of ktState.sections) {
    const secEl = document.querySelector(`.kt-part-sec[data-part="${sec.key}"]`);
    if (!secEl) continue;
    if (!single) {
      secEl.hidden = false;
      sec.items.forEach((rq) => {
        const c = document.getElementById(rq.uid);
        if (c) c.hidden = false;
      });
    } else {
      const hasCurrent = sec.items.some((rq) => rq.uid === ktState.currentUid);
      secEl.hidden = !hasCurrent;
      sec.items.forEach((rq) => {
        const c = document.getElementById(rq.uid);
        if (c) c.hidden = rq.uid !== ktState.currentUid;
      });
    }
  }
}

function startTimer() {
  const timerEl = $kt('#ktTimer');
  const mobTimerEl = $kt('#ktMobileTimer');
  if (ktState.timerId) clearInterval(ktState.timerId);

  const tick = () => {
    const nowServer = Date.now() + (ktState.serverOffsetMs || 0);
    const remainMs = ktState.deadlineMs - nowServer;
    if (remainMs <= 0) {
      timerEl.textContent = '00:00';
      mobTimerEl.textContent = '00:00';
      clearInterval(ktState.timerId);
      if (!ktState.submitted && !ktState.submitting) {
        showBanner('Đã hết giờ làm bài! Hệ thống đang tự động nộp bài của em…', 'warn');
        submitExamWithRetry(true);
      }
      return;
    }
    const sec = Math.ceil(remainMs / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    timerEl.textContent = text;
    mobTimerEl.textContent = text;
    timerEl.classList.toggle('urgent', sec <= 60);
  };

  tick();
  ktState.timerId = setInterval(tick, 1000);
}

async function loadAppsScriptUrl() {
  const params = new URLSearchParams(window.location.search);
  const fromParam = params.get('s') || params.get('api') || '';
  if (fromParam) {
    ktState.appsScriptUrl = fromParam;
    localStorage.setItem('toankho.apps_script_url', fromParam);
    return;
  }
  for (const path of ['../config.json', '../data/cauhoi.json']) {
    try {
      const r = await fetch(path + '?v=' + Date.now());
      if (r.ok) {
        const j = await r.json();
        const url = j.apps_script_url || j.appsScriptUrl || '';
        if (url) { ktState.appsScriptUrl = url; return; }
      }
    } catch {}
  }
  const savedUrl = localStorage.getItem('toankho.apps_script_url') || '';
  if (savedUrl) ktState.appsScriptUrl = savedUrl;
}

async function callAppsScript(payload) {
  if (!ktState.appsScriptUrl) {
    throw new Error('Chưa cấu hình địa chỉ máy chủ Apps Script trong web/config.json.');
  }
  const r = await fetch(ktState.appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return await r.json();
}

/**
 * Hiển thị thông tin bài kiểm tra ở Trang đầu (Tên bài, Thời gian làm bài, Số lượng câu hỏi từng phần)
 */
function renderStartPreview(info) {
  if (!info) return;
  const code = info.examCode || ktState.examCode || '---';
  $kt('#ktPreviewCode').textContent = 'MÃ ĐỀ: ' + code;
  if (info.title) {
    ktState.title = info.title;
    $kt('#ktPreviewTitle').textContent = info.title;
  }
  if (info.durationMinutes) {
    ktState.durationMinutes = +info.durationMinutes;
    $kt('#ktPreviewTime').textContent = `${info.durationMinutes} phút`;
  }
  if (info.closeTime) {
    const d = new Date(info.closeTime);
    if (!isNaN(d.getTime())) {
      $kt('#ktPreviewCloseNote').textContent = 'Đóng đề: ' + d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    }
  }

  const c = info.counts || {};
  const tn4 = c.TN4 ?? 0;
  const ds = c.DS ?? 0;
  const tln = c.TLN ?? 0;
  const total = c.total ?? (tn4 + ds + tln + (c.TL || 0));

  if (total > 0) {
    $kt('#ktPreviewTN4').textContent = `${tn4} câu`;
    $kt('#ktPreviewDS').textContent = `${ds} câu`;
    $kt('#ktPreviewTLN').textContent = `${tln} câu`;
    $kt('#ktPreviewTotal').textContent = `${total} câu`;
    $kt('#ktPreviewSub').textContent = `Đề gồm ${total} câu hỏi được chia theo cấu trúc chuẩn THPT 2025. Điền Họ tên và Lớp rồi bấm "Bắt đầu làm bài".`;
  }

  const stateBadge = $kt('#ktPreviewState');
  const directRevBtn = $kt('#ktDirectReviewBtn');
  if (info.status === 'CLOSED') {
    stateBadge.className = 'tag warn';
    stateBadge.textContent = 'Đã đóng nhận bài · Đã mở đáp án';
    directRevBtn.hidden = false;
  } else if (info.status === 'NOT_OPEN') {
    stateBadge.className = 'tag y';
    stateBadge.textContent = 'Chưa đến giờ mở đề';
    directRevBtn.hidden = true;
  } else if (info.status === 'OPEN') {
    stateBadge.className = 'tag g';
    stateBadge.textContent = 'Đang mở nhận bài';
    directRevBtn.hidden = true;
  } else {
    stateBadge.className = 'tag';
    stateBadge.textContent = 'Đang kiểm tra…';
  }
  if (info.status === 'NOT_OPEN' && info.openTimeMs) {
    $kt('#ktPreviewCloseNote').textContent = 'Mở đề: ' + new Date(info.openTimeMs).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  }
}

/**
 * Tải thông tin đề kiểm tra cho trang đầu từ:
 * 1) Tham số trên URL (nếu có) hoặc bộ nhớ đệm trên máy
 * 2) Máy chủ Apps Script (action: getExamInfo)
 */
async function fetchAndShowExamPreview(code) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return;

  // 1. Kiểm tra thông tin nhúng từ URL hoặc bộ nhớ đệm trên máy trước để hiện tức thì
  const params = new URLSearchParams(window.location.search);
  const urlTitle = params.get('t');
  const urlDur = params.get('d');
  const urlCounts = params.get('c'); // định dạng "12-4-6"
  if (urlTitle || urlDur || urlCounts) {
    const parts = (urlCounts || '').split('-').map((x) => +x || 0);
    renderStartPreview({
      examCode: cleanCode,
      title: urlTitle || 'ĐỀ KIỂM TRA',
      durationMinutes: +urlDur || 15,
      counts: {
        TN4: parts[0] || 0,
        DS: parts[1] || 0,
        TLN: parts[2] || 0,
        total: (parts[0] || 0) + (parts[1] || 0) + (parts[2] || 0),
      },
    });
  }

  const cachedMeta = loadPreviewMeta(cleanCode);
  if (cachedMeta) renderStartPreview(cachedMeta);

  const savedDraft = loadDraft(cleanCode);
  if (savedDraft && Array.isArray(savedDraft.questions) && savedDraft.questions.length) {
    const counts = { TN4: 0, DS: 0, TLN: 0, TL: 0, total: savedDraft.questions.length };
    savedDraft.questions.forEach((q) => {
      const k = String(q.loai || q.type || 'TN4').toUpperCase();
      if (counts[k] !== undefined) counts[k]++;
    });
    const dur = savedDraft.durationMinutes || Math.max(1, Math.round(((savedDraft.deadlineMs || 0) - (savedDraft.startTimeMs || 0)) / 60000));
    renderStartPreview({
      examCode: cleanCode,
      title: savedDraft.title || 'ĐỀ KIỂM TRA',
      durationMinutes: dur,
      counts,
    });
  }

  // 2. Gọi máy chủ Apps Script để lấy thông tin mới nhất (getExamInfo)
  if (!ktState.appsScriptUrl) return;
  try {
    const res = await callAppsScript({ action: 'getExamInfo', examCode: cleanCode });
    if (res && res.ok) {
      savePreviewMeta(cleanCode, res);
      renderStartPreview(res);
    }
  } catch {}
}

// Khi máy chủ bận (> 30 lượt cùng lúc), tự động gửi lại sau 2, 4, 8, 16 giây
async function submitExamWithRetry(isAuto = false) {
  if (ktState.submitting || ktState.submitted) return;

  if (!isAuto) {
    let emptyCount = 0;
    let partialCount = 0;
    for (const rq of ktState.flatRendered) {
      const st = getQuestionStatus(rq);
      if (st.state === 'empty') emptyCount++;
      else if (st.state === 'partial') partialCount++;
    }
    let confirmMsg = 'Em có chắc chắn muốn nộp bài ngay bây giờ không?';
    if (emptyCount > 0 || partialCount > 0) {
      const notes = [];
      if (emptyCount > 0) notes.push(`${emptyCount} câu chưa làm`);
      if (partialCount > 0) notes.push(`${partialCount} câu Đúng/Sai chưa chọn đủ 4 ý`);
      confirmMsg = `Cảnh báo: Em còn ${notes.join(' và ')}.\n\nEm vẫn muốn nộp bài ngay bây giờ chứ?`;
    }
    if (!confirm(confirmMsg)) return;
  }

  ktState.submitting = true;
  $kt('#ktSubmitBtn').disabled = true;
  $kt('#ktMobileSubmitBtn').disabled = true;
  const delays = [2, 4, 8, 16];

  for (let i = 0; i <= delays.length; i++) {
    try {
      showBanner('Đang nộp bài lên máy chủ, vui lòng đừng tắt trang…', 'warn');
      const res = await callAppsScript({
        action: 'submitExam',
        sessionId: ktState.sessionId,
        examCode: ktState.examCode,
        studentName: ktState.studentName,
        className: ktState.className,
        startTimeMs: ktState.startTimeMs,
        deadlineMs: ktState.deadlineMs,
        answers: ktState.answers,
      });

      if (res && res.ok) {
        ktState.submitting = false;
        ktState.submitted = true;
        ktState.lastResult = res;
        saveDraft();
        if (ktState.timerId) clearInterval(ktState.timerId);
        showBanner('Đã nộp bài thành công!', 'ok');
        renderResultScreen(res);
        return;
      }

      if (res && (res.error === 'SERVER_BUSY' || res.retryable) && i < delays.length) {
        showBanner(`Đang nộp bài, đừng tắt trang (máy chủ đang chấm cho các bạn khác, tự gửi lại sau ${delays[i]} giây)…`, 'warn');
        await new Promise((r) => setTimeout(r, delays[i] * 1000));
        continue;
      }

      throw new Error((res && res.message) || 'Không nộp được bài.');
    } catch (err) {
      if (i < delays.length) {
        showBanner(`Đang nộp bài, đừng tắt trang (tự gửi lại sau ${delays[i]} giây)…`, 'warn');
        await new Promise((r) => setTimeout(r, delays[i] * 1000));
      } else {
        ktState.submitting = false;
        $kt('#ktSubmitBtn').disabled = false;
        $kt('#ktMobileSubmitBtn').disabled = false;
        showBanner('Chưa gửi được bài lên máy chủ. Bài làm của em vẫn lưu an toàn trong máy, hãy bấm "Nộp bài" lại nhé!', 'err');
      }
    }
  }
}

function renderResultScreen(res) {
  document.body.classList.remove('in-exam');
  $kt('#ktStartBox').hidden = true;
  $kt('#ktExamBox').hidden = true;
  $kt('#ktMobileBar').hidden = true;
  $kt('#ktResultBox').hidden = false;
  $kt('#ktTopStatus').textContent = 'Đã nộp bài';
  $kt('#ktTopStatus').className = 'tag g';

  const scoreStr = typeof res.score10 === 'number'
    ? res.score10.toFixed(2).replace('.', ',')
    : String(res.score10 ?? '--');
  $kt('#ktScore10').textContent = scoreStr;
  $kt('#ktRawScore').textContent = 'Điểm thô: ' + (res.rawScoreDisplay || '');
  $kt('#ktResTitle').textContent = ktState.title || ('Kết quả bài ' + ktState.examCode);

  const studentStr = [
    ktState.studentName && `Học sinh: ${ktState.studentName}`,
    ktState.className && `Lớp: ${ktState.className}`,
    ktState.examCode && `Mã đề: ${ktState.examCode}`,
  ].filter(Boolean).join('   ·   ');
  $kt('#ktResStudentInfo').textContent = studentStr;

  const flags = [res.duplicateFlag, res.lateFlag].filter(Boolean);
  $kt('#ktFlags').textContent = flags.length ? 'Ghi chú: ' + flags.join(' · ') : 'Nộp đúng hạn';

  // Thống kê số câu đã làm theo từng phần
  if (!ktState.sections.length && ktState.questions.length) {
    buildSectionsAndQuestions();
  }
  const bd = $kt('#ktResBreakdown');
  bd.replaceChildren();
  for (const sec of ktState.sections) {
    const doneInSec = sec.items.filter((rq) => getQuestionStatus(rq).state === 'done').length;
    bd.append(h('div', { class: 'num', style: `--c:${sec.meta.colorVar}` },
      h('label', null, sec.meta.shortTitle),
      h('div', { style: 'font-size:22px;font-weight:600;margin:2px 0' }, `${doneInSec} / ${sec.items.length} câu`),
      h('small', null, 'đã trả lời')));
  }
}

async function handleCheckReview() {
  const btn = $kt('#ktReviewBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await callAppsScript({ action: 'getReview', examCode: ktState.examCode });
    if (!res.ok) {
      showBanner(res.message || 'Chỉ được xem đáp án và lời giải sau giờ đóng bài.', 'warn');
      if (btn) btn.disabled = false;
      return;
    }
    showBanner('Đã mở đáp án và lời giải chi tiết.', 'ok');
    renderReviewBySections(res);
  } catch (err) {
    showBanner(err.message || 'Không tải được đáp án.', 'err');
    if (btn) btn.disabled = false;
  }
}

/**
 * Hiển thị đáp án & lời giải chi tiết sau giờ đóng bài theo đúng bố cục Phần I, II, III, IV
 */
function renderReviewBySections(reviewData) {
  const listEl = $kt('#ktReviewList');
  listEl.replaceChildren();
  const ansMap = reviewData.answers || {};
  const allQs = reviewData.questions || ktState.questions || [];

  for (const partKey of PART_ORDER) {
    const meta = PART_META[partKey];
    const partQs = allQs.filter((q) => String(q.loai || q.type || 'TN4').toUpperCase() === partKey);
    if (!partQs.length) continue;

    const secEl = h('section', { class: 'kt-part-sec' },
      h('div', { class: 'kt-part-head', style: `--c:${meta.colorVar}` },
        h('span', { class: 'kt-part-badge' }, `PHẦN ${meta.roman}`),
        h('div', { class: 'grow' },
          h('div', { class: 'kt-part-title' }, meta.title),
          h('div', { class: 'kt-part-sub' }, `Đáp án & lời giải chi tiết (${partQs.length} câu)`))));

    const qList = h('div', { class: 'qlist' });
    partQs.forEach((q, idx) => {
      const qId = q.ma || q.id || (`${partKey}_${idx + 1}`);
      const keyInfo = ansMap[qId] || {};
      const sAns = ktState.answers[qId];
      const sText = sAns && typeof sAns === 'object'
        ? ['a', 'b', 'c', 'd'].map((k) => `${k}) ${sAns[k] || '_'}`).join(' · ')
        : String(sAns || 'Chưa trả lời');

      const card = h('article', { class: 'q' },
        h('div', { class: 'q-head' },
          h('span', { class: 'tag k' }, `Câu ${idx + 1} (Phần ${meta.roman})`),
          h('span', { class: 'tag mono' }, qId),
          h('span', { class: 'tag ' + meta.tagCls }, `Đáp án: ${keyInfo.answer || ''}`)),
        h('div', { class: 'q-body', html: renderRich(q.de || q.stem || '') }));
      (q.hinh || []).forEach((f) => card.append(figEl(f, '../')));

      const ansBox = h('div', { class: 'ans' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('div', null, h('b', null, 'Bài làm của em: '), sText),
          h('div', null, h('b', null, 'Đáp án đúng: '), h('span', { class: 'tag g' }, String(keyInfo.answer || '')))),
        keyInfo.solution ? h('div', { class: 'lg', html: renderRich(keyInfo.solution) }) : null);
      (keyInfo.hinh_lg || []).forEach((f) => ansBox.append(figEl(f, '../')));
      card.append(ansBox);
      qList.append(card);
    });

    secEl.append(qList);
    listEl.append(secEl);
  }
}

function enterExamView() {
  document.body.classList.add('in-exam');
  $kt('#ktStartBox').hidden = true;
  $kt('#ktResultBox').hidden = true;
  $kt('#ktExamBox').hidden = false;
  $kt('#ktMobileBar').hidden = false;

  $kt('#ktTopStatus').textContent = ktState.title || ('Bài ' + ktState.examCode);
  $kt('#ktTopStatus').className = 'tag y';
  $kt('#ktSideStudent').textContent = ktState.studentName || 'Thí sinh';
  $kt('#ktSideMeta').textContent = `Lớp ${ktState.className || '---'}`;
  $kt('#ktSideCode').textContent = ktState.examCode;

  buildSectionsAndQuestions();
  renderExamSections();
  startTimer();
}

async function initKiemTra() {
  await loadAppsScriptUrl();
  const params = new URLSearchParams(window.location.search);
  const bCode = (params.get('b') || '').trim().toUpperCase();

  if (bCode) {
    $kt('#ktCode').value = bCode;
    ktState.examCode = bCode;
    fetchAndShowExamPreview(bCode);

    const saved = loadDraft(bCode);
    if (saved && saved.sessionId) {
      Object.assign(ktState, saved);
      $kt('#ktName').value = ktState.studentName || '';
      $kt('#ktClass').value = ktState.className || '';
      if (ktState.submitted && ktState.lastResult) {
        renderResultScreen(ktState.lastResult);
      } else if (Date.now() + (ktState.serverOffsetMs || 0) < ktState.deadlineMs) {
        enterExamView();
      }
    }
  }

  // Khi học sinh nhập hoặc đổi mã bài ở trang đầu -> tự động tải thông tin Tên bài, Thời gian, Số câu
  let codeTimer = null;
  $kt('#ktCode').addEventListener('input', (ev) => {
    clearTimeout(codeTimer);
    const val = ev.target.value.trim().toUpperCase();
    if (val.length >= 3) {
      codeTimer = setTimeout(() => fetchAndShowExamPreview(val), 350);
    }
  });

  $kt('#ktStartBtn').onclick = async () => {
    const code = $kt('#ktCode').value.trim().toUpperCase();
    const name = $kt('#ktName').value.trim();
    const cls = $kt('#ktClass').value.trim();
    if (!code || !name || !cls) {
      showBanner('Vui lòng nhập đầy đủ Mã bài kiểm tra, Họ tên và Lớp.', 'err');
      return;
    }

    const btn = $kt('#ktStartBtn');
    btn.disabled = true;
    showBanner('Đang mở đề kiểm tra…', 'warn');

    try {
      const res = await callAppsScript({
        action: 'startExam',
        examCode: code,
        studentName: name,
        className: cls,
      });
      if (!res || !res.ok) {
        if (res && res.error === 'EXAM_CLOSED') {
          ktState.examCode = code;
          $kt('#ktDirectReviewBtn').hidden = false;
        }
        showBanner((res && res.message) || 'Không mở được bài kiểm tra.', 'err');
        btn.disabled = false;
        return;
      }

      const prevDraft = loadDraft(code);
      const sameSession = prevDraft && prevDraft.sessionId === res.sessionId;

      ktState.examCode = res.examCode;
      ktState.sessionId = res.sessionId;
      ktState.studentName = name;
      ktState.className = cls;
      ktState.title = res.title || ('Bài ' + res.examCode);
      ktState.durationMinutes = res.durationMinutes || 15;
      ktState.startTimeMs = res.startTimeMs;
      ktState.deadlineMs = res.deadlineMs;
      ktState.serverOffsetMs = (res.serverNowMs || Date.now()) - Date.now();
      ktState.shuffleQuestions = Boolean(res.shuffleQuestions);
      ktState.shuffleChoices = Boolean(res.shuffleChoices);
      ktState.questions = res.questions || [];
      ktState.answers = (sameSession && prevDraft.answers) ? prevDraft.answers : {};
      ktState.flagged = (sameSession && prevDraft.flagged) ? prevDraft.flagged : {};
      ktState.submitted = false;
      ktState.lastResult = null;
      ktState.currentUid = '';

      // Lưu tóm tắt cấu trúc đề để trang đầu luôn hiển thị ngay ở các lần mở sau
      const counts = { TN4: 0, DS: 0, TLN: 0, TL: 0, total: ktState.questions.length };
      ktState.questions.forEach((q) => {
        const k = String(q.loai || q.type || 'TN4').toUpperCase();
        if (counts[k] !== undefined) counts[k]++;
      });
      savePreviewMeta(res.examCode, {
        examCode: res.examCode,
        title: ktState.title,
        durationMinutes: ktState.durationMinutes,
        counts,
      });

      saveDraft();
      showBanner(res.restored ? 'Đã khôi phục phiên làm bài đang diễn ra của em.' : '');
      enterExamView();
    } catch (err) {
      showBanner(err.message || 'Lỗi kết nối máy chủ.', 'err');
      btn.disabled = false;
    }
  };

  $kt('#ktDirectReviewBtn').onclick = () => {
    ktState.examCode = $kt('#ktCode').value.trim().toUpperCase();
    $kt('#ktStartBox').hidden = true;
    $kt('#ktResultBox').hidden = false;
    handleCheckReview();
  };

  $kt('#ktModeAllBtn').onclick = () => {
    ktState.viewMode = 'all';
    applyViewModeFilter();
  };
  $kt('#ktModeSingleBtn').onclick = () => {
    ktState.viewMode = 'single';
    applyViewModeFilter();
  };

  $kt('#ktSubmitBtn').onclick = () => submitExamWithRetry(false);
  $kt('#ktMobileSubmitBtn').onclick = () => submitExamWithRetry(false);
  $kt('#ktMobileJumpBtn').onclick = () => {
    $kt('#ktSidePanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $kt('#ktReviewBtn').onclick = handleCheckReview;
}

initKiemTra();
