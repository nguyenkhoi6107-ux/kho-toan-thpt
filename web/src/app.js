'use strict';
/* ToánKho — giao diện tĩnh, đọc data/cauhoi.json do tools/build.mjs sinh ra từ kho GitHub. */

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

/* ---------- tiện ích DOM ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/* ---------- LaTeX → HTML ---------- */
const MACROS = {
  '\\heva': '\\left\\{\\begin{array}{l}#1\\end{array}\\right.',
  '\\hoac': '\\left[\\begin{array}{l}#1\\end{array}\\right.',
  '\\vec': '\\overrightarrow{#1}',
  '\\dpi': '\\displaystyle',
  '\\Oxyz': 'Oxyz',
};
function katexHtml(src, display) {
  try { return katex.renderToString(src, { displayMode: display, throwOnError: false, macros: { ...MACROS }, strict: 'ignore', trust: false }); }
  catch { return `<code>${esc(src)}</code>`; }
}
function braceArg(s, i) { // s[i]==='{'
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === '{') d++; else if (s[k] === '}' && --d === 0) return [s.slice(i + 1, k), k + 1];
  }
  return [s.slice(i + 1), s.length];
}
// Thay \cmd{x} bằng open+x+close (x đệ quy), trước khi tách công thức.
function wrapCmds(s, map) {
  const re = new RegExp('\\\\(' + Object.keys(map).join('|') + ')\\s*\\{', 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(s))) {
    const [arg, end] = braceArg(s, m.index + m[0].length - 1);
    out += s.slice(last, m.index) + map[m[1]][0] + wrapCmds(arg, map) + map[m[1]][1];
    last = end; re.lastIndex = end;
  }
  return out + s.slice(last);
}
const PU = { b: '\uE001', B: '\uE002', i: '\uE003', I: '\uE004', u: '\uE005', U: '\uE006', br: '\uE007', ul: '\uE008', UL: '\uE009', ol: '\uE00A', OL: '\uE00B', li: '\uE00C', p: '\uE00D', c: '\uE00E', C: '\uE00F' };
const PU_HTML = { [PU.c]: '<div class="tex-center">', [PU.C]: '</div>', [PU.b]: '<b>', [PU.B]: '</b>', [PU.i]: '<i>', [PU.I]: '</i>', [PU.u]: '<u>', [PU.U]: '</u>', [PU.br]: '<br>', [PU.ul]: '<ul>', [PU.UL]: '</ul>', [PU.ol]: '<ol>', [PU.OL]: '</ol>', [PU.li]: '<li>', [PU.p]: '</p><p>' };
function textPart(t) {
  t = esc(t)
    .replace(/\\\\(\[[^\]]*\])?/g, PU.br)
    .replace(/\\(?:noindent|medskip|bigskip|smallskip|centering|indent)\b\s*/g, '')
    .replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, '')
    .replace(/\\begin\{center\}/g, PU.c).replace(/\\end\{center\}/g, PU.C)
    .replace(/\\(?:renewcommand|setlength)\s*\{?\\[a-zA-Z]+\}?\s*\{[^}]*\}/g, '')
    .replace(/\\(?:small|footnotesize|normalsize|large|Large|par)\b\s*/g, '')
    .replace(/\\begin\{itemize\}(\[[^\]]*\])?/g, PU.ul).replace(/\\end\{itemize\}/g, PU.UL)
    .replace(/\\begin\{enumerate\}(\[[^\]]*\])?/g, PU.ol).replace(/\\end\{enumerate\}/g, PU.OL)
    .replace(/\\item\b\s*(\[[^\]]*\])?/g, PU.li)
    .replace(/\\(?:ldots|dots)\b/g, '…').replace(/\\textdegree/g, '°')
    .replace(/\\([%&#_$])/g, '$1').replace(/\\ /g, ' ').replace(/\\,/g, '\u202f')
    .replace(/``/g, '“').replace(/''/g, '”').replace(/---/g, '—').replace(/--/g, '–').replace(/~/g, '\u00a0')
    .replace(/\n{2,}/g, PU.p);
  return t.replace(/[\uE001-\uE00F]/g, (c) => PU_HTML[c]);
}
function splitTop(s, sep) { // t\u00E1ch theo sep \u1EDF m\u1EE9c ngo\u00E0i c\u00F9ng (kh\u00F4ng trong {} hay $\u2026$)
  const out = []; let d = 0, m = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if (c === '{') d++; else if (c === '}') d--; else if (c === '$') m = !m;
    if (c === sep && !d && !m) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
// B\u1EA3ng tabular \u2192 b\u1EA3ng HTML (h\u1ED7 tr\u1EE3 \hline, \cline, \multicolumn)
function tabularHtml(spec, body) {
  const aligns = spec.replace(/\*\{(\d+)\}\{([^}]*)\}/g, (_, n, x) => x.repeat(+n))
    .replace(/[p>@]\{[^}]*\}/g, (m) => (m[0] === 'p' ? 'l' : '')).replace(/[^lcr]/g, '').split('');
  const ruled = /\|/.test(spec) || /\\hline/.test(body);
  const rows = body.split(/\\\\(?:\[[^\]]*\])?/)
    .map((r) => r.replace(/\\(?:hline|cline\{[^}]*\}|toprule|midrule|bottomrule)/g, '').trim()).filter(Boolean);
  const tr = rows.map((r) => {
    let col = 0;
    return '<tr>' + splitTop(r, '&').map((cell) => {
      let span = 1, al = aligns[col] || 'c';
      const mc = cell.trim().match(/^\\multicolumn\{(\d+)\}\{([^}]*)\}\{([\s\S]*)\}$/);
      if (mc) { span = +mc[1]; al = (mc[2].match(/[lcr]/) || ['c'])[0]; cell = mc[3]; }
      col += span;
      const html = renderRich(cell.trim()).replace(/^<p>|<\/p>$/g, '');
      return '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + ' class="a-' + al + '">' + html + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<div class="tex-table-wrap"><table class="tex-table' + (ruled ? ' ruled' : '') + '">' + tr + '</table></div>';
}
const skipWsIdx = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
const ENV = /^\\begin\{(align\*?|equation\*?|gather\*?|multline\*?|cases|array|matrix|pmatrix|vmatrix)\}/;
const RICH = new Map();
function renderRich(src) {
  if (!src) return '';
  let hit = RICH.get(src);
  if (hit === undefined) { hit = renderRichRaw(src); RICH.set(src, hit); }
  return hit;
}
function renderRichRaw(src) {
  let s = src.replace(/(^|[^\\])%[^\n]*/g, '$1');
  s = wrapCmds(s, {
    textbf: [PU.b, PU.B], textit: [PU.i, PU.I], emph: [PU.i, PU.I], underline: [PU.u, PU.U],
    textrm: ['', ''], textsf: ['', ''], mbox: ['', ''],
  });
  const out = []; let i = 0, buf = '';
  const flush = () => { if (buf) { out.push(textPart(buf)); buf = ''; } };
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '$') { buf += '\\$'; i += 2; continue; }
    if (c === '$') {
      const dbl = s[i + 1] === '$'; const q = dbl ? '$$' : '$';
      let j = i + q.length;
      for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s.startsWith(q, j)) break; }
      if (j < s.length) { flush(); out.push(katexHtml(s.slice(i + q.length, j), dbl)); i = j + q.length; continue; }
    }
    if (c === '\\' && (s[i + 1] === '[' || s[i + 1] === '(')) {
      const close = s[i + 1] === '[' ? '\\]' : '\\)'; const j = s.indexOf(close, i + 2);
      if (j > 0) { flush(); out.push(katexHtml(s.slice(i + 2, j), s[i + 1] === '[')); i = j + 2; continue; }
    }
    if (s.startsWith('\\begin{tabular}', i)) {
      const j = s.indexOf('\\end{tabular}', i);
      const k = skipWsIdx(s, i + 15);
      if (j > 0 && s[k] === '{') {
        const [spec, e] = braceArg(s, k);
        flush(); out.push(tabularHtml(spec, s.slice(e, j))); i = j + 13; continue;
      }
    }
    if (c === '\\') {
      const m = s.slice(i, i + 40).match(ENV);
      if (m) { const end = '\\end{' + m[1] + '}'; const j = s.indexOf(end, i); if (j > 0) { flush(); out.push(katexHtml(s.slice(i, j + end.length), true)); i = j + end.length; continue; } }
    }
    buf += c; i++;
  }
  flush();
  return '<p>' + out.join('') + '</p>';
}
const plain = (s) => String(s || '').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$\\^_]/g, ' ').replace(/\s+/g, ' ').toLowerCase();

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
  for (const k of LOAI_KEYS) state.exam.picks[k] = state.exam.picks[k].filter((m) => byMa.has(m));
  const first = D.muc_luc.find((L) => D.cau_hoi.some((q) => q.lop === L.lop));
  state.lib.lop = (first || D.muc_luc[0] || { lop: 12 }).lop;
  updateBadge();
}

