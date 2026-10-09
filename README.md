# Kho câu hỏi Toán THPT (SGK Kết nối tri thức)

Kho riêng của giáo viên. Mọi thao tác được thực hiện bằng cách chat với Claude: Claude đọc skill `soan-de-toan` và làm theo quy trình 9 bước.

| Thư mục | Nội dung |
|---|---|
| `cau-hoi/lop{10,11,12}/cCC/bBB/` | Câu hỏi đã qua kiểm định, một câu một file `.tex` |
| `nuoc-ngoai/` | Câu hỏi dịch từ tài liệu nước ngoài (kho riêng) |
| `cach-ly/` | Câu bị loại, kèm lý do trong phần nhãn |
| `danh-muc/` | Mục lục SGK, danh mục dạng toán, `chi-muc.csv` (tự sinh) |
| `preamble/` | `dethi.sty`, `mau.tex`. Biên dịch bằng **XeLaTeX** (trên Overleaf: Menu → Compiler → XeLaTeX) |
| `de/` | Ma trận đề (`.yaml`) và đề đã sinh |
| `cong-cu/kho.py` | Kiểm tra nhãn, tìm câu, tìm câu trùng, biên dịch, sinh đề |
| `.claude/skills/soan-de-toan/` | Quy trình và các quy ước |

Câu nói mẫu khi chat với Claude:
- "Nhập các câu trong file này vào kho."
- "Duyệt hết các dạng đề xuất."
- "Lấy 10 câu vận dụng, Bài 5, lớp 11, dạng Đúng/Sai."
- "Sinh đề giữa kì 1 lớp 12 theo ma trận: ..."
