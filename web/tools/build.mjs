#!/usr/bin/env node
// Đọc kho kho-toan-thpt (cau-hoi/**/*.tex) và dựng site tĩnh vào web/site.
//   node tools/build.mjs [--src <thư mục gốc của kho>] [--tex]
// --src mặc định là thư mục cha của web/ (web/ nằm trong repo kho).
// --tex  biên dịch các hình TikZ/bảng thành SVG (cần xelatex + dvisvgm).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('src', path.join(WEB, '..')));
const OUT = path.join(WEB, 'site');
const DO_TEX = args.includes('--tex');
const config = JSON.parse(fs.readFileSync(path.join(WEB, 'config.json'), 'utf8'));
const warns = [];
const warn = (m) => { warns.push(m); console.warn('  ! ' + m); };

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);
function* walk(dir) {
  if (!exists(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

// ---------- tách {…} cân bằng ----------
function braced(s, i) { // s[i] === '{'
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '%' && (k === 0 || s[k - 1] !== '\\')) { while (k < s.length && s[k] !== '\n') k++; continue; }
    if (c === '{') d++;
    else if (c === '}' && --d === 0) return [s.slice(i + 1, k), k + 1];
  }
  return [s.slice(i + 1), s.length];
}
const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
// Lấy lệnh \name[opt]{a}{b}… ; trả về {args, start, end} hoặc null
function takeCmd(s, name, n) {
  const re = new RegExp('\\\\' + name + '(?![A-Za-z])', 'g');
  const m = re.exec(s);
  if (!m) return null;
  let i = skipWs(s, m.index + m[0].length);
  if (s[i] === '[') { const j = s.indexOf(']', i); if (j > 0) i = skipWs(s, j + 1); }
  const a = [];
  for (let k = 0; k < n; k++) {
    i = skipWs(s, i);
    if (s[i] !== '{') break;
    const [c, e] = braced(s, i); a.push(c); i = e;
  }
  return { args: a, start: m.index, end: i };
}
const cut = (s, r) => s.slice(0, r.start) + s.slice(r.end);

// ---------- hình ----------
// Hình = khối center có chứa tikzpicture (giữ cả lệnh thiết lập như \tdplotsetmaincoords), hoặc tikzpicture đứng riêng.
// Bảng tabular không phải hình: web tự hiển thị thành bảng HTML.
function pullFigures(text) {
  const figs = [];
  let out = text.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g, (m, body) => {
    if (!/\\begin\{tikzpicture\}/.test(body)) return m;
    figs.push(body.trim()); return '\n';
  });
  out = out.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, (m) => { figs.push(m.trim()); return '\n'; });
  return { text: out, figs };
}
function flattenImmini(s) {
  for (;;) {
    const r = takeCmd(s, 'immini', 2);
    if (!r || r.args.length < 2) return s;
    s = s.slice(0, r.start) + '\n' + r.args[0] + '\n\n' + r.args[1] + '\n' + s.slice(r.end);
  }
}

