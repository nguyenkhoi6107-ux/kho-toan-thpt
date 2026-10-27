'use strict';
/* ToánKho — giao diện tĩnh, đọc data/cauhoi.json do tools/build.mjs sinh ra từ kho GitHub.
   Phần hiển thị công thức, bảng và hình được tách ra trong hien-thi.js để dùng chung với kiem-tra/. */

const LOAI = {
  TN4: { ten: 'Trắc nghiệm', ngan: 'TN', max: 40, c: 'y', part: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', hd: 'Mỗi câu hỏi thí sinh chỉ chọn một phương án.' },
  DS: { ten: 'Đúng – Sai', ngan: 'ĐS', max: 20, c: 'p', part: 'PHẦN II. Câu trắc nghiệm đúng sai.', hd: 'Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.' },
  TLN: { ten: 'Trả lời ngắn', ngan: 'TLN', max: 20, c: 'b', part: 'PHẦN III. Câu trắc nghiệm trả lời ngắn.', hd: '' },
  TL: { ten: 'Tự luận', ngan: 'TL', max: 10, c: 'g', part: 'PHẦN IV. Tự luận.', hd: '' },
};
const LOAI_KEYS = Object.keys(LOAI);
const MUC = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const PAGE = 15;

let D = null;            // dữ liệu
let byMa = new Map();
const $ = (s, r = document) => r.querySelector(s);

/* ---------- tiện ích giao diện ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2200);
}
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch { }
  const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = s; document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { } ta.remove(); return ok;
}
function download(name, text) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
};
function openModal(title, body, footer) {
  const m = $('#modal');
  m.replaceChildren(h('div', { class: 'modal-box', role: 'dialog', 'aria-label': title },
    h('div', { class: 'modal-h' }, h('h2', { class: 'grow' }, title), h('button', { class: 'btn ghost sm', onclick: closeModal }, 'Đóng')),
    h('div', { class: 'modal-b' }, body),
    footer ? h('div', { class: 'modal-f' }, footer) : null));
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
}
function closeModal() { $('#modal').hidden = true; $('#modal').replaceChildren(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/* ---------- dữ liệu ---------- */
const state = {
  view: 'lib',
  lib: { lop: null, chuong: null, bai: null, dang: null, loai: new Set(), muc: new Set(), pending: false, q: '', limit: PAGE },
  exam: Object.assign({
    title: 'ĐỀ KIỂM TRA', time: 90, lops: [10, 11, 12], bai: [],
    target: { TN4: 12, DS: 4, TLN: 6, TL: 0 }, picks: { TN4: [], DS: [], TLN: [], TL: [] },
  }, store.get('toankho.exam.v1', {})),
};
const saveExam = () => { store.set('toankho.exam.v1', state.exam); updateBadge(); };
const official = (q) => q.trang_thai === 'chinh-thuc';
const usable = (q) => official(q) && !q.loi_dap_an;   // câu đáp án mâu thuẫn không vào đề (máy sẽ chấm sai)
const baiKey = (q) => `${q.lop}-${q.bai}`;
const examCount = () => LOAI_KEYS.reduce((n, k) => n + state.exam.picks[k].length, 0);
function updateBadge() { const n = examCount(), b = $('#railBadge'); b.textContent = n; b.hidden = !n; }
function tocLop(l) { return D.muc_luc.find((x) => x.lop === l); }
function baiName(lop, bai) { for (const c of tocLop(lop)?.chuong || []) { const b = c.bai.find((x) => x.so === bai); if (b) return b.ten; } return ''; }
function chuongOf(lop, chuong) { return tocLop(lop)?.chuong.find((c) => c.so === chuong); }
const dangName = (code) => D.dang[code]?.ten || '';

async function load() {
  const r = await fetch('data/cauhoi.json?v=' + Date.now());
  D = await r.json();
  byMa = new Map(D.cau_hoi.map((q) => [q.ma, q]));
  $('#brand').textContent = D.ten_kho || 'ToánKho';
  document.title = (D.ten_kho || 'ToánKho') + ' — Kho bài tập Toán THPT';
  const ok = D.cau_hoi.filter(official).length;
  $('#stat').textContent = `${ok} câu trong kho`;
  $('#statSub').textContent = D.cau_hoi.length > ok ? `+${D.cau_hoi.length - ok} chờ duyệt` : 'THPT · SGK Kết nối tri thức';
  const when = new Date(D.tao_luc).toLocaleString('vi-VN');
  $('#foot').textContent = `Dữ liệu dựng lúc ${when}${D.commit ? ' · commit ' + D.commit : ''} · tự cập nhật mỗi khi kho GitHub có thay đổi`;
  // dọn các mã đã biến mất khỏi kho
  for (const k of LOAI_KEYS) state.exam.picks[k] = state.exam.picks[k].filter((m) => byMa.has(m) && !byMa.get(m).loi_dap_an);
  const first = D.muc_luc.find((L) => D.cau_hoi.some((q) => q.lop === L.lop));
  state.lib.lop = (first || D.muc_luc[0] || { lop: 12 }).lop;
  updateBadge();
}

/* ---------- thẻ câu hỏi ---------- */
function bodyEl(q) {
  const b = h('div', { class: 'q-body' });
  b.append(h('div', { html: renderRich(q.de) }));
  q.hinh.forEach((f) => b.append(figEl(f)));
  if (q.loai === 'TN4' && q.choices.length) {
    const long = Math.max(...q.choices.map((c) => c.length));
    const cls = long < 14 ? 'c4' : long < 60 ? '' : 'c1';
    b.append(h('div', { class: 'choices ' + cls }, q.choices.map((c, i) => h('div', { class: 'opt', 'data-i': i }, h('b', null, 'ABCD'[i] + '.'), h('span', { html: renderRich(c).replace(/^<p>|<\/p>$/g, '') })))));
  }
  if (q.loai === 'DS' && q.tf.length) {
    b.append(h('div', { class: 'choices c1' }, q.tf.map((c, i) => h('div', { class: 'opt', 'data-i': i }, h('b', null, 'abcd'[i] + ')'), h('span', { html: renderRich(c).replace(/^<p>|<\/p>$/g, '') })))));
  }
  return b;
}
function answerEl(q) {
  const a = h('div', { class: 'ans' });
  let da = q.dap_an;
  if (q.loai === 'TL') da = 'Xem lời giải bên dưới';
  a.append(h('h4', null, 'Đáp án'), h('div', { class: 'big' }, da === '-' ? 'Xem lời giải' : da));
  if (q.loai === 'DS' && q.dap_an.length === 4) a.append(h('div', { class: 'small muted' }, [...q.dap_an].map((c, i) => 'abcd'[i] + ') ' + c).join('   ·   ')));
  if (q.loigiai || q.hinh_lg.length) {
    const lg = h('div', { class: 'lg' }, h('h4', null, 'Lời giải'), h('div', { html: renderRich(q.loigiai) }));
    q.hinh_lg.forEach((f) => lg.append(figEl(f)));
    a.append(lg);
  }
  const meta = [q.kien_thuc && 'Kiến thức: ' + q.kien_thuc, q.nguon && 'Nguồn: ' + q.nguon, q.ghi_chu && 'Ghi chú: ' + q.ghi_chu].filter(Boolean);
  if (meta.length) a.append(h('div', { class: 'small muted', style: 'margin-top:8px' }, meta.join('  ·  ')));
  return a;
}
function mucTags(q) {
  if (!q.muc.length) return [];
  if (q.loai === 'DS' && q.muc.length > 1) return [h('span', { class: 'tag', title: q.muc.map((m, i) => 'abcd'[i] + ') ' + (MUC[m] || m)).join(' · ') }, 'Mức: ' + q.muc.join('·'))];
  return [h('span', { class: 'tag', title: MUC[q.muc[0]] }, MUC[q.muc[0]] || q.muc[0])];
}
function inExam(q) { return state.exam.picks[q.loai]?.includes(q.ma); }
function showLatex(qs, title) {
  const code = qs.map((q) => (qs.length > 1 ? `% ${q.ma}\n` : '') + q.latex).join('\n\n');
  const pre = h('pre', { class: 'code' }, code);
  openModal(title || 'Mã LaTeX', pre, [
    h('button', { class: 'btn', onclick: async () => toast((await copyText(code)) ? 'Đã chép LaTeX' : 'Không chép được — hãy bôi đen và chép tay') }, 'Chép mã'),
    h('button', { class: 'btn ghost', onclick: () => download((qs.length === 1 ? qs[0].ma : 'cau-hoi') + '.tex', code + '\n') }, 'Tải .tex'),
  ]);
}
function addToExam(q, quiet) {
  const p = state.exam.picks[q.loai];
  if (!official(q)) { toast('Câu này chưa được duyệt nên chưa dùng được cho đề'); return false; }
  if (q.loi_dap_an) { toast(`Câu ${q.ma} có đáp án cần kiểm tra lại trong kho, chưa dùng được cho đề`); return false; }
  if (p.includes(q.ma)) { if (!quiet) toast('Câu này đã có trong đề'); return false; }
  if (p.length >= LOAI[q.loai].max) { toast(`Tối đa ${LOAI[q.loai].max} câu ${LOAI[q.loai].ten.toLowerCase()}`); return false; }
  p.push(q.ma);
  state.exam.target[q.loai] = Math.max(state.exam.target[q.loai], p.length);
  saveExam(); if (!quiet) toast(`Đã thêm vào đề (${examCount()} câu)`); return true;
}
function qCard(q, opts = {}) {
  const wrap = h('article', { class: 'q' + (official(q) ? '' : ' pending') });
  const path = `Lớp ${q.lop} › Chương ${ROMAN[q.chuong] || q.chuong} › Bài ${q.bai}. ${baiName(q.lop, q.bai)}`;
  wrap.append(
    h('div', { class: 'q-head' },
      h('span', { class: 'tag k mono' }, q.ma),
      h('span', { class: 'tag ' + LOAI[q.loai]?.c }, LOAI[q.loai]?.ten || q.loai),
      mucTags(q),
      q.dang ? h('span', { class: 'tag', title: dangName(q.dang) }, 'Dạng ' + q.dang) : null,
      official(q) ? null : h('span', { class: 'tag warn', title: q.ly_do }, 'Chờ duyệt'),
      q.loi_dap_an ? h('span', { class: 'tag warn', title: q.loi_dap_an }, 'Đáp án cần kiểm tra') : null),
    h('div', { class: 'q-path' }, path + (q.dang && dangName(q.dang) ? ' › ' + dangName(q.dang) : '')),
    bodyEl(q));
  let ansEl = null;
  const ansBtn = h('button', { class: 'btn ghost sm', 'aria-expanded': 'false' }, 'Xem đáp án');
  ansBtn.onclick = () => {
    if (!ansEl) { ansEl = answerEl(q); wrap.insertBefore(ansEl, act); markOptions(wrap, q); }
    else { ansEl.hidden = !ansEl.hidden; }
    const open = !ansEl.hidden;
    ansBtn.textContent = open ? 'Ẩn đáp án' : 'Xem đáp án'; ansBtn.setAttribute('aria-expanded', open);
    wrap.querySelectorAll('.opt').forEach((o) => o.classList.toggle('show', open));
    markOptions(wrap, q, open);
  };
  const act = h('div', { class: 'q-act' }, ansBtn,
    h('button', { class: 'btn sm', onclick: async () => toast((await copyText(q.latex)) ? `Đã chép LaTeX của ${q.ma}` : 'Không chép được') }, 'Lấy LaTeX'),
    h('button', { class: 'btn ghost sm', onclick: () => showLatex([q], 'LaTeX · ' + q.ma) }, 'Xem mã'),
    opts.noAdd ? null : h('button', { class: 'btn ghost sm', onclick: (e) => { if (addToExam(q)) e.target.textContent = '✓ Đã trong đề'; } }, inExam(q) ? '✓ Đã trong đề' : '+ Thêm vào đề'),
    opts.extra || null);
  wrap.append(act);
  return wrap;
}
function markOptions(wrap, q, open = true) {
  wrap.querySelectorAll('.opt').forEach((o) => { o.classList.remove('ok', 'no'); });
  if (!open) return;
  if (q.loai === 'TN4') { const i = 'ABCD'.indexOf(q.dap_an); wrap.querySelectorAll('.opt').forEach((o) => o.classList.toggle('ok', +o.dataset.i === i)); }
  if (q.loai === 'DS' && q.dap_an.length === 4) wrap.querySelectorAll('.opt').forEach((o) => o.classList.add(q.dap_an[+o.dataset.i] === 'Đ' ? 'ok' : 'no'));
}

/* ---------- THƯ VIỆN ---------- */
function libPool(ignoreLevel) { // câu thuộc phạm vi lớp/chương/bài/dạng/tìm kiếm
  const f = state.lib; const q = f.q.trim().toLowerCase();
  return D.cau_hoi.filter((c) => {
    if (!f.pending && !official(c)) return false;
    if (q) return plain(c.de + ' ' + c.choices.join(' ') + c.tf.join(' ')).includes(plain(q)) || (c.ma + ' ' + c.nguon + ' ' + c.kien_thuc + ' ' + c.dang + ' ' + dangName(c.dang)).toLowerCase().includes(q);
    if (c.lop !== f.lop) return false;
    if (!ignoreLevel) {
      if (f.chuong != null && c.chuong !== f.chuong) return false;
      if (f.bai != null && c.bai !== f.bai) return false;
      if (f.dang && c.dang !== f.dang) return false;
    }
    return true;
  });
}
function renderLib(root) {
  const f = state.lib; const searching = !!f.q.trim();
  const lops = D.muc_luc.map((L) => L.lop);
  const scope = libPool(true);                       // trong lớp (hoặc kết quả tìm kiếm)
  const chips = h('div', { class: 'row' }, lops.map((l) => h('button', { class: 'chip' + (!searching && f.lop === l ? ' on' : ''), onclick: () => { Object.assign(f, { lop: l, chuong: null, bai: null, dang: null, q: '', limit: PAGE }); $('#q').value = ''; render(); } }, 'Lớp ' + l)));
  root.append(h('div', { class: 'row', style: 'justify-content:space-between' }, h('h1', null, searching ? `Kết quả cho “${f.q}”` : 'Kho bài tập'), chips));

  if (!searching) {
    const L = tocLop(f.lop);
    const cards = h('div', { class: 'cards' });
    const sumAll = scope.length;
    cards.append(h('button', { class: 'card all' + (f.chuong == null ? ' on' : ''), onclick: () => { Object.assign(f, { chuong: null, bai: null, dang: null, limit: PAGE }); render({ focusList: true }); } },
      h('span', { class: 'tag k', style: 'align-self:flex-start' }, 'Lớp ' + f.lop), h('h3', null, 'Tất cả các chương'),
      h('div', { class: 'card-meta' }, h('span', null, 'Số câu'), h('b', null, sumAll)), h('div', { class: 'bar' }, h('i', { style: 'width:100%' })),
      h('div', { class: 'card-foot' }, LOAI_KEYS.map((k) => { const n = scope.filter((c) => c.loai === k).length; return n ? h('span', { class: 'dot' }, `${LOAI[k].ngan} ${n}`) : null; }))));
    const maxN = Math.max(1, ...L.chuong.map((C) => scope.filter((c) => c.chuong === C.so).length));
    for (const C of L.chuong) {
      const cs = scope.filter((c) => c.chuong === C.so);
      const baiCo = new Set(cs.map((c) => c.bai)).size;
      cards.append(h('button', { class: `card l${f.lop}` + (f.chuong === C.so ? ' on' : '') + (cs.length ? '' : ' empty'), onclick: () => { Object.assign(f, { chuong: C.so, bai: null, dang: null, limit: PAGE }); render({ focusList: true }); } },
        h('span', { class: 'tag k', style: 'align-self:flex-start' }, 'Chương ' + (ROMAN[C.so] || C.so)),
        h('h3', null, C.ten),
        h('div', { class: 'card-meta' }, h('span', null, `${baiCo}/${C.bai.length} bài có câu`), h('b', null, cs.length ? cs.length + ' câu' : 'Chưa có')),
        h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((cs.length / maxN) * 100)}%` })),
        h('div', { class: 'card-foot' }, LOAI_KEYS.map((k) => { const n = cs.filter((c) => c.loai === k).length; return n ? h('span', { class: 'dot' }, `${LOAI[k].ngan} ${n}`) : null; }))));
    }
    root.append(cards);
  }

  // danh sách theo bộ lọc
  const base = searching ? scope : libPool(false);
  const list = base.filter((c) => (!f.loai.size || f.loai.has(c.loai)) && (!f.muc.size || c.muc.some((m) => f.muc.has(m))));
  const cols = h('div', { class: searching ? '' : 'cols' });
  if (!searching) cols.append(treePanel(scope));
  const right = h('div', { id: 'ketqua', style: 'scroll-margin-top:12px' });
  const bar = h('div', { class: 'panel', style: 'margin-bottom:16px' },
    h('div', { class: 'row' },
      h('b', null, `${list.length} câu`),
      h('span', { class: 'muted small' }, 'Loại:'),
      LOAI_KEYS.map((k) => h('button', { class: 'chip sm' + (f.loai.has(k) ? ' on' : ''), onclick: () => { toggle(f.loai, k); f.limit = PAGE; render({ focusList: true }); } }, LOAI[k].ten)),
      h('span', { class: 'muted small' }, 'Mức:'),
      Object.keys(MUC).map((k) => h('button', { class: 'chip sm' + (f.muc.has(k) ? ' on' : ''), title: MUC[k], onclick: () => { toggle(f.muc, k); f.limit = PAGE; render({ focusList: true }); } }, k)),
      h('label', { class: 'cb small' }, h('input', { type: 'checkbox', checked: f.pending, onchange: (e) => { f.pending = e.target.checked; render(); } }), 'Cả câu chờ duyệt')),
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn sm', disabled: !list.length, onclick: () => showLatex(list.slice(0, 200), `LaTeX của ${Math.min(list.length, 200)} câu đang hiển thị`) }, 'Lấy LaTeX cả danh sách'),
      h('button', { class: 'btn ghost sm', disabled: !list.length, onclick: () => { let n = 0; list.forEach((q) => { if (addToExam(q, true)) n++; }); toast(`Đã thêm ${n} câu vào đề`); render(); } }, '+ Thêm cả danh sách vào đề')));
  right.append(bar);
  const ql = h('div', { class: 'qlist' });
  if (!list.length) ql.append(h('div', { class: 'empty-state panel' }, h('h3', null, 'Chưa có câu nào phù hợp'), h('p', null, 'Thử bỏ bớt bộ lọc hoặc chọn chương/bài khác.')));
  list.slice(0, f.limit).forEach((q) => ql.append(qCard(q)));
  right.append(ql);
  if (list.length > f.limit) right.append(h('button', { class: 'btn ghost more', onclick: () => { f.limit += PAGE; render(); } }, `Xem thêm (${list.length - f.limit} câu nữa)`));
  cols.append(right);
  root.append(cols);
}
function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); }
function treePanel(scope) {
  const f = state.lib; const L = tocLop(f.lop);
  const p = h('aside', { class: 'panel tree' }, h('h3', null, 'Bài & dạng'));
  p.append(h('button', { class: 'tr' + (f.bai == null && !f.dang ? ' on' : ''), onclick: () => { f.bai = null; f.dang = null; f.limit = PAGE; render({ focusList: true }); } }, h('span', null, f.chuong == null ? 'Tất cả' : 'Cả chương'), h('span', { class: 'n' }, scope.filter((c) => f.chuong == null || c.chuong === f.chuong).length)));
  for (const C of L.chuong) {
    if (f.chuong != null && C.so !== f.chuong) continue;
    if (f.chuong == null) p.append(h('div', { class: 'small muted', style: 'margin:10px 0 2px' }, `Chương ${ROMAN[C.so] || C.so}. ${C.ten}`));
    for (const B of C.bai) {
      const cs = scope.filter((c) => c.chuong === C.so && c.bai === B.so);
      p.append(h('button', { class: 'tr' + (f.bai === B.so && !f.dang ? ' on' : '') + (cs.length ? '' : ' zero'), onclick: () => { Object.assign(f, { chuong: C.so, bai: B.so, dang: null, limit: PAGE }); render({ focusList: true }); } },
        h('span', null, `Bài ${B.so}. ${B.ten}`), h('span', { class: 'n' }, cs.length)));
      if (f.bai === B.so && cs.length) {
        const codes = [...new Set(cs.map((c) => c.dang).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const code of codes) p.append(h('button', { class: 'tr sub' + (f.dang === code ? ' on' : ''), onclick: () => { f.dang = f.dang === code ? null : code; f.limit = PAGE; render({ focusList: true }); } },
          h('span', null, h('span', { class: 'mono' }, code), ' ', dangName(code) || ''), h('span', { class: 'n' }, cs.filter((c) => c.dang === code).length)));
      }
    }
  }
  return p;
}

/* ---------- TẠO ĐỀ ---------- */
function examPool(k, exclude = true) {
  const e = state.exam; const set = new Set(e.bai);
  return D.cau_hoi.filter((q) => q.loai === k && usable(q) && (!set.size || set.has(baiKey(q))) && (!exclude || !e.picks[k].includes(q.ma)));
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function sample(pool, n) { // luân phiên giữa các bài để đề phủ đều nội dung
  const groups = new Map();
  shuffle(pool).forEach((q) => { const k = baiKey(q); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); });
  const order = shuffle([...groups.values()]); const out = [];
  while (out.length < n && order.some((g) => g.length)) for (const g of order) { if (g.length && out.length < n) out.push(g.pop()); }
  return out;
}
function fillRandom() {
  const e = state.exam; const short = [];
  for (const k of LOAI_KEYS) {
    const need = e.target[k] - e.picks[k].length; if (need <= 0) continue;
    const got = sample(examPool(k), need);
    got.forEach((q) => e.picks[k].push(q.ma));
    if (got.length < need) short.push(`${LOAI[k].ten}: thiếu ${need - got.length} câu`);
  }
  saveExam(); render();
  toast(short.length ? 'Kho chưa đủ câu — ' + short.join('; ') : 'Đã bốc ngẫu nhiên đủ số câu');
}
function renderExam(root) {
  const e = state.exam;
  root.append(h('div', { class: 'row', style: 'margin-bottom:16px' }, h('h1', { class: 'grow' }, 'Tạo đề thi'), h('span', { class: 'muted small' }, 'Chọn cấu trúc → chọn phạm vi → chọn câu → xuất LaTeX / giao bài online')));
  const cols = h('div', { class: 'cols', style: 'grid-template-columns:1fr 320px' });
  const steps = h('div', { class: 'steps' });

  // 1. cấu trúc
  const s1 = h('section', { class: 'panel' }, h('div', { class: 'step-h' }, h('span', { class: 'step-n' }, '1'), h('h2', null, 'Cấu trúc đề')));
  s1.append(h('div', { class: 'row', style: 'margin-bottom:14px' },
    h('div', { class: 'field grow' }, h('label', { for: 'ti' }, 'Tên đề'), h('input', { id: 'ti', type: 'text', value: e.title, oninput: (ev) => { e.title = ev.target.value; saveExam(); } })),
    h('div', { class: 'field', style: 'width:140px' }, h('label', { for: 'tm' }, 'Thời gian (phút)'), h('input', { id: 'tm', type: 'number', min: 1, max: 300, value: e.time, oninput: (ev) => { e.time = +ev.target.value || 90; saveExam(); } }))));
  const grid = h('div', { class: 'num-grid' });
  for (const k of LOAI_KEYS) {
    const avail = examPool(k, false).length;
    grid.append(h('div', { class: 'num', style: `--c:var(--${LOAI[k].c})` }, h('label', { for: 'n' + k }, LOAI[k].ten),
      h('input', { id: 'n' + k, type: 'number', min: 0, max: LOAI[k].max, value: e.target[k], onchange: (ev) => { e.target[k] = Math.min(LOAI[k].max, Math.max(0, +ev.target.value || 0)); saveExam(); render(); } }),
      h('small', null, `tối đa ${LOAI[k].max} · kho có ${avail}`)));
  }
  s1.append(grid); steps.append(s1);

  // 2. phạm vi
  const s2 = h('section', { class: 'panel' }, h('div', { class: 'step-h' }, h('span', { class: 'step-n' }, '2'), h('h2', null, 'Nội dung, chủ đề'),
    h('span', { class: 'muted small' }, e.bai.length ? `${e.bai.length} bài được chọn` : 'Chưa chọn gì = lấy toàn bộ kho')));
  const lopRow = h('div', { class: 'row', style: 'margin-bottom:8px' });
  const shown = state.examLop ?? D.muc_luc[0]?.lop;
  for (const L of D.muc_luc) lopRow.append(h('button', { class: 'chip' + (shown === L.lop ? ' on' : ''), onclick: () => { state.examLop = L.lop; render(); } }, 'Lớp ' + L.lop));
  lopRow.append(h('span', { class: 'grow' }), h('button', { class: 'btn ghost sm', disabled: !e.bai.length, onclick: () => { e.bai = []; saveExam(); render(); } }, 'Bỏ chọn hết'));
  s2.append(lopRow);
  const L = tocLop(shown);
  const cnt = (lop, bai) => D.cau_hoi.filter((q) => official(q) && q.lop === lop && q.bai === bai).length;
  for (const C of L.chuong) {
    const keys = C.bai.map((b) => `${L.lop}-${b.so}`);
    const nOn = keys.filter((k) => e.bai.includes(k)).length;
    const total = C.bai.reduce((n, b) => n + cnt(L.lop, b.so), 0);
    const cb = h('input', { type: 'checkbox', checked: nOn === keys.length && keys.length > 0, onchange: (ev) => { keys.forEach((k) => { const i = e.bai.indexOf(k); if (ev.target.checked && i < 0) e.bai.push(k); if (!ev.target.checked && i >= 0) e.bai.splice(i, 1); }); saveExam(); render(); } });
    cb.indeterminate = nOn > 0 && nOn < keys.length;
    const row = h('div', { class: 'scope-ch' }, h('label', { class: 'cb' }, cb, h('b', null, `Chương ${ROMAN[C.so] || C.so}. ${C.ten}`), h('span', { class: 'muted small' }, `${total} câu`)));
    row.append(h('div', { class: 'scope-bai' }, C.bai.map((b) => {
      const key = `${L.lop}-${b.so}`, n = cnt(L.lop, b.so), on = e.bai.includes(key);
      return h('button', { class: 'pill-cb' + (on ? ' on' : '') + (n ? '' : ' zero'), title: b.ten, 'aria-pressed': on, onclick: () => { const i = e.bai.indexOf(key); i < 0 ? e.bai.push(key) : e.bai.splice(i, 1); saveExam(); render(); } }, `Bài ${b.so}. ${b.ten} (${n})`);
    })));
    s2.append(row);
  }
  steps.append(s2);

  // 3. chọn câu
  const s3 = h('section', { class: 'panel' }, h('div', { class: 'step-h' }, h('span', { class: 'step-n' }, '3'), h('h2', null, 'Chọn câu hỏi'),
    h('span', { class: 'muted small' }, 'Tự chọn hoặc để máy bốc ngẫu nhiên phần còn thiếu')));
  for (const k of LOAI_KEYS) {
    if (!e.target[k] && !e.picks[k].length) continue;
    const p = e.picks[k]; const pool = examPool(k).length;
    s3.append(h('div', { class: 'sec-h' }, h('h3', null, LOAI[k].part.replace(/\.$/, '')), h('span', { class: 'tag ' + LOAI[k].c }, `${p.length}/${e.target[k]}`), h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost sm', onclick: () => pickDialog(k) }, `+ Chọn tay (${pool} câu)`),
      p.length ? h('button', { class: 'btn ghost sm', onclick: () => { e.picks[k] = []; saveExam(); render(); } }, 'Xóa hết') : null));
    if (!p.length) s3.append(h('p', { class: 'muted small' }, 'Chưa có câu nào.'));
    p.forEach((ma, i) => { const q = byMa.get(ma); if (q) s3.append(pickRow(q, k, i)); });
  }
  steps.append(s3);
  cols.append(steps, summary());
  root.append(cols);
}
function pickRow(q, k, i) {
  const e = state.exam; const p = e.picks[k];
  const stem = h('div', { class: 'stem q-body', html: renderRich(q.de) });
  const mv = (d) => { const j = i + d; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; saveExam(); render(); };
  const ic = (path, label, fn) => h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick: fn, html: `<svg viewBox="0 0 24 24">${path}</svg>` });
  return h('div', { class: 'pick' },
    h('div', { class: 'pick-n' }, i + 1),
    h('div', null, h('div', { class: 'row', style: 'gap:6px;margin-bottom:3px' }, h('span', { class: 'tag k mono' }, q.ma), mucTags(q), h('span', { class: 'muted small' }, `Bài ${q.bai}. ${baiName(q.lop, q.bai)}`)), stem,
      h('button', { class: 'chip sm', style: 'margin-top:4px', onclick: (ev) => { const o = stem.classList.toggle('open'); ev.target.textContent = o ? 'Thu gọn' : 'Xem đầy đủ'; } }, 'Xem đầy đủ')),
    h('div', { class: 'row', style: 'gap:5px;flex-wrap:nowrap' },
      ic('<path d="m6 15 6-6 6 6"/>', 'Lên', () => mv(-1)), ic('<path d="m6 9 6 6 6-6"/>', 'Xuống', () => mv(1)),
      ic('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>', 'Đổi câu khác (ngẫu nhiên)', () => { const s = sample(examPool(k), 1); if (!s.length) return toast('Không còn câu khác trong phạm vi này'); p[i] = s[0].ma; saveExam(); render(); }),
      ic('<path d="M18 6 6 18M6 6l12 12"/>', 'Bỏ câu này', () => { p.splice(i, 1); saveExam(); render(); })));
}
function pickDialog(k) {
  const pool = examPool(k); let q = ''; let lim = 12;
  const listEl = h('div', { class: 'qlist' });
  const draw = () => {
    const f = pool.filter((c) => !q || plain(c.de + ' ' + c.choices.join(' ')).includes(plain(q)) || c.ma.toLowerCase().includes(q.toLowerCase()));
    listEl.replaceChildren(...f.slice(0, lim).map((c) => qCard(c, { noAdd: true, extra: h('button', { class: 'btn sm', onclick: (ev) => { if (addToExam(c, true)) { ev.target.textContent = '✓ Đã thêm'; ev.target.disabled = true; render(); } } }, '+ Chọn câu này') })));
    if (!f.length) listEl.append(h('div', { class: 'empty-state' }, 'Không còn câu phù hợp trong phạm vi đã chọn.'));
    if (f.length > lim) listEl.append(h('button', { class: 'btn ghost more', onclick: () => { lim += 12; draw(); } }, `Xem thêm (${f.length - lim})`));
  };
  const body = h('div', null, h('div', { class: 'field', style: 'margin-bottom:12px' }, h('label', { for: 'pq' }, `Lọc ${pool.length} câu ${LOAI[k].ten.toLowerCase()} theo phạm vi đã chọn`), h('input', { id: 'pq', type: 'text', placeholder: 'Gõ mã hoặc từ khóa…', oninput: (ev) => { q = ev.target.value; lim = 12; draw(); } })), listEl);
  draw(); openModal('Chọn câu · ' + LOAI[k].ten, body);
}
function summary() {
  const e = state.exam; const total = examCount(); const warns = [];
  const box = h('aside', { class: 'panel dark sum' }, h('h3', null, 'Đề của bạn'));
  for (const k of LOAI_KEYS) {
    if (!e.target[k] && !e.picks[k].length) continue;
    const n = e.picks[k].length, t = e.target[k];
    box.append(h('div', { class: 'sum-row' }, h('span', null, LOAI[k].ten), h('b', { class: n >= t ? 'ok' : 'low' }, `${n} / ${t}`)));
    const avail = examPool(k).length;
    if (n < t && avail < t - n) warns.push(`${LOAI[k].ten}: kho chỉ còn ${avail} câu, thiếu ${t - n - avail}.`);
  }
  box.append(h('div', { class: 'sum-row' }, h('span', null, 'Tổng'), h('b', null, total + ' câu')));
  if (warns.length) box.append(h('div', { class: 'note-warn', style: 'color:#2b2b2b' }, warns.join(' ')));
  const missing = LOAI_KEYS.some((k) => e.picks[k].length < e.target[k] && examPool(k).length);
  box.append(h('button', { class: 'btn', disabled: !missing, onclick: fillRandom }, 'Bốc ngẫu nhiên phần còn thiếu'),
    h('button', { class: 'btn ghost', disabled: !total, onclick: previewExam }, 'Xem trước đề'),
    h('button', { class: 'btn', style: 'background:var(--g);color:var(--ink);font-weight:600', disabled: !total, onclick: openAssignOnlineModal }, 'Giao bài online (Link & QR)'),
    h('button', { class: 'btn', style: 'background:var(--p);color:var(--ink);font-weight:600', disabled: !total, onclick: openGameModal }, 'Trò chơi trên lớp'),
    h('button', { class: 'btn', style: 'background:var(--y);color:var(--ink)', disabled: !total, onclick: exportExam }, 'Xuất LaTeX cho Overleaf'),
    h('button', { class: 'btn ghost', disabled: !total, onclick: () => { if (confirm('Xóa toàn bộ câu đã chọn trong đề?')) { LOAI_KEYS.forEach((k) => (e.picks[k] = [])); saveExam(); render(); } } }, 'Làm lại từ đầu'),
    h('p', { class: 'note' }, 'Chỉ dùng câu đã duyệt (chính thức). Câu thêm từ Thư viện cũng nằm trong đề này.'));
  return box;
}
function chosen() { const e = state.exam; return LOAI_KEYS.map((k) => [k, e.picks[k].map((m) => byMa.get(m)).filter(Boolean)]); }
function previewExam() {
  const body = h('div', { class: 'qlist' });
  let n = 0;
  for (const [k, qs] of chosen()) {
    if (!qs.length) continue;
    body.append(h('h3', null, LOAI[k].part));
    qs.forEach((q) => { n++; const c = qCard(q, { noAdd: true }); c.prepend(h('div', { class: 'tag k', style: 'margin-bottom:8px' }, 'Câu ' + (body.querySelectorAll('.q').length + 1))); body.append(c); });
  }
  openModal(`Xem trước · ${state.exam.title}`, body);
}
const texEsc = (s) => String(s).replace(/[\\{}$&#_%^~]/g, (c) => ({ '\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}' }[c] || '\\' + c));
function answerTable() {
  const L = ['\\newpage', '\\begin{center}{\\large\\textbf{BẢNG ĐÁP ÁN}}\\end{center}', ''];
  const tbl = (head, rows, cols) => `\\begin{center}\\renewcommand{\\arraystretch}{1.5}\n\\begin{tabular}{|${'c|'.repeat(cols)}}\\hline\n${head}\\\\ \\hline\n${rows.join(' \\\\ \\hline\n')} \\\\ \\hline\n\\end{tabular}\\end{center}`;
  const ch = Object.fromEntries(chosen());
  if (ch.TN4.length) {
    L.push('\\noindent\\textbf{Phần I.}');
    for (let i = 0; i < ch.TN4.length; i += 10) { const seg = ch.TN4.slice(i, i + 10); L.push(tbl('Câu & ' + seg.map((_, j) => i + j + 1).join(' & '), ['Đáp án & ' + seg.map((q) => texEsc(q.dap_an)).join(' & ')], seg.length + 1), ''); }
  }
  if (ch.DS.length) {
    L.push('\\noindent\\textbf{Phần II.}');
    L.push(tbl('Câu & a) & b) & c) & d)', ch.DS.map((q, i) => `${i + 1} & ` + [...(q.dap_an.padEnd(4, '?'))].slice(0, 4).join(' & ')), 5), '');
  }
  if (ch.TLN.length) {
    L.push('\\noindent\\textbf{Phần III.}');
    for (let i = 0; i < ch.TLN.length; i += 6) { const seg = ch.TLN.slice(i, i + 6); L.push(tbl('Câu & ' + seg.map((_, j) => i + j + 1).join(' & '), ['Đáp số & ' + seg.map((q) => texEsc(q.dap_an)).join(' & ')], seg.length + 1), ''); }
  }
  return L.join('\n');
}
// Ghép đề giống `kho.py ghep-de`: preamble/mau.tex + \phan{..}{..} + \anloigiai (đề) / \hienloigiai (đáp án).
// dethi.sty được nhúng bằng filecontents nên file .tex tự biên dịch được trên Overleaf, không cần thư mục preamble/.
function buildTex(giaoVien) {
  const e = state.exam;
  const body = [];
  const so = ['I', 'II', 'III', 'IV']; let p = 0;
  for (const [k, qs] of chosen()) {
    if (!qs.length) continue;
    const tieuDe = LOAI[k].part.replace(/^PHẦN [IV]+\.\s*/, '') + (LOAI[k].hd ? ' ' + LOAI[k].hd : '');
    body.push(D.dethi_sty ? `\\phan{${so[p++]}}{${tieuDe}}` : `\\par\\bigskip\\noindent{\\bfseries PHẦN ${so[p++]}.}~${tieuDe}\\par\\smallskip`, '\\setcounter{ex}{0}', '');
    qs.forEach((q) => body.push(`%% ${q.ma}`, q.latex, ''));
  }
  if (giaoVien) body.push(answerTable());
  const tieuDe = `\\begin{center}{\\bfseries\\large ${texEsc(e.title)}}\\\\[2pt] Thời gian làm bài: ${e.time} phút\\end{center}`;
  const head = [
    `%% ${giaoVien ? 'ĐÁP ÁN' : 'ĐỀ'} — tạo bởi ${D.ten_kho} ngày ${new Date().toLocaleDateString('vi-VN')}${D.commit ? ', kho commit ' + D.commit : ''}`,
    '%% Overleaf: New Project → Blank Project → dán toàn bộ vào main.tex → Menu → Compiler: XeLaTeX → Recompile.',
  ];
  let doc;
  if (D.mau_tex) {
    doc = D.mau_tex
      .replace('%%CHEDO%%', () => (giaoVien ? '\\hienloigiai' : '\\anloigiai'))
      .replace('%%TIEUDE%%', () => tieuDe)
      .replace('%%NOIDUNG%%', () => body.join('\n'));
  } else {
    doc = [...D.preamble, giaoVien ? '\\hienloigiai' : '\\anloigiai', '\\begin{document}', tieuDe, ...body, '\\end{document}'].join('\n');
  }
  if (D.dethi_sty) {
    doc = doc.replace(/\\usepackage\{(?:preamble\/)?dethi\}/, '\\usepackage{dethi}');
    head.push('\\begin{filecontents*}[overwrite]{dethi.sty}', D.dethi_sty.trimEnd(), '\\end{filecontents*}');
  }
  return head.join('\n') + '\n' + doc.trimEnd() + '\n';
}
function exportExam() {
  let giaoVien = false;
  const pre = h('pre', { class: 'code' });
  const tabs = h('div', { class: 'row', style: 'margin-bottom:12px' });
  const name = () => (giaoVien ? 'dap-an.tex' : 'de-thi.tex');
  const draw = () => {
    pre.textContent = buildTex(giaoVien);
    tabs.replaceChildren(
      h('button', { class: 'chip' + (giaoVien ? '' : ' on'), onclick: () => { giaoVien = false; draw(); } }, 'Đề (bản học sinh)'),
      h('button', { class: 'chip' + (giaoVien ? ' on' : ''), onclick: () => { giaoVien = true; draw(); } }, 'Đáp án (có lời giải + bảng đáp án)'));
  };
  draw();
  openModal('LaTeX đề thi', h('div', null, tabs,
    h('p', { class: 'muted small', style: 'margin-top:0' }, 'File tự đủ: gói dethi.sty đã được nhúng sẵn. Trên Overleaf tạo dự án trống, dán vào main.tex, chọn trình biên dịch XeLaTeX.'), pre), [
    h('button', { class: 'btn', onclick: async () => toast((await copyText(buildTex(giaoVien))) ? 'Đã chép toàn bộ LaTeX' : 'Không chép được') }, 'Chép toàn bộ'),
    h('button', { class: 'btn ghost', onclick: () => download(name(), buildTex(giaoVien)) }, 'Tải file .tex')]);
}

/* ---------- MÁY CHỦ CHẤM BÀI (Apps Script) ---------- */
const apiUrl = () => D?.apps_script_url || localStorage.getItem('toankho.apps_script_url') || '';
const teacher = {   // mã giáo viên nhớ trên máy này; có nút “Quên mã” khi dùng máy chung
  get: () => store.get('toankho.teacher_code', '') || sessionStorage.getItem('toankho.teacher_code') || '',
  set: (v) => store.set('toankho.teacher_code', v),
  clear: () => { try { localStorage.removeItem('toankho.teacher_code'); sessionStorage.removeItem('toankho.teacher_code'); } catch { } },
};
async function api(payload) {
  const url = apiUrl();
  if (!url) throw new Error('Chưa có địa chỉ Apps Script trong web/config.json.');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!data?.ok) {
    if (data?.error === 'UNAUTHORIZED') teacher.clear();
    const err = new Error(data?.message || 'Máy chủ không trả lời đúng.'); err.code = data?.error; throw err;
  }
  return data;
}
const gvApi = (action, extra = {}) => api({ action, teacherCode: teacher.get(), ...extra });
const fmtTime = (ms) => ms ? new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fmtScore = (x) => x == null ? '—' : String(x).replace('.', ',');
const STATUS = { NOT_OPEN: ['Chưa mở', 'b'], OPEN: ['Đang mở', 'g'], CLOSED: ['Đã đóng', ''] };
const studentLinkOf = (code) => `${location.origin}${location.pathname.replace(/\/[^/]*$/, '')}/kiem-tra/?b=${encodeURIComponent(code)}`;
const qrOf = (link) => `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;

// Tên bài tự gợi ý từ nội dung đề: “Kiểm tra 15 phút · Bài 1. Tính đơn điệu… · 21/10”
function autoTitle(minutes) {
  const qs = chosen().flatMap(([, x]) => x);
  const bais = [...new Set(qs.map(baiKey))], chs = [...new Set(qs.map((q) => `${q.lop}-${q.chuong}`))];
  let topic = 'Tổng hợp';
  if (bais.length === 1) topic = `Bài ${qs[0].bai}. ${baiName(qs[0].lop, qs[0].bai)}`;
  else if (chs.length === 1) topic = `Chương ${ROMAN[qs[0].chuong] || qs[0].chuong}. ${chuongOf(qs[0].lop, qs[0].chuong)?.ten || ''}`;
  else if (new Set(qs.map((q) => q.lop)).size === 1) topic = `Toán ${qs[0].lop}`;
  const d = new Date();
  return `Kiểm tra ${minutes} phút · ${topic} · ${d.getDate()}/${d.getMonth() + 1}`;
}

function teacherCodeField() {
  const inp = h('input', { type: 'password', placeholder: 'Mã bí mật đã cài trong Apps Script', value: teacher.get(), autocomplete: 'current-password' });
  const forget = h('button', { class: 'chip sm', type: 'button', hidden: !teacher.get(), onclick: () => { teacher.clear(); inp.value = ''; forget.hidden = true; toast('Đã quên mã giáo viên trên máy này'); } }, 'Quên mã trên máy này');
  return { inp, el: h('div', { class: 'field grow' }, h('label', null, 'Mã giáo viên (nhớ trên máy này)'), inp, h('div', { style: 'margin-top:4px' }, forget)) };
}

/* ---------- TRÒ CHƠI TRÊN LỚP: Bảng ô số (tro-choi/) và Đấu Trường (dau-truong/) ---------- */
const GAME_DEF = { kieu: 'bang', soDoi: 2, doi: ['Đội 1', 'Đội 2', 'Đội 3', 'Đội 4'], diem: { NB: 10, TH: 20, VD: 30, VDC: 40 }, giay: { NB: 30, TH: 45, VD: 90, VDC: 120 } };
function openGameModal() {
  const pref = Object.assign({}, GAME_DEF, store.get('toankho.game.pref.v1', {}));
  const qs = chosen().flatMap(([, list]) => list);
  const usableQs = qs.filter((q) => q.loai !== 'TL');
  const nTL = qs.length - usableQs.length;
  const ys = {};                                 // ý được hỏi của từng câu Đ/S
  usableQs.filter((q) => q.loai === 'DS').forEach((q) => { ys[q.ma] = [0, 1, 2, 3]; });

  // đội
  const teamBox = h('div', { class: 'row' });
  const names = pref.doi.slice(0, 4);
  while (names.length < 4) names.push('Đội ' + (names.length + 1));
  let soDoi = pref.soDoi;
  const drawTeams = () => teamBox.replaceChildren(
    ...[2, 3, 4].map((n) => h('button', { type: 'button', class: 'chip' + (soDoi === n ? ' on' : ''), onclick: () => { soDoi = n; drawTeams(); } }, n + ' đội')),
    ...names.slice(0, soDoi).map((v, i) => { const inp = h('input', { type: 'text', value: v, maxlength: 24, 'aria-label': 'Tên đội ' + (i + 1), style: 'width:140px' }); inp.oninput = () => { names[i] = inp.value; }; return h('div', { class: 'field' }, inp); }));
  drawTeams();

  // điểm và thời gian theo mức
  const diem = { ...pref.diem }, giay = { ...pref.giay };
  const numIn = (obj, k, min, max) => { const i = h('input', { type: 'number', min, max, value: obj[k], style: 'width:90px' }); i.onchange = () => { obj[k] = Math.min(max, Math.max(min, +i.value || min)); i.value = obj[k]; }; return i; };
  const diemCell = (el) => h('td', { class: 'col-diem' }, el);
  const mucTable = h('table', { class: 'tex-table ruled', style: 'margin:0' },
    h('tr', null, h('td', null, h('b', null, 'Mức độ')), diemCell(h('b', null, 'Điểm ô')), h('td', null, h('b', null, 'Thời gian (giây)'))),
    Object.keys(MUC).map((k) => h('tr', null, h('td', null, MUC[k]), diemCell(numIn(diem, k, 1, 1000)), h('td', null, numIn(giay, k, 5, 900)))));

  // chọn ý cho câu Đ/S
  const dsList = h('div', { class: 'qlist', style: 'gap:8px' });
  usableQs.filter((q) => q.loai === 'DS').forEach((q) => {
    const row = h('div', { class: 'row' });
    const draw = () => row.replaceChildren(
      h('span', { class: 'tag k mono' }, q.ma),
      h('span', { class: 'small muted grow', style: 'min-width:160px' }, plain(q.de).slice(0, 70) + '…'),
      ...[0, 1, 2, 3].map((i) => {
        const on = ys[q.ma].includes(i);
        return h('button', { type: 'button', class: 'pill-cb' + (on ? ' on' : ''), 'aria-pressed': on, title: plain(q.tf[i]).slice(0, 120), onclick: () => {
          const a = ys[q.ma];
          if (on) { if (a.length === 1) return toast('Mỗi câu Đ/S cần giữ ít nhất 1 ý'); a.splice(a.indexOf(i), 1); } else a.push(i);
          draw();
        } }, 'ý ' + 'abcd'[i]);
      }));
    draw(); dsList.append(row);
  });

  // hình thức chơi
  let kieu = pref.kieu === 'dau' ? 'dau' : 'bang';
  const KIEU = {
    bang: { ten: 'Bảng ô số', mo: 'Chiếu lên màn hình, chia đội, giáo viên nhập câu trả lời đội đọc to. Trả lời chưa đúng thì đội khác được giành quyền.' },
    dau: { ten: 'Đấu Trường', mo: 'Mỗi em trả lời trên điện thoại riêng (quét mã QR, không cần tài khoản). Máy chiếu giữ đáp án và chấm, điện thoại chỉ nhận đề.' },
  };
  const kieuBox = h('div', { class: 'row' }), moTa = h('p', { class: 'muted small', style: 'margin:6px 0 0' });
  const teamSec = h('div', null, h('h3', { style: 'margin-bottom:8px' }, 'Các đội'), teamBox);
  const mucNote = h('p', { class: 'muted small' });
  const drawKieu = () => {
    kieuBox.replaceChildren(...Object.keys(KIEU).map((k) => h('button', { type: 'button', class: 'chip' + (kieu === k ? ' on' : ''), onclick: () => { kieu = k; drawKieu(); } }, KIEU[k].ten)));
    moTa.textContent = KIEU[kieu].mo + ` Có ${usableQs.length} câu dùng được` + (nTL ? `, bỏ ${nTL} câu tự luận vì máy không chấm được.` : '.');
    teamSec.hidden = kieu !== 'bang';
    mucTable.querySelectorAll('.col-diem').forEach((c) => { c.hidden = kieu !== 'bang'; });
    mucNote.textContent = kieu === 'bang'
      ? 'Câu Đúng/Sai lấy mức cao nhất trong các ý được hỏi. Điểm câu Đúng/Sai = điểm ô × (số ý đúng ÷ số ý được hỏi).'
      : 'Điểm theo luật Đấu Trường: 600 + thưởng tốc độ (tối đa 400) + thưởng chuỗi (tối đa 300). Câu Đúng/Sai đúng một phần thì nhận phần điểm tương ứng.';
  };

  const body = h('div', { class: 'qlist', style: 'gap:18px' },
    h('div', null, h('h3', { style: 'margin-bottom:8px' }, 'Hình thức'), kieuBox, moTa),
    teamSec,
    h('div', null, h('h3', { style: 'margin-bottom:8px' }, 'Thời gian theo mức độ'), mucTable, mucNote),
    Object.keys(ys).length ? h('div', null, h('h3', { style: 'margin-bottom:8px' }, 'Ý được hỏi ở câu Đúng/Sai'), dsList) : null);
  drawKieu();

  const go = h('button', { class: 'btn', disabled: !usableQs.length, onclick: () => {
    const doi = names.slice(0, soDoi).map((v, i) => v.trim() || 'Đội ' + (i + 1));
    store.set('toankho.game.pref.v1', { kieu, soDoi, doi: names, diem, giay });
    const items = usableQs.map((q) => ({ ma: q.ma, y: ys[q.ma] || null }));
    const url = kieu === 'bang' ? 'tro-choi/' : 'dau-truong/chieu.html';
    if (kieu === 'bang') store.set('toankho.game.v1', { id: Date.now(), ten: state.exam.title, doi, diem, giay, items });
    else store.set('toankho.dautruong.v1', { id: Date.now(), ten: state.exam.title, giay, items });
    closeModal();
    if (!window.open(url, '_blank')) location.href = url;
  } }, 'Bắt đầu');
  openModal('Trò chơi trên lớp', body, [go, h('span', { class: 'small muted', style: 'align-self:center' }, 'Trò chơi mở ở tab mới. Bấm "Toàn màn hình" khi chiếu.')]);
}

/* ---------- GIAO BÀI ONLINE ---------- */
function openAssignOnlineModal() {
  const ch = Object.fromEntries(chosen());
  const onlineQs = [...(ch.TN4 || []), ...(ch.DS || []), ...(ch.TLN || [])];
  if (!onlineQs.length) return toast('Cần ít nhất 1 câu Trắc nghiệm, Đúng/Sai hoặc Trả lời ngắn để giao bài online.');
  const bad = onlineQs.filter((q) => q.loi_dap_an);
  if (bad.length) return toast(`Bỏ hoặc đổi các câu có đáp án cần kiểm tra: ${bad.map((q) => q.ma).join(', ')}`);

  const e = state.exam;
  const dur = +e.time || 15;
  const isDefault = !e.title || /^ĐỀ KIỂM TRA$/i.test(e.title.trim());
  const titleInp = h('input', { type: 'text', value: isDefault ? autoTitle(dur) : e.title });
  const timeInp = h('input', { type: 'number', min: 1, max: 300, value: dur, oninput: () => { if (isDefault) titleInp.value = autoTitle(+timeInp.value || dur); } });
  const now = new Date();
  const dt = 'border:1.5px solid var(--line);border-radius:12px;padding:8px 12px;background:#fff';
  const openInp = h('input', { type: 'datetime-local', value: toLocalInput(now), style: dt });
  const closeInp = h('input', { type: 'datetime-local', value: toLocalInput(new Date(now.getTime() + 24 * 3600e3)), style: dt });
  const setClose = (fn) => { const o = new Date(openInp.value || Date.now()); closeInp.value = toLocalInput(fn(o)); };
  const presets = h('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
    [['Hết tiết', (o) => new Date(o.getTime() + Math.max(45, (+timeInp.value || dur) + 5) * 60e3)],
      ['Cuối ngày', (o) => { const d = new Date(o); d.setHours(23, 59, 0, 0); return d; }],
      ['+1 ngày', (o) => new Date(o.getTime() + 24 * 3600e3)],
      ['+1 tuần', (o) => new Date(o.getTime() + 7 * 24 * 3600e3)]]
      .map(([t, fn]) => h('button', { class: 'chip sm', type: 'button', onclick: () => setClose(fn) }, t)));
  const shufQ = h('input', { type: 'checkbox', checked: true });
  const shufC = h('input', { type: 'checkbox', checked: true });
  const code = teacherCodeField();
  const errBox = h('div', { class: 'note-warn', hidden: true, style: 'border-color:#b3261e;background:#ffe3e0;color:#7c1d18' });

  const counts = `${(ch.TN4 || []).length} trắc nghiệm · ${(ch.DS || []).length} đúng–sai · ${(ch.TLN || []).length} trả lời ngắn`;
  const formBox = h('div', null,
    h('p', { class: 'muted small', style: 'margin-top:0' }, `${onlineQs.length} câu: ${counts}. Học sinh không cần tài khoản; máy chấm tự động theo thang 2025, quy về thang 10.`),
    ch.TL?.length ? h('div', { class: 'note-warn', style: 'margin:0 0 12px' }, `${ch.TL.length} câu tự luận không giao online (không chấm tự động được).`) : null,
    h('div', { class: 'row', style: 'margin-bottom:12px' },
      h('div', { class: 'field grow' }, h('label', null, 'Tên bài (học sinh thấy tên này)'), titleInp),
      h('div', { class: 'field', style: 'width:120px' }, h('label', null, 'Thời gian (phút)'), timeInp)),
    h('div', { class: 'row', style: 'margin-bottom:12px;align-items:flex-start' },
      h('div', { class: 'field grow' }, h('label', null, 'Mở đề lúc'), openInp),
      h('div', { class: 'field grow' }, h('label', null, 'Đóng đề lúc (sau đó học sinh xem được đáp án)'), closeInp, presets)),
    h('div', { class: 'row', style: 'margin-bottom:12px;gap:20px' },
      h('label', { class: 'cb' }, shufQ, 'Đảo thứ tự câu'), h('label', { class: 'cb' }, shufC, 'Đảo phương án A/B/C/D')),
    h('div', { class: 'row' }, code.el),
    errBox);

  const submitBtn = h('button', { class: 'btn' }, `Giao bài & tạo link`);
  const fail = (m) => { errBox.textContent = m; errBox.hidden = false; };
  submitBtn.onclick = async () => {
    errBox.hidden = true;
    const minutes = +timeInp.value || dur;
    const openMs = new Date(openInp.value).getTime(), closeMs = new Date(closeInp.value).getTime();
    if (!code.inp.value.trim()) return fail('Nhập mã giáo viên.');
    if (!(closeMs > openMs)) return fail('Giờ đóng phải sau giờ mở.');
    if (closeMs - openMs < minutes * 60e3) return fail(`Từ giờ mở đến giờ đóng ngắn hơn ${minutes} phút làm bài.`);
    teacher.set(code.inp.value.trim());
    submitBtn.disabled = true; submitBtn.textContent = 'Đang gửi đề lên Google Sheet…';
    try {
      const title = titleInp.value.trim() || autoTitle(minutes);
      const data = await gvApi('createExam', {
        title, mode: 'tu_lam', durationMinutes: minutes,
        openTime: new Date(openMs).toISOString(), closeTime: new Date(closeMs).toISOString(),
        shuffleQuestions: shufQ.checked, shuffleChoices: shufC.checked,
        questions: onlineQs.map((q) => ({
          ma: q.ma, loai: q.loai, dang: q.dang || '', de: q.de, choices: q.choices, tf: q.tf,
          hinh: (q.hinh || []).map((f) => ({ id: f.id, svg: f.svg })), dap_an: q.dap_an, loigiai: q.loigiai,
          hinh_lg: (q.hinh_lg || []).map((f) => ({ id: f.id, svg: f.svg })),
        })),
      });
      state.gvList = null;   // để trang Bài đã giao tải lại
      openModal('Đã giao bài', shareBox({ examCode: data.examCode, title, durationMinutes: minutes, closeTimeMs: closeMs }), [
        h('a', { class: 'btn', href: '#/bai-da-giao/' + data.examCode, onclick: closeModal }, 'Theo dõi kết quả')]);
    } catch (err) {
      fail(err.code === 'UNAUTHORIZED' ? 'Sai mã giáo viên.' : (err.message || 'Lỗi kết nối máy chủ Apps Script.'));
      submitBtn.disabled = false; submitBtn.textContent = 'Giao bài & tạo link';
    }
  };
  openModal('Giao bài online', formBox, [submitBtn]);
}

// Khối chia sẻ: mã to, QR, link, tin nhắn soạn sẵn để dán vào nhóm lớp
function shareBox(x) {
  const link = studentLinkOf(x.examCode);
  const msg = [x.title, `Mã bài: ${x.examCode}`, `Thời gian làm: ${x.durationMinutes} phút`, x.closeTimeMs ? `Hạn nộp: ${fmtTime(x.closeTimeMs)}` : null, `Làm bài tại: ${link}`].filter(Boolean).join('\n');
  return h('div', { class: 'share' },
    h('div', { class: 'share-code' }, h('small', null, 'Mã bài'), h('b', { class: 'mono' }, x.examCode)),
    h('img', { src: qrOf(link), alt: 'Mã QR vào bài', class: 'share-qr' }),
    h('div', { class: 'share-act' },
      h('input', { type: 'text', readonly: true, value: link, onclick: (ev) => ev.target.select() }),
      h('div', { class: 'row', style: 'gap:8px;justify-content:center' },
        h('button', { class: 'btn sm', onclick: async () => toast((await copyText(link)) ? 'Đã chép link' : 'Không chép được') }, 'Chép link'),
        h('button', { class: 'btn ghost sm', onclick: async () => toast((await copyText(msg)) ? 'Đã chép tin nhắn — dán vào nhóm lớp' : 'Không chép được') }, 'Chép tin nhắn gửi lớp'),
        h('a', { class: 'btn ghost sm', href: link, target: '_blank', rel: 'noopener' }, 'Mở thử'))));
}

/* ---------- BÀI ĐÃ GIAO (GIÁO VIÊN) ---------- */
function renderGV(root) {
  const box = h('div');
  root.append(h('div', { class: 'row', style: 'margin-bottom:16px' },
    state.gvCode ? h('a', { class: 'btn ghost sm', href: '#/bai-da-giao' }, '← Tất cả bài') : null,
    h('h1', { class: 'grow' }, state.gvCode ? 'Kết quả bài ' + state.gvCode : 'Bài đã giao'),
    h('button', { class: 'btn ghost sm', onclick: () => { state.gvList = null; delete (state.gvRes || {})[state.gvCode]; render(); } }, 'Làm mới')), box);
  if (!teacher.get()) return box.append(gvLogin());
  box.append(h('p', { class: 'muted' }, 'Đang tải…'));
  (state.gvCode ? gvDetail(box, state.gvCode) : gvList(box)).catch((err) => {
    box.replaceChildren(err.code === 'UNAUTHORIZED' ? gvLogin('Sai mã giáo viên, nhập lại.') : h('div', { class: 'panel empty-state' }, h('h3', null, 'Chưa tải được'), h('p', null, err.message)));
  });
}
function gvLogin(msg) {
  const code = teacherCodeField();
  const go = () => { if (!code.inp.value.trim()) return; teacher.set(code.inp.value.trim()); render(); };
  code.inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div', { class: 'panel', style: 'max-width:460px' },
    h('h3', null, 'Nhập mã giáo viên'), h('p', { class: 'muted small' }, 'Chỉ giáo viên có mã mới xem được điểm của học sinh.'),
    msg ? h('div', { class: 'note-warn' }, msg) : null, h('div', { class: 'row', style: 'margin-top:10px' }, code.el), h('button', { class: 'btn', style: 'margin-top:12px', onclick: go }, 'Xem bài đã giao'));
}
async function gvList(box) {
  const data = state.gvList || (state.gvList = await gvApi('listExams'));
  const ex = data.exams;
  const kids = [];
  if (!ex.length) kids.push(h('div', { class: 'panel empty-state' }, h('h3', null, 'Chưa giao bài nào'), h('p', null, 'Vào Tạo đề → chọn câu → Giao bài online.'), h('a', { class: 'btn', href: '#/tao-de' }, 'Tạo đề')));
  const list = h('div', { class: 'gv-list' }, ex.map((x) => {
    const [st, c] = STATUS[x.status] || ['', ''];
    return h('a', { class: 'panel gv-item', href: '#/bai-da-giao/' + x.examCode },
      h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'tag k mono' }, x.examCode), h('span', { class: 'tag ' + c }, st), h('span', { class: 'muted small' }, `${x.questionCount} câu · ${x.durationMinutes} phút`)),
      h('h3', null, x.title || 'Bài ' + x.examCode),
      h('div', { class: 'gv-nums' },
        h('div', null, h('b', null, x.submissions), h('small', null, 'bài nộp')),
        h('div', null, h('b', null, fmtScore(x.avgScore)), h('small', null, 'điểm TB')),
        h('div', null, h('b', { style: 'font-size:15px' }, fmtTime(x.closeTimeMs)), h('small', null, x.status === 'CLOSED' ? 'đã đóng' : 'hạn nộp'))));
  }));
  kids.push(list);
  if (data.sheetUrl) kids.push(h('p', { class: 'small muted' }, 'Dữ liệu gốc nằm trong ', h('a', { href: data.sheetUrl, target: '_blank', rel: 'noopener' }, 'Google Sheet'), '.'));
  box.replaceChildren(...kids);
}
async function gvDetail(box, codeX) {
  state.gvRes = state.gvRes || {};
  const data = state.gvRes[codeX] || (state.gvRes[codeX] = await gvApi('getExamResults', { examCode: codeX }));
  const x = data.exam; const S = data.students; const [st, c] = STATUS[x.status] || ['', ''];
  const scores = S.map((s) => s.score10);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const kids = [];

  // đầu trang: thông tin + thao tác
  const act = h('div', { class: 'row', style: 'gap:8px' },
    h('button', { class: 'btn ghost sm', onclick: () => openModal('Gửi bài cho học sinh', shareBox(x)) }, 'Link & QR'),
    x.status !== 'CLOSED' ? h('button', { class: 'btn ghost sm', onclick: () => gvUpdate(codeX, { closeTime: new Date().toISOString() }, 'Đóng bài ngay? Học sinh sẽ không nộp được nữa và xem được đáp án.') }, 'Đóng ngay') : null,
    h('button', { class: 'btn ghost sm', onclick: () => gvExtend(x) }, x.status === 'CLOSED' ? 'Mở lại / gia hạn' : 'Gia hạn'),
    h('button', { class: 'btn ghost sm danger', onclick: () => gvDelete(x, S.length) }, 'Xoá bài'));
  kids.push(h('div', { class: 'panel', style: 'margin-bottom:16px' },
    h('div', { class: 'row', style: 'gap:8px' }, h('span', { class: 'tag ' + c }, st), h('span', { class: 'muted small' }, `${x.questionCount} câu · ${x.durationMinutes} phút · mở ${fmtTime(x.openTimeMs)} · đóng ${fmtTime(x.closeTimeMs)}`)),
    h('h2', { style: 'margin:8px 0 10px' }, x.title), act));

  if (!S.length) {
    kids.push(h('div', { class: 'panel empty-state' }, h('h3', null, 'Chưa có học sinh nộp bài'), h('p', null, x.status === 'OPEN' ? 'Trang tự làm mới mỗi 30 giây.' : '')));
  } else {
    // số liệu tổng
    const pass = scores.filter((v) => v >= 5).length;
    kids.push(h('div', { class: 'gv-tiles' },
      [['Bài nộp', S.length], ['Điểm TB', fmtScore(Math.round(avg * 100) / 100)], ['Cao nhất', fmtScore(Math.max(...scores))], ['Thấp nhất', fmtScore(Math.min(...scores))], ['Từ 5 điểm', Math.round((pass / S.length) * 100) + '%']]
        .map(([k, v]) => h('div', { class: 'panel gv-tile' }, h('small', null, k), h('b', null, v)))));
    // phổ điểm
    const bins = Array(10).fill(0); scores.forEach((v) => bins[Math.min(9, Math.floor(v))]++);
    const mx = Math.max(...bins);
    kids.push(h('section', { class: 'panel', style: 'margin:16px 0' }, h('h3', null, 'Phổ điểm'),
      h('div', { class: 'hist' }, bins.map((n, i) => h('div', { class: 'hist-col', title: `${i}–${i + 1} điểm: ${n} học sinh` },
        h('span', { class: 'hist-n' }, n || ''), h('i', { style: `height:${mx ? Math.round((n / mx) * 100) : 0}%` + (i < 5 ? ';background:var(--y)' : '') }), h('small', null, i + (i === 9 ? '–10' : '')))))));
    // câu & dạng yếu
    kids.push(gvWeak(data));
    // bảng điểm
    kids.push(gvTable(x, S));
  }
  box.replaceChildren(...kids);
  if (x.status === 'OPEN') { clearInterval(route.timer); route.timer = setInterval(() => { if (state.gvCode === codeX && !document.hidden) { delete state.gvRes[codeX]; gvDetail(box, codeX).catch(() => { }); } }, 30000); }
}
function gvWeak(data) {
  const Q = data.questions.filter((q) => q.rate != null).sort((a, b) => a.rate - b.rate);
  const byDang = new Map();
  Q.forEach((q) => { if (!q.dang) return; const d = byDang.get(q.dang) || { dang: q.dang, sum: 0, n: 0, mas: [] }; d.sum += q.rate; d.n++; d.mas.push(q.ma); byDang.set(q.dang, d); });
  const weakDang = [...byDang.values()].map((d) => ({ ...d, rate: d.sum / d.n })).filter((d) => d.rate < 60).sort((a, b) => a.rate - b.rate);
  const bar = (rate) => h('div', { class: 'rate' }, h('i', { style: `width:${rate}%;background:${rate < 40 ? 'var(--accent)' : rate < 70 ? 'var(--y)' : '#7cc47a'}` }), h('span', null, Math.round(rate) + '%'));
  const sec = h('section', { class: 'panel', style: 'margin-bottom:16px' }, h('h3', null, 'Câu học sinh làm tốt / chưa tốt'),
    h('p', { class: 'muted small', style: 'margin-top:2px' }, 'Tỉ lệ điểm đạt được trên mỗi câu (câu Đúng–Sai tính theo thang điểm từng ý). Bấm mã câu để xem đề.'));
  const tbl = h('div', { class: 'qrate' });
  Q.forEach((q) => {
    const src = byMa.get(q.ma);
    tbl.append(h('button', { class: 'mono link', onclick: () => src ? openModal('Câu ' + q.ma, qCard(src, { noAdd: true })) : toast('Câu này không còn trong kho') }, q.ma),
      h('span', { class: 'tag ' + (LOAI[q.loai]?.c || '') }, LOAI[q.loai]?.ngan || q.loai),
      h('span', { class: 'small muted ell', title: dangName(q.dang) }, q.dang ? `${q.dang} ${dangName(q.dang)}` : ''),
      bar(q.rate), h('span', { class: 'small muted' }, q.blank ? `${q.blank} bỏ trống` : ''));
  });
  sec.append(tbl);
  if (weakDang.length) {
    sec.append(h('div', { class: 'note-warn', style: 'margin-top:14px' },
      h('b', null, `Dạng cần ôn (dưới 60%): `), weakDang.slice(0, 6).map((d) => `${d.dang} ${dangName(d.dang)} (${Math.round(d.rate)}%)`).join(' · '),
      h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn sm', onclick: () => makeReview(data, weakDang.slice(0, 6)) }, 'Tạo đề ôn từ các dạng này'))));
  }
  return sec;
}
// Đề ôn: mỗi dạng yếu lấy tối đa 2 câu mới (khác câu đã kiểm tra), cùng loại câu học sinh đã làm sai
function makeReview(data, weak) {
  const done = new Set(data.questions.map((q) => q.ma));
  const picks = { TN4: [], DS: [], TLN: [], TL: [] };
  for (const d of weak) {
    const loais = new Set(data.questions.filter((q) => q.dang === d.dang).map((q) => q.loai));
    const pool = shuffle(D.cau_hoi.filter((q) => q.dang === d.dang && usable(q) && !done.has(q.ma)));
    const got = [...pool.filter((q) => loais.has(q.loai)), ...pool.filter((q) => !loais.has(q.loai))].slice(0, 2);
    got.forEach((q) => { if (picks[q.loai].length < LOAI[q.loai].max) picks[q.loai].push(q.ma); });
  }
  const n = LOAI_KEYS.reduce((s, k) => s + picks[k].length, 0);
  if (!n) return toast('Kho chưa có câu mới nào cho các dạng này');
  if (examCount() && !confirm(`Đề đang soạn có ${examCount()} câu sẽ được thay bằng đề ôn ${n} câu. Tiếp tục?`)) return;
  Object.assign(state.exam, { title: 'Ôn tập: ' + data.exam.title, time: Math.max(10, n * 3), bai: [], picks, target: { TN4: picks.TN4.length, DS: picks.DS.length, TLN: picks.TLN.length, TL: 0 } });
  saveExam(); location.hash = '#/tao-de'; toast(`Đã tạo đề ôn ${n} câu — xem lại rồi giao bài`);
}
function gvTable(x, S) {
  let sortBy = 'className', asc = true, cls = '';
  const classes = [...new Set(S.map((s) => s.className))].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const wrap = h('section', { class: 'panel' });
  const rowsOf = () => S.filter((s) => !cls || s.className === cls).sort((a, b) => {
    const va = a[sortBy], vb = b[sortBy]; const r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'vi', { numeric: true });
    return (asc ? r : -r) || a.name.localeCompare(b.name, 'vi');
  });
  const tsv = () => [['Họ tên', 'Lớp', 'Điểm', 'Điểm thô', 'Số phút', 'Ghi chú'], ...rowsOf().map((s) => [s.name, s.className, fmtScore(s.score10), s.raw, s.minutes ?? '', [s.duplicate, s.late].filter(Boolean).join(', ')])].map((r) => r.join('\t')).join('\n');
  const draw = () => {
    const th = (k, t) => h('th', { class: 'sort' + (sortBy === k ? ' on' : ''), onclick: () => { asc = sortBy === k ? !asc : k !== 'score10'; sortBy = k; draw(); } }, t + (sortBy === k ? (asc ? ' ↑' : ' ↓') : ''));
    wrap.replaceChildren(
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('h3', { class: 'grow' }, 'Bảng điểm'),
        classes.length > 1 ? [h('button', { class: 'chip sm' + (!cls ? ' on' : ''), onclick: () => { cls = ''; draw(); } }, 'Tất cả'), ...classes.map((c) => h('button', { class: 'chip sm' + (cls === c ? ' on' : ''), onclick: () => { cls = c; draw(); } }, c))] : null,
        h('button', { class: 'btn ghost sm', onclick: async () => toast((await copyText(tsv())) ? 'Đã chép — dán thẳng vào Excel/Sheets' : 'Không chép được') }, 'Chép bảng điểm'),
        h('button', { class: 'btn ghost sm', onclick: () => download(`diem-${x.examCode}.csv`, '﻿' + tsv().replace(/\t/g, ',')) }, 'Tải CSV')),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, '#'), th('name', 'Họ tên'), th('className', 'Lớp'), th('score10', 'Điểm'), h('th', null, 'Điểm thô'), th('minutes', 'Số phút'), h('th', null, 'Ghi chú'))),
        h('tbody', null, rowsOf().map((s, i) => h('tr', null, h('td', null, i + 1), h('td', null, s.name), h('td', null, s.className),
          h('td', null, h('b', { style: s.score10 < 5 ? 'color:var(--accent-d)' : '' }, fmtScore(s.score10))), h('td', { class: 'small muted' }, s.raw), h('td', null, s.minutes ?? '—'),
          h('td', null, s.duplicate ? h('span', { class: 'tag warn' }, s.duplicate) : null, ' ', s.late ? h('span', { class: 'tag warn' }, s.late) : null)))))));
  };
  draw();
  return wrap;
}
async function gvUpdate(codeX, patch, ask) {
  if (ask && !confirm(ask)) return;
  try { await gvApi('updateExam', { examCode: codeX, ...patch }); state.gvList = null; delete state.gvRes[codeX]; toast('Đã cập nhật'); render(); }
  catch (err) { toast(err.message); }
}
// Xoá hẳn bài: có bài nộp thì phải gõ lại mã bài để tránh bấm nhầm
async function gvDelete(x, n) {
  const warn = `Xoá hẳn bài ${x.examCode} “${x.title}”?\n` + (n ? `${n} bài nộp của học sinh sẽ mất, không khôi phục được.` : 'Bài chưa có ai nộp.');
  if (n) { const typed = prompt(`${warn}\n\nGõ mã bài ${x.examCode} để xác nhận:`); if ((typed || '').trim().toUpperCase() !== x.examCode) return typed == null ? null : toast('Mã không khớp — chưa xoá'); }
  else if (!confirm(warn)) return;
  try {
    await gvApi('deleteExam', { examCode: x.examCode });
    state.gvList = null; delete state.gvRes[x.examCode];
    toast(`Đã xoá bài ${x.examCode}`); location.hash = '#/bai-da-giao';
  } catch (err) { toast(err.message); }
}
function gvExtend(x) {
  const base = new Date(Math.max(Date.now(), x.closeTimeMs || 0));
  const inp = h('input', { type: 'datetime-local', value: toLocalInput(new Date(base.getTime() + 24 * 3600e3)), style: 'border:1.5px solid var(--line);border-radius:12px;padding:8px 12px' });
  openModal('Đổi giờ đóng bài ' + x.examCode, h('div', null,
    h('p', { class: 'muted small', style: 'margin-top:0' }, 'Học sinh làm được đến giờ này; sau đó mới xem được đáp án.'),
    h('div', { class: 'row', style: 'gap:6px;margin-bottom:10px' }, [['+1 giờ', 3600e3], ['+1 ngày', 864e5], ['+1 tuần', 6048e5]].map(([t, d]) => h('button', { class: 'chip sm', onclick: () => (inp.value = toLocalInput(new Date(base.getTime() + d))) }, t))), inp),
    [h('button', { class: 'btn', onclick: () => { closeModal(); gvUpdate(x.examCode, { closeTime: new Date(inp.value).toISOString() }); } }, 'Lưu giờ đóng')]);
}

