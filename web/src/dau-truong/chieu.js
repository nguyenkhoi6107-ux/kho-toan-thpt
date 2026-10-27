'use strict';
/* ToánKho — Đấu Trường, màn hình chiếu của giáo viên.
   Máy này giữ đáp án và chấm. Điện thoại học sinh chỉ nhận đề (xem ket-noi.js).

   Điểm mỗi câu (giữ luật Đấu Trường cũ):
     đúng hoàn toàn: 600 + thưởng tốc độ (tối đa 400) + thưởng chuỗi (50 × số câu đúng liên tiếp, tối đa 300)
     câu Đúng/Sai đúng một phần: (600 + thưởng tốc độ) × (số ý đúng ÷ số ý được hỏi), không có thưởng chuỗi, chuỗi về 0
     ⚡ nhân đôi điểm câu đó. Sai, hết giờ: 0 điểm, chuỗi về 0. */

const KEY_CFG = 'toankho.dautruong.v1';
const KEY_HOST = 'toankho.dautruong.host.v1';

/* ---------- phần tính toán ---------- */
function speedFrac(ms, durMs) { return Math.max(0, Math.min(1, 1 - (ms || 0) / Math.max(1, durMs))); }
function scoreAnswer(ratio, ms, durMs, streakBefore, x2) {
  let pts = 0, streak = 0;
  if (ratio > 0) pts = ratio * (600 + 400 * speedFrac(ms, durMs));
  if (ratio === 1) { streak = streakBefore + 1; pts += Math.min(streak * 50, 300); }
  pts = Math.round(pts) * (x2 ? 2 : 1);
  return { pts, streak };
}
// Đề gửi xuống điện thoại: không có mã câu, không có đáp án, không có lời giải.
function phonePayload(q, y) {
  const p = { loai: q.loai, de: q.de, hinh: q.hinh.map((f) => f.svg).filter(Boolean) };
  if (q.loai === 'TN4') p.choices = q.choices;
  if (q.loai === 'DS') p.tf = y.map((i) => ({ i, t: q.tf[i] }));
  return p;
}
// Đáp án công bố sau khi hết giờ.
function keyPayload(q, y) {
  const k = { loigiai: q.loigiai || '', hinh_lg: q.hinh_lg.map((f) => f.svg).filter(Boolean) };
  if (q.loai === 'TN4') k.dap_an = q.dap_an;
  if (q.loai === 'TLN') k.dap_an = q.tln || q.dap_an;
  if (q.loai === 'DS') { k.dap_an = {}; y.forEach((i) => { k.dap_an[i] = q.dap_an[i]; }); }
  return k;
}
function buildItems(cfg, byMa) {
  const out = [];
  for (const it of cfg.items) {
    const q = byMa.get(it.ma);
    if (!q || q.loai === 'TL') continue;
    const y = q.loai === 'DS' ? (it.y && it.y.length ? it.y.slice().sort() : [0, 1, 2, 3]) : null;
    const muc = levelOf(q, y);
    out.push({ ma: q.ma, y, muc, time: cfg.giay[muc] });
  }
  return out;
}
function newRoomCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function sortedPlayers(H) {
  return Object.entries(H.players).map(([pid, p]) => ({ pid, ...p }))
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.joined - b.joined);
}