// ---------- đọc một file câu hỏi ----------
function parseHeader(src) {
  const h = {};
  for (const line of src.split('\n')) {
    const m = line.match(/^%%\s*([A-Za-z_0-9]+)\s*:\s*(.*)$/);
    if (!m) { if (/\\begin\{ex\}/.test(line)) break; continue; }
    let v = m[2].trim();
    if (v[0] === '"') { const e = v.indexOf('"', 1); v = e > 0 ? v.slice(1, e) : v.slice(1); }
    else if (v[0] === "'") { const e = v.indexOf("'", 1); v = e > 0 ? v.slice(1, e) : v.slice(1); }
    else v = v.replace(/\s+#.*$/, '').trim();
    h[m[1]] = v;
  }
  return h;
}
function parseQuestion(file, rel) {
  const src = read(file);
  const h = parseHeader(src);
  const bm = src.match(/\\begin\{ex\}[\s\S]*\\end\{ex\}/);
  if (!bm) { warn(`${rel}: không thấy \\begin{ex}…\\end{ex}`); return null; }
  const raw = bm[0];
  let inner = raw.replace(/^\\begin\{ex\}(\s*\[[^\]]*\])?/, '').replace(/\\end\{ex\}$/, '');

  const q = {
    ma: h.ma || path.basename(file, '.tex'),
    lop: +h.lop, chuong: +h.chuong, bai: +h.bai,
    dang: h.dang || '', loai: (h.loai || '').toUpperCase(),
    muc: [], dap_an: h.dap_an || '', nguon: h.nguon || '', kien_thuc: h.kien_thuc || '',
    trang_thai: h.trang_thai || 'chinh-thuc', ly_do: h.ly_do || '', ghi_chu: h.ghi_chu || '',
    duong_dan: rel.replace(/\\/g, '/'),
  };
  if (h.muc) q.muc = h.muc.replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean);

  // lời giải
  let lg = takeCmd(inner, 'loigiai', 1);
  let loigiai = '';
  if (lg) { loigiai = lg.args[0] || ''; inner = cut(inner, lg); }
  // đáp án ngắn / lựa chọn
  let tln = '';
  const sa = takeCmd(inner, 'shortans', 1);
  if (sa) { tln = (sa.args[0] || '').trim(); inner = cut(inner, sa); }
  let choices = [], tf = [];
  const ctf = takeCmd(inner, 'choiceTF', 4);
  if (ctf) { tf = ctf.args; inner = cut(inner, ctf); }
  else {
    const c = takeCmd(inner, 'choice', 4);
    if (c) { choices = c.args; inner = cut(inner, c); }
  }
  const stripTrue = (a) => { const t = /^\s*\\True\b\s*/.test(a); return [a.replace(/^\s*\\True\b\s*/, '').trim(), t]; };
  const ch = choices.map(stripTrue), tfs = tf.map(stripTrue);
  q.choices = ch.map(x => x[0]); q.tf = tfs.map(x => x[0]);
  const derived = q.loai === 'TN4' ? 'ABCD'[ch.findIndex(x => x[1])] || ''
    : q.loai === 'DS' ? tfs.map(x => x[1] ? 'Đ' : 'S').join('') : q.loai === 'TLN' ? tln : '';
  if (!q.dap_an) q.dap_an = derived || '-';
  else if (derived && q.loai !== 'TL' && q.dap_an.replace(/\s/g, '') !== derived) warn(`${q.ma}: dap_an "${q.dap_an}" khác đáp án suy ra từ \\True/\\shortans ("${derived}")`);
  q.tln = tln;

  inner = flattenImmini(inner);
  const stem = pullFigures(inner);
  q.de = stem.text.replace(/\n{3,}/g, '\n\n').trim();
  const sol = pullFigures(flattenImmini(loigiai));
  q.loigiai = sol.text.replace(/\n{3,}/g, '\n\n').trim();
  q.hinh = stem.figs.map((tex, i) => ({ id: `${q.ma}-q${i + 1}`, tex }));
  q.hinh_lg = sol.figs.map((tex, i) => ({ id: `${q.ma}-s${i + 1}`, tex }));
  q.latex = raw;
  // kiểm tra nhẹ
  if (!['TN4', 'DS', 'TLN', 'TL'].includes(q.loai)) warn(`${q.ma}: loại câu lạ "${q.loai}"`);
  if (!q.lop || !q.chuong || !q.bai) warn(`${q.ma}: thiếu lop/chuong/bai`);
  if (q.loai === 'TN4' && ch.length !== 4) warn(`${q.ma}: TN4 nhưng có ${ch.length} lựa chọn`);
  if (q.loai === 'DS' && tfs.length !== 4) warn(`${q.ma}: DS nhưng có ${tfs.length} ý`);
  return q;
}