/* ---------- thẻ câu hỏi ---------- */
function figEl(f) {
  if (f.svg) return h('div', { class: 'fig' }, h('img', { src: f.svg, alt: 'Hình minh họa của câu hỏi', loading: 'lazy' }));
  return h('div', { class: 'fig fig-miss' }, 'Hình đang được dựng (kho chưa có bản SVG của hình này). Mã TikZ vẫn có trong LaTeX.');
}
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
      official(q) ? null : h('span', { class: 'tag warn', title: q.ly_do }, 'Chờ duyệt')),
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
  return D.cau_hoi.filter((q) => q.loai === k && official(q) && (!set.size || set.has(baiKey(q))) && (!exclude || !e.picks[k].includes(q.ma)));
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
  root.append(h('div', { class: 'row', style: 'margin-bottom:16px' }, h('h1', { class: 'grow' }, 'Tạo đề thi'), h('span', { class: 'muted small' }, 'Chọn cấu trúc → chọn phạm vi → chọn câu → xuất LaTeX')));
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

/* ---------- HƯỚNG DẪN ---------- */
async function renderHelp(root) {
  root.append(h('div', { class: 'help' },
    h('h1', null, 'Hướng dẫn nhanh'),
    h('ol', null,
      h('li', null, h('b', null, 'Tìm bài tập: '), 'vào ', h('i', null, 'Thư viện'), ' → chọn lớp → chọn chương (thẻ màu) → chọn bài/dạng ở cột trái. Lọc thêm theo loại câu và mức độ. Gõ vào ô tìm kiếm để tìm theo mã, nội dung, nguồn.'),
      h('li', null, h('b', null, 'Xem trực tiếp: '), 'công thức và hình được hiển thị sẵn; bấm ', h('i', null, 'Xem đáp án'), ' khi cần (đáp án và lời giải mặc định ẩn).'),
      h('li', null, h('b', null, 'Lấy LaTeX: '), 'bấm ', h('i', null, 'Lấy LaTeX'), ' để chép mã một câu, hoặc ', h('i', null, 'Lấy LaTeX cả danh sách'), ' để chép nhiều câu đang lọc.'),
      h('li', null, h('b', null, 'Tạo đề: '), 'vào ', h('i', null, 'Tạo đề'), ' → đặt số câu từng loại → chọn bài/chương → chọn tay hoặc để máy bốc ngẫu nhiên → ', h('i', null, 'Xuất LaTeX'), '.')),
    h('h2', { style: 'margin-top:22px' }, 'Cập nhật dữ liệu'),
    h('p', null, 'Trang này tự dựng lại từ kho GitHub mỗi khi có thay đổi mới (khoảng 1–3 phút sau khi push). Nếu câu hỏi mới chưa hiện, hãy tải lại trang.'),
    h('p', { class: 'muted small' }, 'Câu ở trạng thái “chờ duyệt” chỉ hiện khi tick “Cả câu chờ duyệt”, và không được đưa vào đề.')));
  let w = []; try { w = await (await fetch('data/canh-bao.json?v=' + Date.now())).json(); } catch { }
  root.append(h('details', { class: 'how' }, h('summary', null, `Cảnh báo dữ liệu từ kho (${w.length})`), w.length ? h('ul', null, w.map((x) => h('li', { class: 'small' }, x))) : h('p', { class: 'muted small' }, 'Không có cảnh báo — kho khớp với web.')));
}

