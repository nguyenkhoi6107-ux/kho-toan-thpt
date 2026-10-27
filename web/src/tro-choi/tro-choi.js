'use strict';
/* ToánKho — Trò chơi "Bảng ô số" chiếu trên lớp.
   Chạy hoàn toàn trên máy giáo viên: đọc cấu hình do trang Tạo đề ghi vào localStorage,
   lấy câu hỏi từ ../data/cauhoi.json, chấm ngay tại máy. Không cần mạng ngoài, không cần máy chủ.

   Luật:
   - Các đội lần lượt chọn ô. Điểm ô theo mức độ, thời gian theo mức độ (giáo viên đặt lúc tạo game).
   - Giáo viên nhập câu trả lời đội đọc to rồi bấm Chốt.
   - Câu Đúng/Sai chỉ hỏi các ý giáo viên đã chọn; điểm = điểm ô × (số ý đúng ÷ số ý được hỏi).
   - Trả lời chưa đúng hoàn toàn thì các đội khác được giành quyền trả lời, mỗi đội một lần.
   - Đội đầu tiên trả lời đúng hoàn toàn chiếm ô. Xong một ô thì lượt chuyển sang đội kế tiếp. */

const KEY_CFG = 'toankho.game.v1';
const KEY_STATE = 'toankho.game.state.v1';
const KEY_HIST = 'toankho.game.hist.v1';   // các bước đã làm, để hoàn tác (tối đa 50 bước)
const MUC_ORDER = ['NB', 'TH', 'VD', 'VDC'];
const MUC_TEN = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };
const TEAM_COLORS = ['var(--y)', 'var(--p)', 'var(--b)', 'var(--g)'];

/* ---------- phần tính toán (không đụng tới giao diện, kiểm thử được bằng node) ---------- */

// Mức của câu: TN4/TLN lấy mức của câu; Đ/S lấy mức cao nhất trong các ý được hỏi.
function levelOf(q, y) {
  let list = q.muc || [];
  if (q.loai === 'DS' && list.length === 4 && y && y.length) list = y.map((i) => list[i]);
  list = list.filter((m) => MUC_ORDER.includes(m));
  if (!list.length) return 'TH';
  return list.reduce((a, b) => (MUC_ORDER.indexOf(b) > MUC_ORDER.indexOf(a) ? b : a));
}

// Cùng cách chuẩn hoá với Apps Script (bỏ khoảng trắng, đổi dấu trừ, phẩy → chấm),
// thêm so sánh theo giá trị số để "4,90" và "4,9" được coi là bằng nhau.
function normShort(v) {
  return String(v ?? '').replace(/\s+/g, '').replace(/[−–—]/g, '-').replace(/,/g, '.');
}
function sameShort(a, b) {
  const x = normShort(a), y = normShort(b);
  if (!x || !y) return false;
  const num = /^[-+]?(\d+\.?\d*|\.\d+)$/;
  if (num.test(x) && num.test(y)) return Number(x) === Number(y);
  return x === y;
}

// Tỉ lệ đúng của một lần trả lời, từ 0 đến 1.
// ans: TN4 → 'A'..'D'; TLN → chuỗi; DS → { [chỉ số ý]: 'Đ' | 'S' }.
function grade(q, ans, y) {
  if (q.loai === 'TN4') return ans && ans === q.dap_an ? 1 : 0;
  if (q.loai === 'TLN') return sameShort(ans, q.tln || q.dap_an) ? 1 : 0;
  if (q.loai === 'DS') {
    if (!y || !y.length) return 0;
    const ok = y.filter((i) => ans && ans[i] && ans[i] === q.dap_an[i]).length;
    return ok / y.length;
  }
  return 0;
}

const award = (pts, ratio) => Math.round(pts * ratio);