// ---------- danh mục ----------
const first = (o, keys) => { for (const k of keys) if (o && o[k] !== undefined) return o[k]; return undefined; };
const asArr = (v) => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => (typeof x === 'object' ? { so: k, ...x } : { so: k, ten: x })) : []);
const num = (v) => +String(v ?? '').replace(/\D/g, '');
// Trả về [[khoá, giá trị], ...] cho cả mảng lẫn map; với mảng lấy khoá từ trường số.
function entries(v, keyFields) {
  if (Array.isArray(v)) return v.map((x) => [typeof x === 'object' ? first(x, keyFields) : x, x]);
  if (v && typeof v === 'object') return Object.entries(v).filter(([k]) => /^\d+$/.test(k));
  return [];
}
function normalizeToc(doc) {
  const out = [];
  const lops = entries(first(doc, ['lop', 'lớp', 'lops']) ?? doc, ['lop', 'lớp', 'so']);
  for (const [lk, L] of lops) {
    const lop = num(lk); if (!lop || !L) continue;
    const chuong = [];
    for (const [ck, C] of entries(first(L, ['chuong', 'chương', 'chapters']) ?? L, ['so', 'số', 'chuong', 'id', 'ma'])) {
      if (!C || !num(ck)) continue;
      const bai = [];
      for (const [bk, B] of entries(first(C, ['bai', 'bài', 'lessons']), ['so', 'số', 'bai', 'id', 'ma'])) {
        if (!num(bk)) continue;
        bai.push({ so: num(bk), ten: String(typeof B === 'object' && B ? first(B, ['ten', 'tên', 'name']) ?? '' : B ?? '') });
      }
      chuong.push({ so: num(ck), ten: String(first(C, ['ten', 'tên', 'name', 'title']) ?? ''), bai });
    }
    if (chuong.length) out.push({ lop, chuong });
  }
  return out;
}
function loadToc() {
  const base = JSON.parse(read(path.join(WEB, 'danh-muc.json')));
  const f = path.join(SRC, 'danh-muc', 'sgk-kntt.yaml');
  let fromRepo = [];
  if (exists(f)) {
    try { fromRepo = normalizeToc(YAML.parse(read(f))); } catch (e) { warn('sgk-kntt.yaml không đọc được: ' + e.message); }
    if (!fromRepo.length) warn('sgk-kntt.yaml có nhưng web chưa nhận ra cấu trúc → dùng danh-muc.json mặc định');
  }
  if (fromRepo.length) return fromRepo;            // mục lục của kho là chuẩn
  const merged = JSON.parse(JSON.stringify(base));
  for (const L of fromRepo) {
    let ml = merged.find(x => x.lop === L.lop); if (!ml) merged.push(ml = { lop: L.lop, chuong: [] });
    for (const C of L.chuong) {
      let mc = ml.chuong.find(x => x.so === C.so); if (!mc) ml.chuong.push(mc = { so: C.so, ten: C.ten, bai: [] });
      if (C.ten) mc.ten = C.ten;
      for (const B of C.bai) {
        const mb = mc.bai.find(x => x.so === B.so);
        if (mb) { if (B.ten) mb.ten = B.ten; } else mc.bai.push(B);
      }
    }
  }
  return merged;
}
function loadDang() {
  const map = {};
  const f = path.join(SRC, 'danh-muc', 'dang-toan.yaml');
  if (!exists(f)) return map;
  const CODE = /^\d{1,2}\.\d{1,2}\.\d{1,3}$/;
  const visit = (n, key) => {
    if (Array.isArray(n)) return n.forEach(x => visit(x));
    if (n && typeof n === 'object') {
      const code = first(n, ['ma', 'mã', 'id', 'code']);
      if (typeof code === 'string' && CODE.test(code)) {
        map[code] = { ten: String(first(n, ['ten', 'tên', 'name', 'title']) ?? ''), trang_thai: n.trang_thai || '' };
      }
      for (const [k, v] of Object.entries(n)) {
        if (CODE.test(String(k)) && typeof v === 'string') map[k] = { ten: v, trang_thai: '' };
        else if (CODE.test(String(k)) && v && typeof v === 'object' && !Array.isArray(v)) map[k] = { ten: String(first(v, ['ten', 'tên', 'name']) ?? ''), trang_thai: v.trang_thai || '' };
        else visit(v, k);
      }
    }
  };
  try { visit(YAML.parse(read(f))); } catch (e) { warn('dang-toan.yaml không đọc được: ' + e.message); }
  return map;
}

