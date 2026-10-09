# Quy ước hình vẽ (TikZ)

## Chung
- Hình đặt trong `\begin{center}\begin{tikzpicture}...\end{tikzpicture}\end{center}`, ngay sau đoạn văn mô tả.
- Dùng các kiểu có sẵn trong `dethi.sty`: `khuat` (nét đứt), `truc` (trục có mũi tên), `phu` (đường gióng xám), `diem`.
- Dựng hình **từ số liệu của đề**: hàm số vẽ bằng `plot` với công thức thật; hình học đặt tọa độ đúng tỉ lệ. Hình gốc sai thì vẽ lại đúng và ghi vào `ghi_chu`.
- TikZ tràn số khi trị tuyệt đối vượt khoảng 16000. Biểu thức lớn phải chia sớm, ví dụ `(x*(x-10)/80)*((...)/80)`.
- Hình không được chứa gợi ý lời giải (đường phụ, kết quả) nếu đề không có.

## Đồ thị, bảng biến thiên
- Trục: `\draw[truc]`, nhãn `$x$`, `$y$`, `$O$` đặt ở góc dưới trái gốc. Chỉ ghi các vạch số cần thiết.
- Bảng biến thiên dùng `tkz-tab`: `\tkzTabInit`, `\tkzTabLine`, `\tkzTabVar`.

## Hình học không gian (đã thống nhất)
- Phép chiếu song song kiểu SGK: `y={(.8cm,.5cm)}`, `z={(0cm,1cm)}` (trục sâu chếch lên bên phải). Hình vuông ở đáy thành hình bình hành.
- Mặt cầu, nón, trụ, bán cầu: dùng `tikz-3dplot` (`\tdplotsetmaincoords{70}{110}`). Đường viền mặt cầu vẽ bằng `tdplot_screen_coords`.
- **Nét khuất vẽ đứt**: cạnh bị mặt trước che khuất, đoạn nằm trong khối. Xác định bằng cách xét đỉnh nào nằm trong hình chiếu của khối.
- Đỉnh ghi chữ in hoa, đặt **ra phía ngoài** hình (`below left`, `above right`...).
- Mặt phẳng cần nhấn mạnh: tô nhạt `blue!10`, tô trước khi vẽ nét.

## Danh sách soát hình (bước 8)
1. Không có nhãn nào đè lên nét vẽ hoặc đè lên nhãn khác.
2. Không có nét chồng sát nhau đến mức khó phân biệt.
3. Nét khuất và nét thấy đúng theo vị trí người nhìn.
4. Số liệu trên hình khớp với đề: tỉ lệ cạnh, điểm cực trị, giao điểm.
5. Tia, đường song song phải song song thật; góc ghi trên hình nằm đúng mặt phẳng.
6. Ký hiệu đặc biệt (góc vuông, bằng nhau) chỉ có khi đúng.
7. Hình vừa khổ, không tràn lề, cỡ chữ nhãn đọc được.