/* ---------- HƯỚNG DẪN ---------- */
async function renderHelp(root) {
  root.append(h('div', { class: 'help' },
    h('h1', null, 'Hướng dẫn nhanh'),
    h('ol', null,
      h('li', null, h('b', null, 'Tìm bài tập: '), 'vào ', h('i', null, 'Thư viện'), ' → chọn lớp → chọn chương (thẻ màu) → chọn bài/dạng ở cột trái. Lọc thêm theo loại câu và mức độ. Gõ vào ô tìm kiếm để tìm theo mã, nội dung, nguồn.'),
      h('li', null, h('b', null, 'Xem trực tiếp: '), 'công thức và hình được hiển thị sẵn; bấm ', h('i', null, 'Xem đáp án'), ' khi cần (đáp án và lời giải mặc định ẩn).'),
      h('li', null, h('b', null, 'Lấy LaTeX: '), 'bấm ', h('i', null, 'Lấy LaTeX'), ' để chép mã một câu, hoặc ', h('i', null, 'Lấy LaTeX cả danh sách'), ' để chép nhiều câu đang lọc.'),
      h('li', null, h('b', null, 'Trò chơi trên lớp: '), 'chọn câu ở ', h('i', null, 'Tạo đề'), ' → bấm ', h('i', null, 'Trò chơi trên lớp'), ' → chọn hình thức. ', h('i', null, 'Bảng ô số'), ': chia đội, chiếu lên màn hình, bấm nhầm thì dùng nút Hoàn tác (Ctrl+Z). ', h('i', null, 'Đấu Trường'), ': học sinh quét mã QR, trả lời trên điện thoại; máy chiếu giữ đáp án và chấm. Tải lại trang không mất ván đang chơi.'),
      h('li', null, h('b', null, 'Tạo đề & Giao bài online: '), 'vào ', h('i', null, 'Tạo đề'), ' → đặt số câu từng loại → chọn bài/chương → chọn tay hoặc để máy bốc ngẫu nhiên → bấm ', h('i', null, 'Giao bài online'), ' để lấy link & mã QR cho học sinh làm trên điện thoại, hoặc ', h('i', null, 'Xuất LaTeX'), '.'),
      h('li', null, h('b', null, 'Theo dõi kết quả: '), 'vào ', h('i', null, 'Bài đã giao'), ' (biểu tượng cột) → chọn bài để xem bảng điểm, phổ điểm, tỉ lệ đúng từng câu; đóng sớm, gia hạn hoặc xoá bài; bấm ', h('i', null, 'Tạo đề ôn'), ' để máy lấy câu mới thuộc các dạng học sinh làm chưa tốt.')),
    h('h2', { style: 'margin-top:22px' }, 'Cập nhật dữ liệu'),
    h('p', null, 'Trang này tự dựng lại từ kho GitHub mỗi khi có thay đổi mới (khoảng 1–3 phút sau khi push). Nếu câu hỏi mới chưa hiện, hãy tải lại trang.'),
    h('p', { class: 'muted small' }, 'Câu ở trạng thái “chờ duyệt” chỉ hiện khi tick “Cả câu chờ duyệt”, và không được đưa vào đề.')));
  let w = []; try { w = await (await fetch('data/canh-bao.json?v=' + Date.now())).json(); } catch { }
  root.append(h('details', { class: 'how' }, h('summary', null, `Cảnh báo dữ liệu từ kho (${w.length})`), w.length ? h('ul', null, w.map((x) => h('li', { class: 'small' }, x))) : h('p', { class: 'muted small' }, 'Không có cảnh báo — kho khớp với web.')));
}