// ---------- chạy ----------
console.log('Kho:', SRC);
const qdir = path.join(SRC, 'cau-hoi');
if (!exists(qdir)) { console.error(`Không thấy ${qdir}`); process.exit(1); }
const questions = [];
for (const f of walk(qdir)) {
  if (!f.endsWith('.tex')) continue;
  const q = parseQuestion(f, path.relative(SRC, f));
  if (q) questions.push(q);
}
const seen = new Set();
for (const q of questions) { if (seen.has(q.ma)) warn(`Mã trùng: ${q.ma}`); seen.add(q.ma); }
questions.sort((a, b) => a.lop - b.lop || a.chuong - b.chuong || a.bai - b.bai || a.ma.localeCompare(b.ma));

const toc = loadToc();
// bổ sung lớp/chương/bài xuất hiện trong câu hỏi mà danh mục chưa có
for (const q of questions) {
  if (!q.lop) continue;
  let L = toc.find(x => x.lop === q.lop); if (!L) toc.push(L = { lop: q.lop, chuong: [] });
  let C = L.chuong.find(x => x.so === q.chuong); if (!C) { L.chuong.push(C = { so: q.chuong, ten: `Chương ${q.chuong}`, bai: [] }); warn(`Chương ${q.chuong} lớp ${q.lop} chưa có trong danh mục`); }
  if (!C.bai.find(x => x.so === q.bai)) { C.bai.push({ so: q.bai, ten: `Bài ${q.bai}` }); warn(`Bài ${q.bai} lớp ${q.lop} chưa có trong danh mục`); }
}
toc.sort((a, b) => a.lop - b.lop);
for (const L of toc) { L.chuong.sort((a, b) => a.so - b.so); for (const C of L.chuong) C.bai.sort((a, b) => a.so - b.so); }
const dang = loadDang();
for (const q of questions) if (q.dang && !dang[q.dang]) dang[q.dang] = { ten: '', trang_thai: 'chua-co' };