/* ---------- định tuyến ---------- */
// Mặc định giữ nguyên vị trí cuộn; chỉ về đầu trang khi đổi mục (toTop).
// focusList: sau khi đổi bộ lọc, nếu đầu danh sách câu đã trôi lên trên màn hình thì cuộn nhẹ tới đó.
function render(opt = {}) {
  const y = window.scrollY;
  const view = $('#view');
  const root = document.createElement('div');
  document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
  if (state.view === 'exam') renderExam(root); else if (state.view === 'help') renderHelp(root); else renderLib(root);
  view.style.minHeight = view.offsetHeight + 'px';          // tránh trang co lại rồi giãn ra
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
function route() { const r = location.hash.replace(/^#\//, ''); state.view = r === 'tao-de' ? 'exam' : r === 'huong-dan' ? 'help' : 'lib'; render({ toTop: true }); }
window.addEventListener('hashchange', route);
function doSearch() { state.lib.q = $('#q').value; state.lib.limit = PAGE; if (state.view !== 'lib') location.hash = '#/thu-vien'; else render(); }
$('#q').addEventListener('input', (() => { let t; return () => { clearTimeout(t); t = setTimeout(doSearch, 250); }; })());
$('#qBtn').addEventListener('click', doSearch);

load().then(route).catch((err) => {
  $('#view').replaceChildren(h('div', { class: 'panel empty-state' }, h('h2', null, 'Chưa tải được dữ liệu'), h('p', null, 'Không đọc được data/cauhoi.json. Hãy chạy lại bước dựng (node tools/build.mjs) hoặc mở trang qua máy chủ web, không mở trực tiếp file.'), h('code', null, String(err))));
});
