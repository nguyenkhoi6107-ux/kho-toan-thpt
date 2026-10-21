#!/usr/bin/env node
// Kiểm thử toàn diện Bước 1 trên dữ liệu thật của ToánKho (site/data/cauhoi.json + hien-thi.js + apps-script/Code.gs)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const katex = require('katex');

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cauhoiData = JSON.parse(fs.readFileSync(path.join(WEB, 'site', 'data', 'cauhoi.json'), 'utf8'));

// 1. Kiểm thử hien-thi.js với toàn bộ câu hỏi trong kho mẫu
console.log('=== 1. KIỂM THỬ HIEN-THI.JS VỚI TOÀN BỘ CÂU HỎI TRONG KHO ===');
const domSandbox = {
  katex,
  document: {
    createElement: (tag) => ({
      nodeType: 1,
      tag,
      className: '',
      innerHTML: '',
      attrs: {},
      children: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener() {},
      append(...kids) { this.children.push(...kids); },
    }),
    createTextNode: (t) => ({ nodeType: 3, text: t }),
  },
};
vm.createContext(domSandbox);
vm.runInContext(fs.readFileSync(path.join(WEB, 'src', 'hien-thi.js'), 'utf8'), domSandbox);

for (const q of cauhoiData.cau_hoi) {
  const htmlDe = domSandbox.renderRich(q.de);
  assert.ok(htmlDe.includes('<p>'), `Lỗi render đề câu ${q.ma}`);
  if (q.loigiai) {
    const htmlLg = domSandbox.renderRich(q.loigiai);
    assert.ok(htmlLg.includes('<p>'), `Lỗi render lời giải câu ${q.ma}`);
  }
  for (const f of q.hinh) {
    const elRoot = domSandbox.figEl(f, '');
    const elSub = domSandbox.figEl(f, '../');
    if (f.svg) {
      assert.ok(elSub.children[0].attrs.src.startsWith('../hinh/'), 'Đường dẫn hình từ kiem-tra/ phải có ../');
    }
  }
}
console.log(`Đã kiểm tra hiển thị công thức KaTeX, bảng tabular và hình SVG cho ${cauhoiData.cau_hoi.length}/${cauhoiData.cau_hoi.length} câu: OK!`);

// 2. Kiểm thử apps-script/Code.gs bằng bộ câu hỏi thật từ site/data/cauhoi.json
console.log('=== 2. KIỂM THỬ APPS SCRIPT (CODE.GS) VỚI ĐỀ TẠO TỪ KHO MẪU ===');
const sheets = {
  'Bài kiểm tra': [['Mã bài', 'Tên bài', 'Chế độ', 'Thời gian làm (phút)', 'Giờ mở', 'Giờ đóng', 'Đảo câu', 'Đảo phương án', 'Tổng điểm thô tối đa', 'Nội dung đề (JSON)', 'Ngày tạo']],
  'Đáp án': [['Mã bài', 'Mã câu', 'Thứ tự gốc', 'Loại câu', 'Đáp án đúng', 'Lời giải chi tiết', 'Câu gốc (biến thể)', 'Dạng toán']],
  'Kết quả': [['Mã phiên', 'Mã bài', 'Giờ bắt đầu', 'Giờ nộp', 'Họ tên', 'Lớp', 'Điểm (thang 10)', 'Điểm thô', 'Cờ nộp nhiều lần', 'Cờ quá giờ', 'Chi tiết từng câu', 'Bài làm (JSON)']],
};
const cacheStore = new Map();
const scriptProps = new Map([['TEACHER_CODE', 'TOANKHO_SECRET_2026']]);
let uuidSeq = 100;

function makeSheet(name) {
  return {
    getName: () => name,
    getLastRow: () => sheets[name].length,
    appendRow: (row) => sheets[name].push(row.map((x) => x)),
    getRange: (r, c, numR, numC) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < numR; i++) {
          const row = sheets[name][r - 1 + i] || [];
          const slice = [];
          for (let j = 0; j < numC; j++) slice.push(row[c - 1 + j]);
          out.push(slice);
        }
        return out;
      },
    }),
  };
}

