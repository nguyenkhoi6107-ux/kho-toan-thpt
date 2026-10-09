# Quy ước LaTeX

Preamble: `preamble/dethi.sty` + `preamble/mau.tex`, biên dịch bằng **XeLaTeX**. Cú pháp giống gói ex_test.

## Khung một file câu hỏi
```latex
%% ma: L12-B13-0001
%% lop: 12
%% chuong: 4
%% bai: 13
%% dang: 12.13.1
%% loai: TLN            # TN4 | DS | TLN | TL
%% muc: VDC             # DS: [NB, TH, VD, VD]
%% dap_an: "150"        # TN4: "B"; DS: "ĐSĐS"; TLN: số; TL: "-"
%% nguon: "..."
%% kien_thuc: "..."
%% trang_thai: chinh-thuc
%% ly_do: "..."         # bắt buộc khi cho-duyet / cach-ly
%% ghi_chu: "..."       # tuỳ chọn
\begin{ex}
Nội dung ...
\choice{$1$}{\True $2$}{$3$}{$4$}           % TN4 — tự xếp 1/2/4 hàng
\choiceTF{\True ý a}{ý b}{ý c}{\True ý d}   % DS
\shortans{2,25}                             % TLN
\loigiai{Các thao tác chính ...}
\end{ex}
```

## Quy tắc
- Lời giải chỉ ghi **các thao tác chính**: mỗi bước một câu hoặc một công thức, không diễn giải dài.
- Số thập phân dùng dấu phẩy. Trong môi trường toán viết `2{,}25`; trong `\shortans` viết `2,25`.
- Tọa độ và khoảng dùng dấu chấm phẩy: `$A(1;2)$`, `$[0;8]$`.
- Độ: `$45^\circ$`. Vi phân: `\,\mathrm dx`. Vectơ: `\overrightarrow{AB}`. Góc: `\widehat{ABC}`.
- Phân số trong dòng văn: `\dfrac` khi quan trọng, `\tfrac` khi chỉ là hệ số. Công thức dài hoặc tích phân lớn đặt trong `\[ \]`.
- Không dùng `\\` để xuống dòng trong văn bản, không dùng `$$`, không dùng `\vspace` thủ công, không định nghĩa macro riêng trong file câu hỏi.
- Ghép nối: `kho.py bien-dich` phải cho `OK` và không có "tràn lề".
