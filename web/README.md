# Web ToánKho

Trang web tĩnh để **xem, tìm, lấy LaTeX và tạo đề** từ kho `kho-toan-thpt`.
Web không có cơ sở dữ liệu riêng: mỗi lần dựng, nó đọc thẳng các file trong kho, nên GitHub và web luôn khớp nhau.

```
kho-toan-thpt/
├── cau-hoi/lop*/c*/b*/*.tex   ← nguồn duy nhất của câu hỏi (nhãn %% ở đầu file)
├── danh-muc/sgk-kntt.yaml      ← tên chương/bài (nếu có, ghi đè web/danh-muc.json)
├── danh-muc/dang-toan.yaml     ← tên dạng toán
├── hinh/<mã>-q1.svg            ← (tuỳ chọn) hình dựng sẵn; nếu không có thì CI tự vẽ từ TikZ
├── preamble/dethi.sty, mau.tex
├── web/                         ← thư mục này
└── .github/workflows/web.yml    ← chép từ web/cai-dat/web.yml
```

## Cài lần đầu (một lần)
1. Chép cả thư mục này vào repo với tên `web/` (bỏ `node_modules/`, `site/`, `mau-kho/`).
2. Chép `web/cai-dat/web.yml` vào `.github/workflows/web.yml`.
3. Trên GitHub: **Settings → Pages → Source: GitHub Actions**.
4. Push. Sau 3–6 phút (lần đầu tải TeX Live), web có ở `https://<tài-khoản>.github.io/kho-toan-thpt/`.

## Quy tắc để kho và web luôn tương thích
- Câu hỏi: giữ đúng khung trong `quy-uoc-latex.md` (`%% ma/lop/chuong/bai/dang/loai/muc/dap_an/trang_thai`, một `\begin{ex}…\end{ex}`).
  Nhãn mới thêm vào không làm hỏng web.
- Chỉ đọc `cau-hoi/`. `cach-ly/`, `nuoc-ngoai/`, `bao-cao/`, `tien-do.csv` không lên web.
- `chinh-thuc` → hiện và dùng được để tạo đề. `cho-duyet` → chỉ hiện khi tick “Cả câu chờ duyệt”.
- Hình: TikZ / `tabular` / `tkz-tab` trong câu được tách ra, biên dịch thành SVG bằng `preamble/dethi.sty`.
  Hình đã vẽ không bị vẽ lại (bộ nhớ đệm theo nội dung).
- Mọi chỗ lệch (mã trùng, `dap_an` khác `\True`, bài chưa có trong danh mục, hình lỗi) được ghi ở
  web → **Hướng dẫn → Cảnh báo dữ liệu**.

## Chạy thử trên máy
```
npm install
npm run mau        # dựng từ kho mẫu mau-kho/
npm run serve      # mở http://localhost:5180
node tools/build.mjs --src ../kho-toan-thpt   # dựng từ kho thật
```

## Chi phí
GitHub Pages + Actions miễn phí với repo **công khai**. Repo riêng tư cần gói GitHub Pro để bật Pages;
nếu muốn giữ kho riêng tư mà không trả phí, có thể đăng thư mục `site/` lên Cloudflare Pages (miễn phí).
Lưu ý: trang web công khai thì ai có link cũng xem được đáp án.
