'use strict';
/* ToánKho — Đấu Trường, trang học sinh trên điện thoại.
   Trang này không tải kho câu hỏi và không có đáp án: chỉ hiện đề máy chiếu gửi xuống,
   gửi câu trả lời lên, rồi nhận kết quả sau khi máy chiếu công bố. */

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const root = $('#play');
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  const strip = (html) => html.replace(/^<p>|<\/p>$/g, '');
  const params = new URLSearchParams(location.search);
  let room = (params.get('room') || '').replace(/\D/g, '');
  let net = null, online = false, ctl = null, bxh = null, P = null;
  let viewKey = '', draft = {}, x2On = false, hide = null, tickId = null, resendId = null, showSol = false;

  const pKey = () => 'toankho.dt.player.' + room;
  const saveP = () => { try { localStorage.setItem(pKey(), JSON.stringify(P)); } catch { } };
  const loadP = () => { try { return JSON.parse(localStorage.getItem(pKey()) || 'null'); } catch { return null; } };
  const qKey = () => ctl ? `${ctl.round}:${ctl.idx}` : '';
  const sameRound = () => !!(bxh && ctl && bxh.round === ctl.round);
  const me = () => sameRound() ? bxh.list.find((p) => p.pid === P.pid) : null;
  const sent = () => P.sent[qKey()];

  /* ---------- vào phòng ---------- */
  function drawJoin(msg) {
    const name = h('input', { class: 'input', type: 'text', maxlength: 32, placeholder: 'VD: Nguyễn Văn A', autocomplete: 'name', value: P?.name || '' });
    const pin = h('input', { class: 'input', type: 'text', inputmode: 'numeric', maxlength: 6, placeholder: 'Mã 6 số trên màn hình', value: room });
    const go = () => {
      const n = name.value.trim(), r = pin.value.replace(/\D/g, '');
      if (!n) return drawJoin('Vui lòng nhập họ tên.');
      if (r.length !== 6) return drawJoin('Mã phòng gồm 6 chữ số.');
      if (r !== room) { room = r; history.replaceState(null, '', '?room=' + room); }
      P = loadP() || { pid: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), sent: {}, seen: {} };
      P.name = n; saveP();
      connect();
      draw();
    };
    name.onkeydown = pin.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    root.replaceChildren(h('div', { class: 'card' },
      h('h1', null, 'Đấu Trường Toán'),
      h('label', { class: 'lbl' }, 'Họ và tên', name),
      room ? null : h('label', { class: 'lbl' }, 'Mã phòng', pin),
      msg ? h('div', { class: 'msg' }, msg) : null,
      h('button', { class: 'btn wide', onclick: go }, 'Vào phòng'),
      h('div', { class: 'rules' }, h('b', null, 'Cách tính điểm'), h('ul', null,
        h('li', null, 'Cả lớp làm cùng một câu, trong cùng thời gian.'),
        h('li', null, 'Đúng: 600 điểm + thưởng tốc độ (tối đa 400) + thưởng chuỗi câu đúng liên tiếp (tối đa 300).'),
        h('li', null, 'Câu Đúng/Sai: đúng bao nhiêu ý được bấy nhiêu phần điểm.'),
        h('li', null, 'Trợ giúp, mỗi loại 1 lần: ⚡ nhân đôi điểm câu đang làm, 🎯 loại 2 phương án sai.')))));
    setTimeout(() => (name.value ? pin : name).focus(), 0);
  }

  /* ---------- mạng ---------- */
  function connect() {
    net?.end();
    net = dtConnect(room, ['/ctl', '/bxh', '/k/' + P.pid, '/x/' + P.pid], onMsg, (ok) => {
      online = ok; drawConn();
      if (ok) { net.pub('/p/' + P.pid, { pid: P.pid, name: P.name }, true); resend(); }
    });
  }
  function onMsg(sub, d) {
    if (sub === '/ctl') {
      const prev = viewKey; ctl = d;
      if (d.phase === 'question') {
        P.seen[qKey()] ||= Date.now();                     // lúc em này thấy câu hỏi: tính thưởng tốc độ từ đây
        P.deadline = Date.now() + (d.remaining || 0); saveP();
      }
      const k = `${d.round}:${d.idx}:${d.phase}`;
      if (k !== prev) { viewKey = k; if (!prev.startsWith(`${d.round}:${d.idx}:`)) { draft = {}; x2On = false; hide = null; showSol = false; } draw(); }
    } else if (sub === '/bxh') {
      bxh = d;
      if (!ctl || ctl.phase !== 'question') draw(); else drawHud();
    } else if (sub === '/k/' + P.pid) {
      const s = P.sent[`${d.round}:${d.idx}`]; if (s && !s.ok) { s.ok = true; saveP(); drawStatus(); }
    } else if (sub === '/x/' + P.pid) {
      if (ctl && d.round === ctl.round && d.idx === ctl.idx) { hide = d.hide; if (ctl.phase === 'question' && !sent()) draw(); }
    }
  }
  // Gửi lại câu trả lời chưa được máy chiếu xác nhận (sóng 4G chập chờn).
  function resend() {
    const s = sent();
    if (s && !s.ok && ctl?.phase === 'question') net.pub('/a/' + P.pid, { pid: P.pid, round: ctl.round, idx: ctl.idx, ans: s.ans, ms: s.ms, x2: s.x2 });
  }

  /* ---------- trả lời ---------- */
  function submit(ans) {
    if (!ctl || ctl.phase !== 'question' || sent() || Date.now() > P.deadline) return;
    const ms = Date.now() - (P.seen[qKey()] || Date.now());
    P.sent[qKey()] = { ans, ms, x2: x2On, ok: false }; saveP();
    resend();
    draw();
  }
  function askHelp() {
    const m = me(); if (!m || m.p5050 <= 0 || hide) return;
    net.pub('/h/' + P.pid, { pid: P.pid, round: ctl.round, idx: ctl.idx });
    const b = $('#help'); if (b) { b.disabled = true; b.textContent = '🎯 Đang loại…'; }
  }

  /* ---------- vẽ ---------- */
  function drawConn() { const el = $('#conn'); if (el) { el.textContent = online ? '● Đã kết nối' : '● Mất sóng, đang nối lại…'; el.className = 'conn' + (online ? ' ok' : ''); } }
  function hud() {
    const m = me();
    return h('div', { class: 'hud' },
      h('span', { class: 'who' }, P.name),
      h('span', { id: 'conn', class: 'conn' }),
      h('span', { class: 'grow' }),
      ctl?.idx >= 0 ? h('span', { class: 'pill' }, `Câu ${ctl.idx + 1}/${ctl.n}`) : null,
      h('span', { class: 'pill', id: 'hudScore' }, fmt(m?.score) + ' điểm'),
      ctl?.phase === 'question' ? h('span', { class: 'pill timer', id: 'timer' }) : null);
  }
  function drawHud() { const el = $('#hudScore'); if (el) el.textContent = fmt(me()?.score) + ' điểm'; }
  function drawStatus() {
    const el = $('#status'), s = sent(); if (!el || !s) return;
    el.textContent = s.ok ? '✅ Đã gửi. Chờ công bố đáp án…' : '⏳ Đang gửi… (mất sóng thì máy tự gửi lại)';
    el.className = 'status' + (s.ok ? ' ok' : '');
  }
  function tick() {
    const el = $('#timer'); if (!el || !ctl || ctl.phase !== 'question') return;
    const s = Math.max(0, Math.ceil((P.deadline - Date.now()) / 1000));
    el.textContent = s + 's'; el.classList.toggle('low', s <= 5);
    if (!s && !sent()) { root.querySelectorAll('.ans button, .ans input').forEach((b) => (b.disabled = true)); const st = $('#status'); if (st) { st.textContent = '⏰ Hết giờ! Chờ công bố đáp án…'; st.className = 'status'; } }
  }
  function stemEl(q) {
    const b = h('div', { class: 'stem' }, h('div', { html: renderRich(q.de) }));
    q.hinh.forEach((s) => b.append(figEl(s, '../')));
    return b;
  }

  function draw() {
    clearInterval(tickId); clearInterval(resendId);
    if (!P?.name || !room) return drawJoin();
    const kids = [hud()];
    const ph = ctl?.phase;
    if (!ctl || ph === 'lobby' || ctl.idx < 0) {
      const n = sameRound() ? bxh.list.length : 0;
      kids.push(h('div', { class: 'card center' }, h('div', { class: 'big-emoji' }, '⏳'), h('h2', null, `Xin chào ${P.name}!`),
        h('p', null, `Đã vào phòng ${room}.`), h('p', { class: 'muted' }, n ? `${n} người trong phòng. Chờ thầy/cô bắt đầu…` : 'Chờ thầy/cô bắt đầu…'),
        h('button', { class: 'link', onclick: () => { P.name = ''; drawJoin(); } }, 'Đổi tên')));
    } else if (ph === 'question') kids.push(questionCard());
    else if (ph === 'reveal') kids.push(revealCard());
    else kids.push(boardCard());
    root.replaceChildren(...kids);
    drawConn();
    if (ph === 'question') { tickId = setInterval(tick, 250); tick(); resendId = setInterval(resend, 3000); drawStatus(); }
  }

  function questionCard() {
    const q = ctl.q, s = sent(), m = me();
    const card = h('div', { class: 'card' }, h('div', { class: 'tags' }, h('span', { class: 'tag' }, ctl.muc || '')), stemEl(q));
    const area = h('div', { class: 'ans' });
    if (q.loai === 'TN4') {
      q.choices.forEach((c, i) => {
        const L = 'ABCD'[i];
        if (hide?.includes(i)) return;
        area.append(h('button', { class: 'opt-btn' + (s?.ans === L ? ' on' : ''), disabled: !!s, onclick: () => submit(L) },
          h('b', null, L), h('span', { html: strip(renderRich(c)) })));
      });
    } else if (q.loai === 'DS') {
      const v = s ? s.ans : draft;
      q.tf.forEach(({ i, t }) => area.append(h('div', { class: 'ds-row' },
        h('div', { class: 'ds-t' }, h('b', null, 'abcd'[i] + ') '), h('span', { html: strip(renderRich(t)) })),
        h('div', { class: 'ds-k' }, ['Đ', 'S'].map((x) => h('button', { class: 'tf' + (v[i] === x ? ' on' : ''), disabled: !!s, onclick: () => { draft[i] = x; draw(); } }, x === 'Đ' ? 'Đúng' : 'Sai'))))));
      if (!s) area.append(h('button', { class: 'btn wide', disabled: !q.tf.every(({ i }) => draft[i]), onclick: () => submit({ ...draft }) }, 'Gửi câu trả lời'));
    } else {
      const inp = h('input', { class: 'input num', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Nhập đáp số', value: s ? s.ans : draft.v || '', disabled: !!s });
      const send = h('button', { class: 'btn wide', disabled: !!s || !String(draft.v || '').trim(), onclick: () => submit(inp.value.trim()) }, 'Gửi câu trả lời');
      inp.oninput = () => { draft.v = inp.value; send.disabled = !inp.value.trim(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter' && inp.value.trim()) submit(inp.value.trim()); };
      // iPhone không có dấu trừ trên bàn phím số: thêm phím riêng.
      const put = (ch) => { const a = inp.selectionStart ?? inp.value.length, b = inp.selectionEnd ?? a; inp.value = inp.value.slice(0, a) + ch + inp.value.slice(b); inp.focus(); inp.setSelectionRange(a + 1, a + 1); inp.oninput(); };
      area.append(inp, s ? null : h('div', { class: 'keys' },
        h('button', { type: 'button', onclick: () => put('-') }, '−  dấu âm'), h('button', { type: 'button', onclick: () => put(',') }, ',  dấu phẩy')), s ? null : send);
    }
    card.append(area);
    if (!s) card.append(h('div', { class: 'help' },
      h('button', { class: 'pu' + (x2On ? ' on' : ''), disabled: !m || m.x2 <= 0, onclick: () => { x2On = !x2On; draw(); } }, x2On ? '⚡ Đang x2 câu này' : `⚡ x2 điểm (${m?.x2 ?? 1})`),
      q.loai === 'TN4' ? h('button', { id: 'help', class: 'pu', disabled: !m || m.p5050 <= 0 || !!hide, onclick: askHelp }, `🎯 Loại 2 phương án (${m?.p5050 ?? 1})`) : null));
    card.append(h('div', { id: 'status', class: 'status' }));
    return card;
  }

  function myAnsText(q, a) {
    if (a == null) return 'Chưa trả lời';
    if (q.loai === 'DS') return q.tf.map(({ i }) => 'abcd'[i] + ') ' + (a[i] === 'Đ' ? 'Đúng' : a[i] === 'S' ? 'Sai' : '–')).join('   ');
    return String(a);
  }
  function keyText(q, k) {
    if (q.loai === 'DS') return q.tf.map(({ i }) => 'abcd'[i] + ') ' + (k.dap_an[i] === 'Đ' ? 'Đúng' : 'Sai')).join('   ');
    return String(k.dap_an);
  }
  function revealCard() {
    const q = ctl.q, k = ctl.key || {}, s = sent(), m = me();
    // bảng điểm có thể đến sau tin công bố một chút: chờ đúng bảng của câu này rồi mới báo kết quả
    const fresh = m && bxh.idx === ctl.idx && bxh.phase !== 'question';
    const r = fresh ? m.lastRatio : null;
    const verdict = !fresh ? ['wait', '⏳ Đang chấm…'] : r === 1 ? ['ok', '✅ Chính xác!']
      : r > 0 && q.loai === 'DS' ? ['part', `◐ Đúng ${Math.round(r * q.tf.length)}/${q.tf.length} ý`]
      : s ? ['no', '❌ Chưa chính xác'] : ['no', '⏰ Bạn chưa trả lời'];
    const card = h('div', { class: 'card' },
      h('div', { class: 'verdict ' + verdict[0] }, h('div', null, verdict[1]), fresh ? h('b', null, '+' + fmt(m.last || 0)) : null),
      stemEl(q));
    if (q.loai === 'TN4') card.append(h('div', { class: 'ans' }, q.choices.map((c, i) => h('div', {
      class: 'opt-btn ro' + ('ABCD'[i] === k.dap_an ? ' right' : s?.ans === 'ABCD'[i] ? ' wrong' : ''),
    }, h('b', null, 'ABCD'[i]), h('span', { html: strip(renderRich(c)) })))));
    card.append(h('div', { class: 'keybox' }, h('div', null, h('small', null, 'Bạn trả lời'), myAnsText(q, s?.ans)), h('div', null, h('small', null, 'Đáp án'), h('b', null, keyText(q, k)))));
    const sol = h('div', { class: 'sol', hidden: !showSol }, h('div', { html: renderRich(k.loigiai || 'Chưa có lời giải.') }), ...(k.hinh_lg || []).map((x) => figEl(x, '../')));
    card.append(h('button', { class: 'btn ghost wide', onclick: (e) => { showSol = !showSol; sol.hidden = !showSol; e.target.textContent = showSol ? 'Ẩn lời giải' : 'Xem lời giải'; } }, showSol ? 'Ẩn lời giải' : 'Xem lời giải'), sol);
    return card;
  }
  function boardCard() {
    const list = sameRound() ? bxh.list : [];
    const i = list.findIndex((p) => p.pid === P.pid), m = list[i];
    const end = ctl.phase === 'end';
    return h('div', { class: 'card center' },
      h('h2', null, end ? '🏁 Kết quả chung cuộc' : `Sau câu ${ctl.idx + 1}/${ctl.n}`),
      h('div', { class: 'rank' }, i >= 0 ? '#' + (i + 1) : '–'), h('p', { class: 'muted' }, i >= 0 ? `trên ${list.length} người chơi` : ''),
      h('div', { class: 'stats' }, h('div', null, h('small', null, 'Tổng điểm'), h('b', null, fmt(m?.score))), h('div', null, h('small', null, 'Số câu đúng'), h('b', null, `${m?.correct ?? 0}/${ctl.idx + 1}`))),
      h('table', { class: 'mini' }, list.slice(0, 5).concat(i >= 5 ? [m] : []).map((p) => h('tr', { class: p.pid === P.pid ? 'me' : '' },
        h('td', null, list.indexOf(p) + 1), h('td', null, p.name), h('td', { class: 'r' }, fmt(p.score))))),
      end ? null : h('p', { class: 'muted' }, 'Chờ câu tiếp theo…'));
  }

  /* ---------- khởi động ---------- */
  P = room ? loadP() : null;
  if (P?.name) { connect(); draw(); } else drawJoin();
})();