// Tạo trạng thái ván chơi mới từ cấu hình và dữ liệu kho.
function newGame(cfg, byMa, rand = Math.random) {
  const tiles = [];
  for (const it of cfg.items) {
    const q = byMa.get(it.ma);
    if (!q || q.loai === 'TL') continue;
    const y = q.loai === 'DS' ? (it.y && it.y.length ? it.y.slice().sort() : [0, 1, 2, 3]) : null;
    const muc = levelOf(q, y);
    tiles.push({ ma: q.ma, y, muc, pts: cfg.diem[muc], time: cfg.giay[muc], owner: null, done: false, tries: [] });
  }
  for (let i = tiles.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [tiles[i], tiles[j]] = [tiles[j], tiles[i]]; }
  return {
    cfgId: cfg.id,
    teams: cfg.doi.map((name) => ({ name, score: 0 })),
    tiles, turn: 0, cur: null, phase: 'board', answering: null, left: 0, running: false,
  };
}

// Ghi một lần trả lời; trả về trạng thái sau đó ('result' nếu ô đã xong, 'steal' nếu còn đội được giành quyền).
function submit(st, q, ans) {
  const t = st.tiles[st.cur];
  const ratio = grade(q, ans, t.y);
  const pts = award(t.pts, ratio);
  t.tries.push({ team: st.answering, ans, ratio, pts });
  st.teams[st.answering].score += pts;
  st.running = false;
  if (ratio === 1) { t.owner = st.answering; return finishTile(st); }
  if (stealTeams(st).length) { st.phase = 'steal'; st.answering = null; return st.phase; }
  return finishTile(st);
}
function stealTeams(st) {
  const t = st.tiles[st.cur];
  const tried = new Set(t.tries.map((x) => x.team));
  return st.teams.map((_, i) => i).filter((i) => !tried.has(i));
}
function finishTile(st) {
  st.tiles[st.cur].done = true; st.phase = 'result'; st.answering = null; st.running = false;
  return st.phase;
}
function backToBoard(st) {
  st.turn = (st.turn + 1) % st.teams.length;
  st.cur = null;
  st.phase = st.tiles.every((t) => t.done) ? 'end' : 'board';
}
function ranking(st) {
  return st.teams.map((t, i) => ({ ...t, i })).sort((a, b) => b.score - a.score);
}

if (typeof module !== 'undefined') {
  module.exports = { levelOf, normShort, sameShort, grade, award, newGame, submit, stealTeams, backToBoard, ranking };
}