/* ---------- giao diện ---------- */
if (typeof window !== 'undefined' && document.getElementById('host')) (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const root = $('#host');
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  const strip = (html) => html.replace(/^<p>|<\/p>$/g, '');
  let cfg = null, byMa = new Map(), items = [], H = null, net = null, online = false;
  let tickId = null, beatId = null, allTimer = null, showSol = false, prevRanks = new Map();

  const save = () => { try { localStorage.setItem(KEY_HOST, JSON.stringify(H)); } catch { } };
  const item = () => items[H.idx];
  const qOf = (it) => byMa.get(it.ma);
  const ansOf = (idx) => (H.ans[idx] ||= {});

  function fail(title, msg) {
    root.replaceChildren(h('div', { class: 'g-empty' }, h('h1', null, title), h('p', null, msg), h('a', { class: 'btn', href: '../#/tao-de' }, 'Về trang Tạo đề')));
  }

  async function start() {
    try { cfg = JSON.parse(localStorage.getItem(KEY_CFG) || 'null'); } catch { cfg = null; }
    if (!cfg || !cfg.items?.length) return fail('Chưa có trận đấu', 'Vào Tạo đề, chọn câu rồi bấm "Trò chơi trên lớp", chọn Đấu Trường.');
    let D;
    try { D = await (await fetch('../data/cauhoi.json?v=' + Date.now())).json(); } catch (e) { return fail('Chưa tải được câu hỏi', String(e)); }
    byMa = new Map(D.cau_hoi.map((q) => [q.ma, q]));
    items = buildItems(cfg, byMa);
    if (!items.length) return fail('Không có câu dùng được', 'Câu tự luận không đưa vào Đấu Trường.');
    try { H = JSON.parse(localStorage.getItem(KEY_HOST) || 'null'); } catch { H = null; }
    if (!H || H.cfgId !== cfg.id) H = { cfgId: cfg.id, room: newRoomCode(), round: 1, phase: 'lobby', idx: -1, deadline: 0, dur: 0, players: {}, ans: {} };
    connect();
    render();
  }

  /* ---------- mạng ---------- */
  function connect() {
    net?.end();
    net = dtConnect(H.room, ['/p/+', '/a/+', '/h/+'], onMsg, (ok) => {
      online = ok; const el = $('#conn'); if (el) { el.textContent = ok ? 'Đã kết nối' : 'Mất kết nối, đang thử lại…'; el.classList.toggle('ok', ok); }
      if (ok) { publishCtl(); publishBoard(); }
    });
  }
  function ctlMsg() {
    const c = { round: H.round, phase: H.phase, idx: H.idx, n: items.length, t: Date.now() };
    if (H.phase === 'question' || H.phase === 'reveal') {
      const it = item(), q = qOf(it);
      c.q = phonePayload(q, it.y); c.muc = MUC_TEN[it.muc];
      if (H.phase === 'question') { c.remaining = Math.max(0, H.deadline - Date.now()); c.dur = H.dur; }
      else c.key = keyPayload(q, it.y);
    }
    return c;
  }
  function publishCtl() { net?.pub('/ctl', ctlMsg(), true); save(); }
  function publishBoard() {
    const list = sortedPlayers(H).map((p) => ({ pid: p.pid, name: p.name, score: p.score, correct: p.correct, last: p.last, lastRatio: p.lastRatio, x2: p.x2, p5050: p.p5050 }));
    net?.pub('/bxh', { round: H.round, idx: H.idx, phase: H.phase, list }, true);
  }
  function onMsg(sub, d) {
    const [kind, pid] = sub.split('/').filter(Boolean);
    if (!pid || d.pid !== pid) return;
    if (kind === 'p') {
      const name = String(d.name || '').trim().slice(0, 32); if (!name) return;
      const p = H.players[pid];
      if (!p) H.players[pid] = { name, joined: Date.now(), score: 0, correct: 0, streak: 0, last: 0, lastRatio: null, x2: 1, p5050: 1 };
      else p.name = name;
      save(); publishBoard(); refreshLive();
    } else if (kind === 'a') onAnswer(pid, d);
    else if (kind === 'h') onHelp(pid, d);
  }
  function onAnswer(pid, d) {
    const p = H.players[pid];
    if (!p || d.round !== H.round || d.idx !== H.idx) return;
    net.pub('/k/' + pid, { round: H.round, idx: H.idx });      // xác nhận, kể cả khi gửi lại
    if (H.phase !== 'question' || ansOf(H.idx)[pid]) return;
    const it = item(), q = qOf(it);
    const ratio = grade(q, d.ans, it.y);
    const x2 = !!d.x2 && p.x2 > 0;
    if (x2) p.x2--;
    const ms = Math.min(Number(d.ms) || 0, H.dur);
    const r = scoreAnswer(ratio, ms, H.dur, p.streak, x2);
    ansOf(H.idx)[pid] = { ans: d.ans, ratio, pts: r.pts, ms, x2 };
    save(); refreshLive();
    const total = Object.keys(H.players).length, n = Object.keys(ansOf(H.idx)).length;
    if (total && n >= total && !allTimer) allTimer = setTimeout(() => { allTimer = null; if (H.phase === 'question') reveal(); }, 1200);
  }
  function onHelp(pid, d) {
    const p = H.players[pid];
    if (!p || d.round !== H.round || d.idx !== H.idx || H.phase !== 'question') return;
    const it = item(), q = qOf(it);
    if (q.loai !== 'TN4' || p.p5050 <= 0 || ansOf(H.idx)[pid]) return;
    p.p5050--;
    const wrong = [0, 1, 2, 3].filter((i) => 'ABCD'[i] !== q.dap_an).sort(() => Math.random() - 0.5).slice(0, 2);
    net.pub('/x/' + pid, { round: H.round, idx: H.idx, hide: wrong }, true);
    save();
  }

  /* ---------- điều khiển ---------- */
  function goQuestion(i) {
    prevRanks = new Map(sortedPlayers(H).map((p, r) => [p.pid, r + 1]));
    const it = items[i];
    Object.assign(H, { phase: 'question', idx: i, dur: it.time * 1000, deadline: Date.now() + it.time * 1000 });
    showSol = false; publishCtl(); render();
  }
  function addTime() { H.deadline += 30000; H.dur += 30000; publishCtl(); }
  function reveal() {
    if (H.phase !== 'question') return;
    clearTimeout(allTimer); allTimer = null;
    const got = ansOf(H.idx);
    for (const [pid, p] of Object.entries(H.players)) {
      const a = got[pid];
      if (a) {
        const r = scoreAnswer(a.ratio, a.ms, H.dur, p.streak, a.x2);   // tính lại theo thời lượng cuối (nếu đã +30s)
        a.pts = r.pts; p.streak = r.streak; p.score += r.pts; p.last = r.pts; p.lastRatio = a.ratio;
        if (a.ratio === 1) p.correct++;
      } else { p.streak = 0; p.last = 0; p.lastRatio = null; }
    }
    H.phase = 'reveal'; publishCtl(); publishBoard(); render();
  }
  function board() { H.phase = 'board'; publishCtl(); publishBoard(); render(); }
  function next() { if (H.idx + 1 < items.length) goQuestion(H.idx + 1); else { H.phase = 'end'; publishCtl(); publishBoard(); render(); } }
  function endEarly() { if (!confirm('Kết thúc trận đấu và xem kết quả chung cuộc?')) return; if (H.phase === 'question') reveal(); H.phase = 'end'; if (H.idx < 0) H.idx = 0; publishCtl(); publishBoard(); render(); }
  function newRound() {
    if (!confirm('Bắt đầu vòng mới? Điểm vòng này sẽ về 0, học sinh không cần vào lại phòng.')) return;
    for (const p of Object.values(H.players)) Object.assign(p, { score: 0, correct: 0, streak: 0, last: 0, lastRatio: null, x2: 1, p5050: 1 });
    Object.assign(H, { round: H.round + 1, phase: 'lobby', idx: -1, ans: {} });
    publishCtl(); publishBoard(); render();
  }
  function newRoom() {
    if (!confirm('Tạo phòng mới với mã khác? Học sinh phải quét mã mới.')) return;
    H = { cfgId: cfg.id, room: newRoomCode(), round: 1, phase: 'lobby', idx: -1, deadline: 0, dur: 0, players: {}, ans: {} };
    connect(); render();
  }
  function exportCSV() {
    let csv = 'Hạng,Họ tên,Số câu đúng,Tổng điểm\n';
    sortedPlayers(H).forEach((p, i) => { csv += `${i + 1},"${String(p.name).replace(/"/g, '""')}",${p.correct},${p.score}\n`; });
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), download: `Dau_truong_phong_${H.room}_vong_${H.round}.csv` });
    document.body.append(a); a.click(); a.remove();
  }

  /* ---------- vẽ ---------- */
  function joinUrl() { return new URL('./?room=' + H.room, location.href).href; }
  function topBar(extra) {
    const fs = h('button', { class: 'btn ghost sm', onclick: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); } }, 'Toàn màn hình');
    return h('div', { class: 'g-top' }, h('div', { class: 'g-title' }, cfg.ten || 'Đấu Trường'),
      h('span', { class: 'tag' }, 'Phòng ' + H.room), H.round > 1 ? h('span', { class: 'tag' }, 'Vòng ' + H.round) : null,
      h('span', { id: 'conn', class: 'conn' + (online ? ' ok' : '') }, online ? 'Đã kết nối' : 'Đang kết nối…'),
      h('span', { class: 'grow' }), extra || null,
      H.phase !== 'lobby' && H.phase !== 'end' ? h('button', { class: 'btn ghost sm', onclick: endEarly }, 'Kết thúc sớm') : null, fs);
  }
  function render() {
    clearInterval(tickId); clearInterval(beatId);
    if (H.phase === 'lobby') drawLobby();
    else if (H.phase === 'question' || H.phase === 'reveal') drawStage();
    else drawBoard();
    if (H.phase === 'question') {
      beatId = setInterval(publishCtl, 1000);      // đồng bộ đồng hồ cho em vào muộn hoặc vừa có mạng lại
      tickId = setInterval(tick, 250); tick();
    }
    save();
  }
  function refreshLive() {
    if (H.phase === 'lobby') { drawLobby(); return; }
    const a = $('#answered'); if (a) a.textContent = `${Object.keys(ansOf(H.idx)).length}/${Object.keys(H.players).length} đã trả lời`;
  }
  function tick() {
    const left = Math.max(0, H.deadline - Date.now()), s = Math.ceil(left / 1000);
    const el = $('#timer'); if (el) { el.textContent = s + 's'; el.classList.toggle('low', s <= 5); }
    if (left <= 0) reveal();
  }

  function drawLobby() {
    const qr = qrcode(0, 'M'); qr.addData(joinUrl()); qr.make();
    const ps = sortedPlayers(H).sort((a, b) => a.joined - b.joined);
    root.replaceChildren(topBar(),
      h('div', { class: 'dt-lobby' },
        h('div', { class: 'dt-qr' }, h('div', { html: qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }) }),
          h('div', { class: 'dt-pin' }, h('small', null, 'Mã phòng'), h('b', null, H.room)),
          h('div', { class: 'dt-link' }, joinUrl())),
        h('div', { class: 'dt-players' },
          h('h2', null, `${ps.length} người đã vào`),
          h('p', { class: 'muted' }, `Trận đấu gồm ${items.length} câu. Học sinh quét mã QR bằng điện thoại, nhập họ tên rồi chờ.`),
          h('div', { class: 'dt-chips' }, ps.length ? ps.map((p) => h('span', { class: 'chip' }, p.name)) : h('span', { class: 'muted' }, 'Đang chờ học sinh vào phòng…')),
          h('div', { class: 'row', style: 'margin-top:18px' },
            h('button', { class: 'btn big', onclick: () => { if (!ps.length && !confirm('Chưa có ai vào phòng. Vẫn bắt đầu?')) return; goQuestion(0); } }, 'Bắt đầu'),
            h('button', { class: 'btn ghost', onclick: newRoom }, 'Tạo phòng mới')))));
  }

  function stemEl(q, it, reveal, counts) {
    const b = h('div', { class: 'g-q-body' }, h('div', { html: renderRich(q.de) }));
    q.hinh.forEach((f) => b.append(figEl(f, '../')));
    if (q.loai === 'TN4') {
      const long = Math.max(...q.choices.map((c) => c.length));
      b.append(h('div', { class: 'choices ' + (long < 14 ? 'c4' : long < 60 ? '' : 'c1') }, q.choices.map((c, i) => h('div', {
        class: 'opt' + (reveal ? (q.dap_an === 'ABCD'[i] ? ' ok show' : ' dim') : ''),
      }, h('b', null, 'ABCD'[i] + '.'), h('span', { html: strip(renderRich(c)) }), counts ? h('span', { class: 'dt-cnt' }, counts['ABCD'[i]] || 0) : null))));
    }
    if (q.loai === 'DS') {
      b.append(h('div', { class: 'choices c1' }, it.y.map((i) => h('div', {
        class: 'opt' + (reveal ? (q.dap_an[i] === 'Đ' ? ' ok show' : ' no show') : ''),
      }, h('b', null, 'abcd'[i] + ')'), h('span', { html: strip(renderRich(q.tf[i])) }),
      reveal ? h('b', { class: 'dt-cnt' }, (q.dap_an[i] === 'Đ' ? 'Đúng' : 'Sai') + (counts ? ` · ${counts[i] || 0} em đúng` : '')) : null))));
    }
    if (q.loai === 'TLN' && reveal) b.append(h('div', { class: 'g-key-ans' }, h('small', null, 'Đáp số'), h('div', null, q.tln || q.dap_an)));
    return b;
  }
  function solutionEl(q) {
    const lg = h('div', { class: 'g-sol' }, h('h3', null, 'Lời giải'), h('div', { html: renderRich(q.loigiai || 'Kho chưa có lời giải cho câu này.') }));
    q.hinh_lg.forEach((f) => lg.append(figEl(f, '../')));
    return lg;
  }
  function drawStage() {
    const it = item(), q = qOf(it), rev = H.phase === 'reveal';
    const got = Object.values(ansOf(H.idx));
    let counts = null, summary = null;
    if (rev) {
      counts = {};
      if (q.loai === 'TN4') got.forEach((a) => { counts[a.ans] = (counts[a.ans] || 0) + 1; });
      if (q.loai === 'DS') got.forEach((a) => it.y.forEach((i) => { if (a.ans && a.ans[i] === q.dap_an[i]) counts[i] = (counts[i] || 0) + 1; }));
      const full = got.filter((a) => a.ratio === 1).length, part = got.filter((a) => a.ratio > 0 && a.ratio < 1).length;
      const none = Object.keys(H.players).length - got.length;
      summary = h('div', { class: 'dt-sum' }, h('span', { class: 'ok' }, `✅ ${full} đúng`), part ? h('span', { class: 'part' }, `◐ ${part} đúng một phần`) : null,
        h('span', { class: 'no' }, `❌ ${got.length - full - part} sai`), h('span', null, `⏰ ${none} chưa trả lời`));
    }
    const head = h('div', { class: 'g-q-head' },
      h('span', { class: 'tag k' }, `Câu ${H.idx + 1}/${items.length}`), h('span', { class: 'tag' }, MUC_TEN[it.muc]),
      q.loai === 'DS' && it.y.length < 4 ? h('span', { class: 'tag' }, `Hỏi ${it.y.length} ý`) : null,
      h('span', { class: 'grow' }),
      rev ? null : [h('span', { id: 'answered', class: 'dt-answered' }), h('div', { id: 'timer', class: 'g-timer' }),
        h('button', { class: 'btn ghost sm', onclick: addTime }, '+30s'), h('button', { class: 'btn sm', onclick: reveal }, 'Công bố ngay')]);
    const foot = rev ? h('div', { class: 'row', style: 'margin-top:14px' },
      h('button', { class: 'btn ghost', onclick: () => { showSol = !showSol; drawStage(); } }, showSol ? 'Ẩn lời giải' : 'Xem lời giải'),
      h('span', { class: 'grow' }), h('button', { class: 'btn big', onclick: board }, 'Bảng xếp hạng ➔')) : null;
    root.replaceChildren(topBar(), h('section', { class: 'g-q' }, head, stemEl(q, it, rev, counts), summary, rev && showSol ? solutionEl(q) : null, foot));
    refreshLive();
  }

  function drawBoard() {
    const list = sortedPlayers(H), end = H.phase === 'end';
    const rows = (end ? list : list.slice(0, 10)).map((p, i) => {
      const before = prevRanks.get(p.pid), diff = before ? before - (i + 1) : 0;
      return h('tr', null, h('td', null, h('span', { class: 'dt-rank' + (i < 3 ? ' r' + (i + 1) : '') }, i + 1)),
        h('td', null, h('b', null, p.name), !end && diff > 0 ? h('span', { class: 'up' }, ` ▲${diff}`) : !end && diff < 0 ? h('span', { class: 'down' }, ` ▼${-diff}`) : null),
        h('td', null, `${p.correct}/${H.idx + 1}`), h('td', { class: 'dt-last' }, p.last > 0 ? '+' + fmt(p.last) : '–'), h('td', { class: 'dt-score' }, fmt(p.score)));
    });
    const table = h('table', { class: 'dt-table' }, h('tr', null, ['#', 'Họ tên', 'Đúng', 'Câu vừa rồi', 'Tổng điểm'].map((t) => h('th', null, t))), rows.length ? rows : h('tr', null, h('td', { colspan: 5, class: 'muted' }, 'Chưa có người chơi.')));
    const kids = [topBar(end ? h('button', { class: 'btn ghost sm', onclick: exportCSV }, 'Tải bảng điểm (CSV)') : null)];
    if (end && list.length) {
      const slot = (r, cls) => list[r] ? h('div', { class: 'dt-pod ' + cls }, h('div', { class: 'dt-medal' }, ['🥇', '🥈', '🥉'][r]), h('b', null, list[r].name), h('div', null, fmt(list[r].score))) : h('div');
      kids.push(h('div', { class: 'dt-podium' }, slot(1, 'p2'), slot(0, 'p1'), slot(2, 'p3')));
    }
    kids.push(h('h2', { style: 'margin:10px 0' }, end ? 'Kết quả chung cuộc' : `Bảng xếp hạng sau câu ${H.idx + 1}/${items.length}`), table);
    if (!end) kids.push(h('div', { class: 'row', style: 'margin-top:16px;justify-content:flex-end' }, h('button', { class: 'btn big', onclick: next }, H.idx + 1 < items.length ? 'Câu tiếp theo ➔' : 'Xem kết quả chung cuộc')));
    else {
      // Câu cần chữa: xếp theo tỉ lệ đúng tăng dần
      const nP = Object.keys(H.players).length || 1;
      const stat = items.map((it, i) => ({ it, i, ok: Object.values(H.ans[i] || {}).filter((a) => a.ratio === 1).length })).filter((s) => s.i <= H.idx).sort((a, b) => a.ok - b.ok);
      const solBox = h('div');
      kids.push(h('h2', { style: 'margin:22px 0 6px' }, 'Câu cần chữa'), h('p', { class: 'muted small' }, 'Xếp từ câu ít em đúng nhất. Bấm vào câu để hiện đề, đáp án và lời giải.'),
        h('div', { class: 'g-wrong' }, stat.map(({ it, i, ok }) => h('button', { class: 'g-wrong-item', onclick: () => {
          const q = qOf(it);
          solBox.replaceChildren(h('section', { class: 'g-q' }, h('div', { class: 'g-q-head' }, h('span', { class: 'tag k' }, 'Câu ' + (i + 1)), h('span', { class: 'tag' }, MUC_TEN[it.muc])), stemEl(q, it, true, null), solutionEl(q)));
          solBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } }, h('b', null, 'Câu ' + (i + 1)), h('span', { class: 'grow' }, plain(qOf(it).de).slice(0, 80) + '…'), h('span', { class: 'tag' }, `${Math.round(100 * ok / nP)}% đúng`)))),
        solBox,
        h('div', { class: 'row', style: 'margin-top:16px' }, h('button', { class: 'btn', onclick: newRound }, 'Vòng mới (cùng phòng)')));
    }
    root.replaceChildren(...kids);
  }

  start();
})();
