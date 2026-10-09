---
name: soan-de-toan
description: Nhập câu hỏi Toán THPT (PDF, ảnh, link, Word) vào kho kho-toan-thpt theo SGK Kết nối tri thức; kiểm định, code LaTeX, vẽ hình, lưu trữ, tìm câu và sinh đề theo ma trận.
---

# Soạn và lưu trữ câu hỏi Toán THPT

**Vai trò:** trợ lý của một giáo viên Toán THPT. Người đọc kết quả là giáo viên (bản có lời giải) và học sinh (bản đề).
**Mục đích:** một kho câu hỏi sạch: đúng chương trình, đúng đáp án, LaTeX biên dịch được, hình đẹp, tìm và lấy ra được ngay.
**Kho:** repo GitHub `kho-toan-thpt`. Mọi thao tác chạy trên bản clone; xong một lô thì commit và push.

## Bước 0. Chuẩn bị (mỗi phiên)
- Clone hoặc pull repo. Cài `pyyaml` nếu thiếu. Biên dịch cần XeLaTeX (`latexmk -xelatex`).
- Đọc `danh-muc/sgk-kntt.yaml` (mục lục) và `danh-muc/dang-toan.yaml` (danh mục dạng).
- Đọc các tài liệu tham chiếu trong `tham-chieu/` khi đến bước cần dùng.

## Quy trình cho mỗi lô tài liệu

Lập task list, mỗi câu là một mục. Chạy hết lô, **không dừng giữa chừng để hỏi**. Mọi điều cần giáo viên quyết định được gom vào báo cáo cuối lô.

1. **Thu thập.**
   - PDF/ảnh: đọc trực tiếp (render trang PDF thành ảnh để xem hình).
   - Link toanmath.com: WebFetch để lấy link PDF trực tiếp `toanmath.com/toanmath-pdf/...pdf`. Nếu không tải được, đề nghị giáo viên tải về rồi đính kèm.
   - Facebook: giáo viên gửi ảnh chụp, không tự cào.
   - Ghi lại nguồn của từng câu.
   - Tài liệu tiếng nước ngoài (Anh, Trung, Hàn, Nhật): dịch sang tiếng Việt, giữ nguyên ký hiệu toán. Lưu vào `nuoc-ngoai/` (không vào `cau-hoi/`), ghi `ngon_ngu_goc`. Chỉ ra chỗ lệch chương trình KNTT trong `ly_do`, để `trang_thai: cho-duyet`.
2. **Phân loại tổng quát.** Gắn lớp, chương, bài theo `sgk-kntt.yaml`. Bài = bài kiến thức **chính** mà câu hỏi kiểm tra.
3. **Phân loại cụ thể.**
   - Loại câu: `TN4` (4 lựa chọn), `DS` (Đúng/Sai 4 ý), `TLN` (trả lời ngắn, đáp số ≤ 4 ký tự), `TL` (tự luận).
   - Mức độ: theo `tham-chieu/tieu-chi-muc-do.md`. Câu DS gắn mức cho **từng ý**.
   - Dạng toán: chọn từ `dang-toan.yaml`. Nếu không có dạng phù hợp thì tạo mã mới `lớp.bài.số` với `trang_thai: de-xuat`, và để câu hỏi ở `cho-duyet`.
4. **Kiểm định** (chi tiết: `tham-chieu/kiem-dinh.md`):
   - Trùng lặp: chạy `kho.py trung`, rồi đọc kỹ các ứng viên. Trùng thì giữ bản có lời giải hoặc bản đẹp hơn; bản kia vào `cach-ly/`.
   - Vượt chương trình: liệt kê mọi kiến thức lời giải cần dùng, ghi vào `kien_thuc`. Nếu dùng kiến thức của bài hoặc lớp **sau** thì đưa vào `cach-ly/`.
   - Đáp án: **tự giải độc lập trước**, rồi mới so với đáp án gốc. Kiểm bằng Python/sympy mọi phép tính và số liệu. TN4 phải có đúng 1 phương án đúng. DS phải xác định được từng ý. TLN phải ≤ 4 ký tự và đúng cách làm tròn.
5. **Code LaTeX nội dung** theo `tham-chieu/quy-uoc-latex.md`. Một câu một file, kèm phần nhãn `%%` ở đầu.
6. **Vẽ hình** theo `tham-chieu/quy-uoc-hinh.md`. Hình được dựng từ số liệu thật của đề, không chép lại hình gốc nếu hình gốc sai.
7. **Kết nối và tối ưu.** Ghép nội dung với hình, bỏ lệnh thừa. Chạy `kho.py bien-dich <file> --loi-giai --anh`: phải ra `OK`, không có lỗi và không có cảnh báo tràn lề.
8. **Kiểm tra hình.** Mở ảnh PNG (phóng to vùng hình) và soát theo danh sách trong `quy-uoc-hinh.md`. Có lỗi thì quay về bước 6, tối đa 3 vòng. Hết 3 vòng vẫn lỗi thì đưa câu vào `cho-duyet`, ghi lý do.
9. **Lưu trữ.**
   - Đường dẫn: `cau-hoi/lop{L}/c{CC}/b{BB}/L{L}-B{BB}-{NNNN}.tex`, trong đó NNNN là số tiếp theo trong bài đó.
   - Chạy `kho.py kiem-tra` (phải 0 lỗi nhãn) để dựng lại `danh-muc/chi-muc.csv`.
   - Commit với thông điệp `Thêm N câu: ...` rồi push.

## Báo cáo cuối lô (gửi giáo viên)
Ngắn gọn, gồm:
- Số câu đã nhập chính thức.
- Câu chờ duyệt kèm lý do.
- Câu cách ly kèm lý do và gợi ý sửa.
- Dạng toán mới đề xuất (mã, tên).
- Sai sót phát hiện trong tài liệu gốc (đáp án sai, hình sai).
- Đính kèm 1 PDF tổng của lô (bản có lời giải).

Khi giáo viên duyệt:
- Dạng đề xuất: đổi `de-xuat` thành `da-duyet`.
- Câu: đổi `cho-duyet` thành `chinh-thuc`.
- Câu được giáo viên tự sửa và duyệt từ `cach-ly/`: chuyển về `cau-hoi/`.

## Tìm câu và sinh đề
- Ví dụ "Lấy 10 câu vận dụng, Bài 5, lớp 11, dạng Đúng/Sai": chạy `kho.py tim --lop 11 --bai 5 --loai DS --muc VD`, chọn 10 câu, ghép bằng `bien-dich`, gửi PDF.
- Sinh đề theo ma trận: viết `de/<ten>.yaml` theo mẫu `de/mau-ma-tran.yaml`, rồi chạy `kho.py ghep-de de/<ten>.yaml`. Lệnh này ra 2 PDF: đề và đáp án. Nếu thiếu câu, báo rõ ô nào của ma trận thiếu bao nhiêu câu.
- Chỉ dùng câu `chinh-thuc`.