// ---------- dựng thư mục site ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'hinh'), { recursive: true });
for (const f of walk(path.join(WEB, 'src'))) {
  const dest = path.join(OUT, path.relative(path.join(WEB, 'src'), f));
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(f, dest);
}
const kdist = path.join(WEB, 'node_modules', 'katex', 'dist');
const kout = path.join(OUT, 'vendor', 'katex');
fs.mkdirSync(path.join(kout, 'fonts'), { recursive: true });
for (const f of ['katex.min.css', 'katex.min.js']) fs.copyFileSync(path.join(kdist, f), path.join(kout, f));
for (const f of fs.readdirSync(path.join(kdist, 'fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(kdist, 'fonts', f), path.join(kout, 'fonts', f));
// dropped woff/ttf: KaTeX css lists woff2 first; strip fallbacks so không 404
{
  const p = path.join(kout, 'katex.min.css');
  fs.writeFileSync(p, read(p).replace(/,url\([^)]*\.woff\) format\("woff"\)/g, '').replace(/,url\([^)]*\.ttf\) format\("truetype"\)/g, ''));
}

// hình
const figDir = path.join(OUT, 'hinh');
const figPre = config.figure_preamble;
const todo = [];
for (const q of questions) for (const f of [...q.hinh, ...q.hinh_lg]) {
  const pre = path.join(SRC, 'hinh', f.id + '.svg');           // SVG dựng sẵn, commit trong kho
  const gen = path.join(figDir, f.id + '.svg');
  if (exists(pre)) { fs.copyFileSync(pre, gen); f.svg = `hinh/${f.id}.svg`; }
  else if (DO_TEX) todo.push(f);
  else f.svg = null;
}
const CACHE = path.join(WEB, ".hinh-cache");   // giữ giữa các lần chạy (actions/cache)
fs.mkdirSync(CACHE, { recursive: true });
const HINH_VER = 'pdf-v2';   // đổi khi đổi cách dựng hình, để bỏ bộ nhớ đệm cũ
const hashOf = (f) => crypto.createHash("sha1").update(HINH_VER + "\n" + figPre + "\n" + f.tex).digest("hex").slice(0, 16);
const has = (cmd) => { try { execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }); return true; } catch { return false; } };
for (let i = todo.length - 1; i >= 0; i--) {
  const c = path.join(CACHE, hashOf(todo[i]) + ".svg");
  if (exists(c)) { fs.copyFileSync(c, path.join(figDir, todo[i].id + ".svg")); todo[i].svg = `hinh/${todo[i].id}.svg`; todo.splice(i, 1); }
}
if (todo.length) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'hinh-'));
  const env = { ...process.env, TEXINPUTS: `${SRC}/preamble//:${SRC}:` };
  // XeLaTeX → PDF (giống kho.py), rồi PDF → SVG. Không dùng xdv → dvisvgm: TikZ dưới XeTeX
  // ghi lệnh vẽ dạng dvipdfmx nên dvisvgm làm mất nét vẽ và dồn chữ về một chỗ.
  const conv = has('pdftocairo') ? 'pdftocairo' : 'dvisvgm';
  console.log(`Biên dịch ${todo.length} hình (PDF → SVG bằng ${conv})…`);
  const logErr = (name) => {
    const p = path.join(tmp, name + '.log');
    return exists(p) ? (read(p).match(/^! .*$/m) || [''])[0] : '';
  };
  for (const f of todo) {
    const tex = path.join(tmp, f.id + '.tex');
    const pdf = path.join(tmp, f.id + '.pdf');
    const out = path.join(figDir, f.id + '.svg');
    const compile = (cls) => {
      fs.writeFileSync(tex, `\\documentclass[${cls}]{standalone}\n${figPre}\n\\begin{document}\n${f.tex}\n\\end{document}\n`);
      execFileSync('xelatex', ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', tmp, tex], { env, stdio: 'pipe', cwd: tmp });
    };
    try {
      try { compile('border=6pt'); } catch { compile('border=6pt,varwidth=17cm'); }
      if (conv === 'pdftocairo') execFileSync('pdftocairo', ['-svg', pdf, out], { stdio: 'pipe' });
      else execFileSync('dvisvgm', ['--pdf', '--no-fonts', '-o', out, pdf], { stdio: 'pipe' });
      const w = parseFloat((read(out).match(/<svg[^>]*\swidth="([\d.]+)/) || [])[1] || '0');
      if (w && w < 25) warn(`Hình ${f.id}: SVG quá nhỏ (${w}pt), có thể bị lỗi`);
      f.svg = `hinh/${f.id}.svg`;
      fs.copyFileSync(out, path.join(CACHE, hashOf(f) + ".svg"));
    } catch (e) { f.svg = null; warn(`Hình ${f.id}: biên dịch lỗi ${logErr(f.id)}`.trim()); }
  }
}
for (const q of questions) for (const f of [...q.hinh, ...q.hinh_lg]) if (f.svg === undefined) f.svg = null;

let commit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : '';
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { cwd: SRC, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { } }
const data = {
  tao_luc: new Date().toISOString(), commit,
  ten_kho: config.ten_kho, preamble: config.preamble,
  mau_tex: exists(path.join(SRC, 'preamble', 'mau.tex')) ? read(path.join(SRC, 'preamble', 'mau.tex')) : '',
  dethi_sty: exists(path.join(SRC, 'preamble', 'dethi.sty')) ? read(path.join(SRC, 'preamble', 'dethi.sty')) : '',
  muc_luc: toc, dang, cau_hoi: questions,
};
fs.writeFileSync(path.join(OUT, 'data', 'cauhoi.json'), JSON.stringify(data));
fs.writeFileSync(path.join(OUT, 'data', 'canh-bao.json'), JSON.stringify(warns, null, 1));
const nChinh = questions.filter(q => q.trang_thai === 'chinh-thuc').length;
console.log(`Xong: ${questions.length} câu (${nChinh} chính thức), ${warns.length} cảnh báo → ${path.relative(process.cwd(), OUT)}`);