/* ---------- định tuyến ---------- */
function render(opt = {}) {
  const y = window.scrollY;
  const view = $('#view');
  const root = document.createElement('div');
  document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  if (state.view === 'exam') renderExam(root); else if (state.view === 'help') renderHelp(root); else if (state.view === 'gv') renderGV(root); else renderLib(root);
  view.style.minHeight = view.offsetHeight + 'px';
  view.replaceChildren(...root.childNodes);
  window.scrollTo(0, opt.toTop ? 0 : y);
  requestAnimationFrame(() => {
    view.style.minHeight = '';
    if (opt.focusList) {
      const l = $('#ketqua');
      if (l && l.getBoundingClientRect().top < 0) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
function route() {
  clearInterval(route.timer); closeModal();
  const r = location.hash.replace(/^#\//, '');
  state.gvCode = null;
  if (r.startsWith('bai-da-giao')) { state.view = 'gv'; state.gvCode = r.split('/')[1] || null; }
  else state.view = r === 'tao-de' ? 'exam' : r === 'huong-dan' ? 'help' : 'lib';
  render({ toTop: true });
}
window.addEventListener('hashchange', route);
function doSearch() { state.lib.q = $('#q').value; state.lib.limit = PAGE; if (state.view !== 'lib') location.hash = '#/thu-vien'; else render(); }
$('#q').addEventListener('input', (() => { let t; return () => { clearTimeout(t); t = setTimeout(doSearch, 250); }; })());
$('#qBtn').addEventListener('click', doSearch);

load().then(route).catch((err) => {
  $('#view').replaceChildren(h('div', { class: 'panel empty-state' }, h('h2', null, 'Chưa tải được dữ liệu'), h('p', null, 'Không đọc được data/cauhoi.json. Hãy chạy lại bước dựng (node tools/build.mjs) hoặc mở trang qua máy chủ web, không mở trực tiếp file.'), h('code', null, String(err))));
});
