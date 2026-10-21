'use strict';
/* ToánKho — Bộ hiển thị công thức LaTeX (KaTeX), bảng tabular và hình SVG.
   Dùng chung cho trang chính (app.js) và trang học sinh làm bài (kiem-tra/kiem-tra.js). */

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MACROS = {
  '\\heva': '\\left\\{\\begin{array}{l}#1\\end{array}\\right.',
  '\\hoac': '\\left[\\begin{array}{l}#1\\end{array}\\right.',
  '\\vec': '\\overrightarrow{#1}',
  '\\dpi': '\\displaystyle',
  '\\Oxyz': 'Oxyz',
};

function katexHtml(src, display) {
  try {
    return katex.renderToString(src, {
      displayMode: display,
      throwOnError: false,
      macros: { ...MACROS },
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return `<code>${esc(src)}</code>`;
  }
}

function braceArg(s, i) { // s[i]==='{'
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === '\\') { k++; continue; }
    if (s[k] === '{') d++;
    else if (s[k] === '}' && --d === 0) return [s.slice(i + 1, k), k + 1];
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

const PU = {
  b: '\uE001', B: '\uE002', i: '\uE003', I: '\uE004', u: '\uE005', U: '\uE006',
  br: '\uE007', ul: '\uE008', UL: '\uE009', ol: '\uE00A', OL: '\uE00B', li: '\uE00C',
  p: '\uE00D', c: '\uE00E', C: '\uE00F',
};
const PU_HTML = {
  [PU.c]: '<div class="tex-center">', [PU.C]: '</div>',
  [PU.b]: '<b>', [PU.B]: '</b>',
  [PU.i]: '<i>', [PU.I]: '</i>',
  [PU.u]: '<u>', [PU.U]: '</u>',
  [PU.br]: '<br>',
  [PU.ul]: '<ul>', [PU.UL]: '</ul>',
  [PU.ol]: '<ol>', [PU.OL]: '</ol>',
  [PU.li]: '<li>',
  [PU.p]: '</p><p>',
};

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

function splitTop(s, sep) { // tách theo sep ở mức ngoài cùng (không trong {} hay $…$)
  const out = []; let d = 0, m = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if (c === '{') d++; else if (c === '}') d--; else if (c === '$') m = !m;
    if (c === sep && !d && !m) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}

// Bảng tabular → bảng HTML (hỗ trợ \hline, \cline, \multicolumn)
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
  let s = String(src).replace(/(^|[^\\])%[^\n]*/g, '$1');
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
      if (m) {
        const end = '\\end{' + m[1] + '}';
        const j = s.indexOf(end, i);
        if (j > 0) { flush(); out.push(katexHtml(s.slice(i, j + end.length), true)); i = j + end.length; continue; }
      }
    }
    buf += c; i++;
  }
  flush();
  return '<p>' + out.join('') + '</p>';
}

const plain = (s) => String(s || '').replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}$\\^_]/g, ' ').replace(/\s+/g, ' ').toLowerCase();

/**
 * Tạo phần tử hiển thị hình vẽ SVG của câu hỏi hoặc lời giải.
 * Hỗ trợ cả đường dẫn file SVG trên ToánKho (hinh/xxx.svg) lẫn mã <svg>...</svg> nhúng trực tiếp (cho câu biến thể).
 * @param {object|string} f - Đối tượng { id, svg } hoặc chuỗi đường dẫn / mã SVG
 * @param {string} [basePath=''] - Tiền tố đường dẫn (ví dụ '../' khi gọi từ trang con kiem-tra/)
 */
function figEl(f, basePath = '') {
  const svgVal = typeof f === 'string' ? f : f?.svg;
  if (svgVal) {
    const trimmed = String(svgVal).trim();
    if (trimmed.startsWith('<svg')) {
      return h('div', { class: 'fig', html: trimmed });
    }
    const isAbs = /^(https?:|data:|blob:|\/|\.\.\/)/i.test(trimmed);
    const src = isAbs ? trimmed : (basePath + trimmed);
    return h('div', { class: 'fig' }, h('img', { src, alt: 'Hình minh họa của câu hỏi', loading: 'lazy' }));
  }
  return h('div', { class: 'fig fig-miss' }, 'Hình đang được dựng (kho chưa có bản SVG của hình này). Mã TikZ vẫn có trong LaTeX.');
}