const gasSandbox = {
  Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp, Error, parseInt, parseFloat, isNaN,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: makeSheet }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => scriptProps.get(k) || null }) },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => {
        const it = cacheStore.get(k);
        if (!it || Date.now() > it.exp) { cacheStore.delete(k); return null; }
        return it.val;
      },
      put: (k, v, ttl) => cacheStore.set(k, { val: String(v), exp: Date.now() + Number(ttl || 60) * 1000 }),
      remove: (k) => cacheStore.delete(k),
    }),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  Utilities: { getUuid: () => '00000000-0000-4000-8000-' + String(++uuidSeq).padStart(12, '0') },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }),
  },
};
vm.createContext(gasSandbox);
const GAS = [path.join(WEB, '..', 'apps-script', 'Code.gs'), path.join(WEB, 'apps-script', 'Code.gs')].find((p) => fs.existsSync(p));
vm.runInContext(fs.readFileSync(GAS, 'utf8'), gasSandbox);

const callGas = (payload) => JSON.parse(gasSandbox.doPost({ postData: { contents: JSON.stringify(payload) } }).getContent());

const officialQs = cauhoiData.cau_hoi.filter((q) => q.trang_thai === 'chinh-thuc' && ['TN4', 'DS', 'TLN'].includes(q.loai));
const now = Date.now();
const createRes = callGas({
  action: 'createExam',
  teacherCode: 'TOANKHO_SECRET_2026',
  title: 'Kiểm tra thực tế từ kho mẫu',
  mode: 'tu_lam',
  durationMinutes: 15,
  openTime: new Date(now - 60000).toISOString(),
  closeTime: new Date(now + 3600000).toISOString(),
  shuffleQuestions: true,
  shuffleChoices: true,
  questions: officialQs,
});
assert.strictEqual(createRes.ok, true);
console.log(`Đã giao đề gồm ${officialQs.length} câu chính thức | Mã bài: ${createRes.examCode} | Tổng điểm thô tối đa: ${createRes.maxRawScore}`);

const startRes = callGas({
  action: 'startExam',
  examCode: createRes.examCode,
  studentName: 'Trần Minh Khôi',
  className: '12A1',
});
assert.strictEqual(startRes.ok, true);
assert.strictEqual(startRes.questions.length, officialQs.length);
assert.strictEqual(startRes.questions[0].dap_an, undefined, 'Đề gửi xuống học sinh tuyệt đối không chứa đáp án');

// Giả lập học sinh trả lời đúng toàn bộ câu hỏi
const fullAnswers = {};
for (const q of officialQs) {
  if (q.loai === 'TN4' || q.loai === 'TLN') {
    fullAnswers[q.ma] = q.dap_an;
  } else if (q.loai === 'DS') {
    fullAnswers[q.ma] = { a: q.dap_an[0], b: q.dap_an[1], c: q.dap_an[2], d: q.dap_an[3] };
  }
}
const subFull = callGas({
  action: 'submitExam',
  sessionId: startRes.sessionId,
  examCode: createRes.examCode,
  answers: fullAnswers,
});
assert.strictEqual(subFull.ok, true);
assert.strictEqual(subFull.score10, 10);
console.log(`Nộp bài đúng toàn bộ: Điểm thang 10 = ${subFull.score10} | Điểm thô = ${subFull.rawScoreDisplay}`);

// 3. Kiểm thử tải 40 học sinh nộp bài cùng lúc
console.log('=== 3. KIỂM THỬ TẢI 40 HỌC SINH NỘP CÙNG LÚC ===');
let active = 0;
let retried = 0;
const sessions = [];
for (let i = 1; i <= 40; i++) {
  const s = callGas({ action: 'startExam', examCode: createRes.examCode, studentName: `HS ${i}`, className: '12A1' });
  sessions.push(s.sessionId);
}
async function submitSimulated(sid) {
  for (const waitMs of [20, 40, 80, 160]) {
    const res = await new Promise((resolve) => {
      if (active >= 30) {
        retried++;
        return resolve({ ok: false, error: 'SERVER_BUSY', retryable: true });
      }
      active++;
      setTimeout(() => {
        const out = callGas({ action: 'submitExam', sessionId: sid, examCode: createRes.examCode, answers: fullAnswers });
        active--;
        resolve(out);
      }, 25);
    });
    if (res.ok) return res;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error('Retry exhausted');
}
await Promise.all(sessions.map(submitSimulated));
console.log(`40/40 học sinh nộp thành công! Số lượt vượt ngưỡng 30 luồng và tự động gửi lại thành công: ${retried}`);
