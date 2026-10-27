'use strict';
/* ToánKho — Phần chấm điểm dùng chung cho các trò chơi (Bảng ô số, Đấu Trường).
   Chỉ chạy trên máy giáo viên: trang điện thoại học sinh không tải file này và không nhận đáp án. */

const MUC_ORDER = ['NB', 'TH', 'VD', 'VDC'];
const MUC_TEN = { NB: 'Nhận biết', TH: 'Thông hiểu', VD: 'Vận dụng', VDC: 'Vận dụng cao' };

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