/* ---------- giao diện ---------- */
if (typeof window !== 'undefined' && document.getElementById('game')) (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const root = $('#game');
  let cfg = null, byMa = new Map(), st = null, timerId = null, showSol = false, shownAt = 0;

  let hist = [];
  const save = () => { try { localStorage.setItem(KEY_STATE, JSON.stringify(st)); localStorage.setItem(KEY_HIST, JSON.stringify(hist)); } catch { } };
  // Ghi lại trạng thái trước mỗi thao tác làm đổi điểm, ô hay lượt; Hoàn tác lấy lại đúng trạng thái đó.
  const snap = () => { hist.push(JSON.stringify({ ...st, running: false })); if (hist.length > 50) hist.shift(); };
  function undo() {
    if (!hist.length) return;
    st = JSON.parse(hist.pop());
    draft = {}; showSol = false;
    draw();
  }
  const qOf = (t) => byMa.get(t.ma);
  const color = (i) => TEAM_COLORS[i % TEAM_COLORS.length];
  const strip = (html) => html.replace(/^<p>|<\/p>$/g, '');

  function fail(title, msg) {
    root.replaceChildren(h('div', { class: 'g-empty' }, h('h1', null, title), h('p', null, msg),
      h('a', { class: 'btn', href: '../#/tao-de' }, 'Về trang Tạo đề')));
  }

  async function start() {
    try { cfg = JSON.parse(localStorage.getItem(KEY_CFG) || 'null'); } catch { cfg = null; }
    if (!cfg || !cfg.items?.length) return fail('Chưa có trò chơi', 'Vào Tạo đề, chọn câu hỏi rồi bấm "Chơi trên lớp" để tạo trò chơi.');
    let D;
    try { D = await (await fetch('../data/cauhoi.json?v=' + Date.now())).json(); } catch (e) { return fail('Chưa tải được câu hỏi', String(e)); }
    byMa = new Map(D.cau_hoi.map((q) => [q.ma, q]));
    try { st = JSON.parse(localStorage.getItem(KEY_STATE) || 'null'); } catch { st = null; }
    if (!st || st.cfgId !== cfg.id || st.tiles.some((t) => !byMa.has(t.ma))) st = newGame(cfg, byMa);
    else { try { hist = JSON.parse(localStorage.getItem(KEY_HIST) || '[]'); } catch { hist = []; } }
    if (!st.tiles.length) return fail('Không có câu dùng được', 'Câu tự luận không đưa vào trò chơi. Hãy chọn câu trắc nghiệm, Đúng/Sai hoặc trả lời ngắn.');
    st.running = false;          // mở lại trang thì đồng hồ đứng, giáo viên bấm chạy tiếp
    draw();
  }

  /* đồng hồ */
  function tick() {
    if (!st.running) return;
    st.left = Math.max(0, st.left - 1);
    if (!st.left) st.running = false;
    save(); drawTimer();
  }
  function setTimer(run) { st.running = run && st.left > 0; clearInterval(timerId); if (st.running) timerId = setInterval(tick, 1000); drawTimer(); save(); }
  function drawTimer() {
    const el = $('#timer'); if (!el) return;
    const m = Math.floor(st.left / 60), s = st.left % 60;
    el.textContent = st.left ? `${m}:${String(s).padStart(2, '0')}` : 'Hết giờ';
    el.classList.toggle('low', st.left <= 10);
    el.classList.toggle('out', !st.left);
    const p = $('#pauseBtn'); if (p) { p.textContent = st.running ? 'Dừng' : 'Chạy tiếp'; p.disabled = !st.left; }
  }

  /* thanh điểm */
  function scoreBar() {
    return h('div', { class: 'g-teams' }, st.teams.map((t, i) => h('div', {
      class: 'g-team' + (st.phase !== 'end' && i === (st.answering ?? (st.phase === 'board' ? st.turn : -1)) ? ' on' : ''),
      style: '--c:' + color(i),
    }, h('span', { class: 'g-team-n' }, t.name), h('b', null, t.score))));
  }
  function topBar(extra) {
    const fs = h('button', { class: 'btn ghost sm', onclick: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); } }, 'Toàn màn hình');
    const un = h('button', { class: 'btn ghost sm', disabled: !hist.length, title: 'Quay lại trước thao tác vừa rồi (phím Ctrl+Z)', onclick: undo }, '↶ Hoàn tác');
    return h('div', { class: 'g-top' }, h('div', { class: 'g-title' }, cfg.ten || 'Bảng ô số'), h('span', { class: 'grow' }), un, extra || null, fs);
  }

  function draw() {
    clearInterval(timerId);
    if (st.phase === 'board') drawBoard();
    else if (st.phase === 'end') drawEnd();
    else drawQuestion();
    if (st.running) timerId = setInterval(tick, 1000);
    save();
  }

  /* màn hình bảng */
  function drawBoard() {
    const cols = Math.min(6, Math.ceil(Math.sqrt(st.tiles.length * 1.6))), rows = Math.ceil(st.tiles.length / cols);
    const grid = h('div', { class: 'g-grid', style: `--cols:${cols};--rows:${rows}` },
      st.tiles.map((t, i) => {
        const own = t.owner;
        return h('button', {
          class: 'g-tile' + (t.done ? ' done' : '') + (own != null ? ' own' : ''),
          style: own != null ? '--c:' + color(own) : null,
          disabled: t.done,
          'aria-label': t.done ? `Ô ${i + 1} đã chơi` : `Ô ${i + 1}, ${MUC_TEN[t.muc]}, ${t.pts} điểm`,
          onclick: () => openTile(i),
        }, h('span', { class: 'g-tile-n' }, i + 1),
        t.done ? h('span', { class: 'g-tile-s' }, own != null ? st.teams[own].name : '—')
          : h('span', { class: 'g-tile-s' }, `${t.pts} điểm · ${MUC_TEN[t.muc]}`));
      }));
    root.replaceChildren(
      topBar(h('button', { class: 'btn ghost sm', onclick: () => { if (confirm('Kết thúc trò chơi ngay và xem tổng kết?')) { snap(); st.phase = 'end'; draw(); } } }, 'Kết thúc sớm')),
      scoreBar(),
      h('div', { class: 'g-turn' }, 'Lượt chọn ô: ', h('b', { style: '--c:' + color(st.turn) }, st.teams[st.turn].name)),
      grid);
  }
  function openTile(i) {
    const t = st.tiles[i];
    snap();
    Object.assign(st, { cur: i, phase: 'q', answering: st.turn, left: t.time });
    showSol = false; draft = {};
    st.running = true;
    draw();
  }

  /* màn hình câu hỏi */
  let draft = {};
  function answerPad(q, t) {
    const team = st.answering;
    if (q.loai === 'TN4') {
      return h('div', { class: 'g-pad' }, 'ABCD'.split('').map((L) => h('button', {
        class: 'g-key' + (draft.v === L ? ' on' : ''), onclick: () => { draft.v = L; drawQuestion(); },
      }, L)));
    }
    if (q.loai === 'DS') {
      draft.v = draft.v || {};
      return h('div', { class: 'g-pad col' }, t.y.map((i) => h('div', { class: 'g-ds' },
        h('b', null, 'abcd'[i] + ')'),
        ['Đ', 'S'].map((v) => h('button', { class: 'g-key sm' + (draft.v[i] === v ? ' on' : ''), onclick: () => { draft.v[i] = v; drawQuestion(); } }, v === 'Đ' ? 'Đúng' : 'Sai')))));
    }
    const inp = h('input', { class: 'g-input', type: 'text', inputmode: 'decimal', placeholder: 'Đáp số đội đọc', value: draft.v || '', 'aria-label': 'Đáp số của đội ' + st.teams[team].name });
    inp.oninput = () => { draft.v = inp.value; const b = $('#commitBtn'); if (b) b.disabled = !inp.value.trim(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter') commit(q, t); };
    setTimeout(() => inp.focus(), 0);
    return h('div', { class: 'g-pad' }, inp);
  }
  function ready(q, t) {
    if (q.loai === 'DS') return t.y.every((i) => draft.v && draft.v[i]);
    return !!String(draft.v || '').trim();
  }
  function commit(q, t, skip) {
    if (!skip && !ready(q, t)) return;
    snap();
    submit(st, q, skip ? (q.loai === 'DS' ? {} : '') : draft.v);
    draft = {};
    draw();
  }
  function stemEl(q, t, reveal) {
    const b = h('div', { class: 'g-q-body' }, h('div', { html: renderRich(q.de) }));
    q.hinh.forEach((f) => b.append(figEl(f, '../')));
    if (q.loai === 'TN4') {
      const long = Math.max(...q.choices.map((c) => c.length));
      b.append(h('div', { class: 'choices ' + (long < 14 ? 'c4' : long < 60 ? '' : 'c1') }, q.choices.map((c, i) => h('div', {
        class: 'opt' + (reveal ? (q.dap_an === 'ABCD'[i] ? ' ok show' : ' show') : ''),
      }, h('b', null, 'ABCD'[i] + '.'), h('span', { html: strip(renderRich(c)) })))));
    }
    if (q.loai === 'DS') {
      b.append(h('div', { class: 'choices c1' }, t.y.map((i) => h('div', {
        class: 'opt' + (reveal ? (q.dap_an[i] === 'Đ' ? ' ok show' : ' no show') : ''),
      }, h('b', null, 'abcd'[i] + ')'), h('span', { html: strip(renderRich(q.tf[i])) }),
      reveal ? h('b', { class: 'g-ds-ans' }, q.dap_an[i] === 'Đ' ? 'Đúng' : 'Sai') : null))));
    }
    return b;
  }
  function triesEl(t) {
    if (!t.tries.length) return null;
    const show = (q, a) => q.loai === 'DS' ? t.y.map((i) => 'abcd'[i] + ') ' + (a[i] || '–')).join('  ') : (a || '(không trả lời)');
    const q = qOf(t);
    return h('div', { class: 'g-tries' }, t.tries.map((x) => h('div', { class: 'g-try', style: '--c:' + color(x.team) },
      h('b', null, st.teams[x.team].name), h('span', null, show(q, x.ans)),
      h('span', { class: 'g-try-r ' + (x.ratio === 1 ? 'ok' : x.ratio > 0 ? 'part' : 'no') },
        x.ratio === 1 ? 'Đúng' : x.ratio > 0 ? `Đúng ${Math.round(x.ratio * t.y.length)}/${t.y.length} ý` : 'Chưa đúng'),
      h('b', { class: 'g-try-p' }, '+' + x.pts))));
  }
  function solutionEl(q) {
    const lg = h('div', { class: 'g-sol' }, h('h3', null, 'Lời giải'), h('div', { html: renderRich(q.loigiai || 'Kho chưa có lời giải cho câu này.') }));
    q.hinh_lg.forEach((f) => lg.append(figEl(f, '../')));
    return lg;
  }
  function correctText(q, t) {
    if (q.loai === 'DS') return t.y.map((i) => 'abcd'[i] + ') ' + (q.dap_an[i] === 'Đ' ? 'Đúng' : 'Sai')).join('   ');
    return q.loai === 'TLN' ? (q.tln || q.dap_an) : q.dap_an;
  }
  function drawQuestion() {
    const t = st.tiles[st.cur], q = qOf(t);
    const reveal = st.phase === 'result';
    const head = h('div', { class: 'g-q-head' },
      h('span', { class: 'tag k' }, 'Ô ' + (st.cur + 1)),
      h('span', { class: 'tag' }, MUC_TEN[t.muc]),
      h('span', { class: 'tag y' }, t.pts + ' điểm'),
      q.loai === 'DS' && t.y.length < 4 ? h('span', { class: 'tag' }, `Hỏi ${t.y.length} ý`) : null,
      h('span', { class: 'grow' }),
      st.phase === 'q' ? [
        h('div', { id: 'timer', class: 'g-timer' }),
        h('button', { id: 'pauseBtn', class: 'btn ghost sm', onclick: () => setTimer(!st.running) }, 'Dừng'),
        h('button', { class: 'btn ghost sm', onclick: () => { st.left += 30; setTimer(true); } }, '+30s'),
      ] : null);

    const side = h('aside', { class: 'g-side' });
    if (st.phase === 'q' || (st.phase === 'steal' && st.answering != null)) {
      const team = st.answering;
      side.append(
        h('div', { class: 'g-who', style: '--c:' + color(team) }, st.phase === 'steal' ? 'Giành quyền: ' : 'Đội trả lời: ', h('b', null, st.teams[team].name)),
        answerPad(q, t),
        h('div', { class: 'g-actions' },
          h('button', { id: 'commitBtn', class: 'btn', disabled: !ready(q, t), onclick: () => commit(q, t) }, 'Chốt câu trả lời'),
          h('button', { class: 'btn ghost', onclick: () => commit(q, t, true) }, 'Không trả lời được')));
    } else if (st.phase === 'steal') {
      side.append(h('div', { class: 'g-who' }, 'Đội nào giơ tay trước?'),
        h('div', { class: 'g-pad col' }, stealTeams(st).map((i) => h('button', {
          class: 'g-key wide', style: '--c:' + color(i), onclick: () => { if (Date.now() - shownAt < 600) return; snap(); st.answering = i; draft = {}; draw(); },
        }, st.teams[i].name))),
        h('button', { class: 'btn ghost', onclick: () => { snap(); finishTile(st); draw(); } }, 'Không đội nào'));
    } else {
      const own = t.owner;
      side.append(
        h('div', { class: 'g-who', style: own != null ? '--c:' + color(own) : null }, own != null ? h('span', null, 'Ô thuộc về ', h('b', null, st.teams[own].name)) : 'Không đội nào chiếm được ô'),
        h('div', { class: 'g-key-ans' }, h('small', null, 'Đáp án'), h('div', null, correctText(q, t))),
        h('div', { class: 'g-actions' },
          h('button', { class: 'btn ghost', onclick: () => { showSol = !showSol; drawQuestion(); } }, showSol ? 'Ẩn lời giải' : 'Xem lời giải'),
          h('button', { class: 'btn', onclick: () => { snap(); backToBoard(st); draw(); } }, st.tiles.every((x) => x.done) ? 'Xem tổng kết' : 'Về bảng')));
    }
    side.append(triesEl(t) || '');

    const main = h('section', { class: 'g-q' }, head, stemEl(q, t, reveal), reveal && showSol ? solutionEl(q) : null);
    root.replaceChildren(topBar(), scoreBar(), h('div', { class: 'g-q-wrap' }, main, side));
    shownAt = Date.now();
    drawTimer();
    save();
  }

  /* màn hình tổng kết */
  function drawEnd() {
    const rank = ranking(st);
    const wrong = st.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.tries.some((x) => x.ratio < 1) || (t.done && t.owner == null));
    const board = h('div', { class: 'g-rank' }, rank.map((t, k) => h('div', { class: 'g-rank-row', style: '--c:' + color(t.i) },
      h('span', { class: 'g-rank-k' }, k === 0 || t.score !== rank[k - 1].score ? (rank.findIndex((x) => x.score === t.score) + 1) : ''),
      h('span', { class: 'grow' }, t.name), h('b', null, t.score + ' điểm'))));
    const list = h('div', { class: 'g-wrong' });
    const solBox = h('div');
    if (!wrong.length) list.append(h('p', { class: 'muted' }, 'Không có câu nào bị trả lời sai.'));
    wrong.forEach(({ t, i }) => {
      const q = qOf(t);
      const nSai = t.tries.filter((x) => x.ratio < 1).length;
      list.append(h('button', {
        class: 'g-wrong-item', onclick: () => {
          solBox.replaceChildren(h('div', { class: 'g-q' }, h('div', { class: 'g-q-head' }, h('span', { class: 'tag k' }, 'Ô ' + (i + 1)), h('span', { class: 'tag' }, MUC_TEN[t.muc])),
            stemEl(q, t, true), h('div', { class: 'g-key-ans' }, h('small', null, 'Đáp án'), h('div', null, correctText(q, t))), solutionEl(q)));
          solBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, h('b', null, 'Ô ' + (i + 1)), h('span', { class: 'grow' }, plain(q.de).slice(0, 80) + '…'),
      h('span', { class: 'tag' }, nSai ? `${nSai} lượt sai` : 'Bỏ qua')));
    });
    root.replaceChildren(
      topBar(h('button', { class: 'btn ghost sm', onclick: () => { if (confirm('Chơi lại từ đầu với cùng bộ câu hỏi?')) { st = newGame(cfg, byMa); hist = []; draw(); } } }, 'Chơi lại')),
      h('div', { class: 'g-end' },
        h('section', null, h('h2', null, 'Bảng xếp hạng'), board),
        h('section', null, h('h2', null, 'Câu cần chữa'), h('p', { class: 'muted small' }, 'Bấm vào một câu để hiện đề, đáp án và lời giải.'), list)),
      solBox);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target.tagName !== 'INPUT') { e.preventDefault(); undo(); return; }
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ' && st?.phase === 'q') { e.preventDefault(); setTimer(!st.running); }
  });
  start();
})();
