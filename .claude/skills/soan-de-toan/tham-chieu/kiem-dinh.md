# Kiểm định câu hỏi

## 1. Trùng lặp
**Quy tắc hiện hành (giáo viên quyết định 21/10/2026, thay quy tắc 09/10/2026):** chỉ bỏ câu **trùng hoàn toàn**: cùng khung câu hỏi **và giống cả số** trong phần đề (chỉ khác cách trình bày, thứ tự hoặc phương án nhiễu). Câu **thay số** (cùng khung nhưng số liệu khác) thì **giữ lại** làm câu ôn tập.

1. Chạy `python3 cong-cu/kho.py trung <file>`. Lệnh so với các câu cùng lớp, cùng bài và in hai cột:
   - `khung`: tỉ lệ giống nhau sau khi mọi số thành `#`;
   - `cùng số`: các con số trong phần đề (không tính lời giải, hình, phương án) có y hệt nhau không.
2. Khung ≥ 0,80 và cùng số → **trùng hoàn toàn**: bỏ hẳn, không lưu, không đưa vào cách ly, chỉ nêu trong báo cáo (mục "Câu trùng hoàn toàn đã bỏ").
3. Khung ≥ 0,80 nhưng khác số → **biến thể thay số**: nhập bình thường vào **cùng dạng** với câu đã có (chính thức nếu dạng đã duyệt), ghi `ghi_chu: "Biến thể thay số của <mã câu>"`, liệt kê trong báo cáo (mục "Biến thể thay số đã giữ").
4. Khung 0,50–0,80: đọc kỹ cả hai câu. Cùng mô hình bài toán và cùng chuỗi bước giải chính → **trùng ý tưởng**: nhập vào cùng dạng với câu đã có (chính thức nếu dạng đã duyệt).
5. Kết luận của lệnh chỉ là gợi ý; luôn đọc lại ứng viên (ví dụ đề viết số bằng chữ, hay số nằm trong hình).
6. Số câu tối đa mỗi dạng theo mức độ: NB 20, TH 15, VD 10, VDC 5 (tính cả biến thể thay số). Vượt giới hạn thì không nhập câu đó, ghi vào báo cáo để giáo viên quyết định.

## 2. Phạm vi kiến thức (logic chương trình)
- Trường `kien_thuc` liệt kê **mọi** kiến thức mà lời giải dùng, ghi theo bài SGK.
- Câu xếp ở (lớp L, bài B) chỉ được dùng kiến thức của các lớp < L, và của các bài ≤ B trong lớp L. Riêng các bài được xếp ở chương khác nhưng học trước thì được phép (ví dụ Bài 2 thuộc chương 1 được dùng ở Bài 12).
- Kiến thức không có trong SGK KNTT (ví dụ định lí Vi-ét cho phương trình bậc ba, quy tắc L'Hôpital, tích phân bội) thì đưa câu vào `cach-ly/` và gợi ý cách sửa đề.
- Nếu đề cho thừa dữ kiện thuộc bài sau, nhưng lời giải không cần đến dữ kiện đó, thì vẫn chấp nhận; ghi chú điều này vào `kien_thuc`.
- Máy tính cầm tay (giải hệ, tìm nghiệm) được phép theo quy chế thi; ghi chú nếu câu bắt buộc phải dùng.

## 3. Đáp án
1. Giải độc lập **trước khi** xem đáp án gốc.
2. Kiểm bằng Python/sympy: mọi hệ số, nghiệm, tích phân, giá trị làm tròn. Với hình học thì dựng tọa độ để kiểm.
3. TN4: đúng 1 phương án đúng; các phương án nhiễu phải khác nhau và hợp lý (sai do lỗi thường gặp).
4. DS: mỗi ý đúng hoặc sai rõ ràng, không mơ hồ.
5. TLN: đáp số ≤ 4 ký tự (tính cả dấu `-` và dấu `,`), làm tròn đúng yêu cầu của đề.
6. Đáp án gốc sai: dùng đáp án đúng và ghi `ghi_chu: "Đáp án gốc ... sai, đúng là ..."`.

## 4. Trạng thái
- `chinh-thuc`: qua hết kiểm định, dạng đã duyệt.
- `cho-duyet`: cần giáo viên quyết định (dạng mới, bài nước ngoài lệch chương trình, hình chưa đạt sau 3 vòng).
- `cach-ly`: bị loại (trùng, vượt chương trình, đề sai không sửa được). File nằm trong `cach-ly/` và phải có `ly_do`.
