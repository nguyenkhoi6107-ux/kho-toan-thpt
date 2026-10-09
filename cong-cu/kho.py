#!/usr/bin/env python3
"""Công cụ quản lý kho câu hỏi Toán THPT.

  python3 cong-cu/kho.py kiem-tra                 # kiểm tra nhãn mọi câu, dựng lại chi-muc.csv
  python3 cong-cu/kho.py tim --lop 11 --bai 5 --loai DS --muc VD
  python3 cong-cu/kho.py trung <file.tex>          # tìm câu nghi trùng (cùng bài)
  python3 cong-cu/kho.py bien-dich <file.tex>... [--loi-giai] [--anh]
  python3 cong-cu/kho.py ghep-de <ma-tran.yaml>    # sinh đề + đáp án theo ma trận
"""
import argparse, csv, difflib, random, re, shutil, subprocess, sys
from pathlib import Path
import yaml

GOC = Path(__file__).resolve().parent.parent
SGK = yaml.safe_load((GOC / "danh-muc/sgk-kntt.yaml").read_text(encoding="utf-8"))
DANG = yaml.safe_load((GOC / "danh-muc/dang-toan.yaml").read_text(encoding="utf-8")) or {}
LOAI = {"TN4": "Trắc nghiệm 4 lựa chọn", "DS": "Đúng/Sai", "TLN": "Trả lời ngắn", "TL": "Tự luận"}
MUC = ["NB", "TH", "VD", "VDC"]
TRANG_THAI = ["chinh-thuc", "cho-duyet", "cach-ly"]
KHO_DIRS = ["cau-hoi", "nuoc-ngoai", "cach-ly"]
CSV_COT = ["ma", "kho", "lop", "chuong", "bai", "dang", "loai", "muc", "dap_an", "trang_thai", "nguon", "duong_dan"]


def doc_nhan(path):
    """Đọc phần nhãn '%% khoá: giá trị' ở đầu file câu hỏi."""
    dong = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.startswith("%%"):
            break
        dong.append(line[2:].strip() if len(line) > 2 else "")
    return yaml.safe_load("\n".join(dong)) or {}


def noi_dung(path):
    return "\n".join(l for l in Path(path).read_text(encoding="utf-8").splitlines() if not l.startswith("%%"))


def tat_ca():
    for d in KHO_DIRS:
        yield from sorted((GOC / d).rglob("*.tex"))


def tim_chuong(lop, bai):
    for ch, v in SGK.get(lop, {}).items():
        if bai in v["bai"]:
            return ch
    return None


def kiem_tra_nhan(path, n):
    loi = []
    lop, bai, ch = n.get("lop"), n.get("bai"), n.get("chuong")
    kho = Path(path).relative_to(GOC).parts[0]
    if kho != "nuoc-ngoai" or lop:  # kho nước ngoài được phép chưa gắn lớp
        if lop not in SGK:
            loi.append(f"lop={lop} không có")
        elif tim_chuong(lop, bai) is None:
            loi.append(f"bai={bai} không thuộc lớp {lop}")
        elif tim_chuong(lop, bai) != ch:
            loi.append(f"chuong={ch} sai, bài {bai} thuộc chương {tim_chuong(lop, bai)}")
        if str(n.get("dang")) not in DANG:
            loi.append(f"dang={n.get('dang')} chưa có trong danh-muc/dang-toan.yaml")
    if n.get("loai") not in LOAI:
        loi.append(f"loai={n.get('loai')} phải là {list(LOAI)}")
    muc = n.get("muc")
    if n.get("loai") == "DS":
        if not (isinstance(muc, list) and len(muc) == 4 and all(m in MUC for m in muc)):
            loi.append("câu DS cần muc là danh sách 4 mức, vd [NB, TH, VD, VD]")
    elif muc not in MUC:
        loi.append(f"muc={muc} phải là {MUC}")
    if n.get("trang_thai") not in TRANG_THAI:
        loi.append(f"trang_thai phải là {TRANG_THAI}")
    if n.get("trang_thai") == "cach-ly" and kho != "cach-ly":
        loi.append("câu cách ly phải nằm trong thư mục cach-ly/")
    if n.get("trang_thai") in ("cach-ly", "cho-duyet") and not n.get("ly_do"):
        loi.append("thiếu ly_do")
    if n.get("loai") == "TLN" and len(str(n.get("dap_an", ""))) > 4:
        loi.append("đáp án trả lời ngắn dài quá 4 ký tự")
    if Path(path).stem != n.get("ma"):
        loi.append(f"tên file khác mã câu ({n.get('ma')})")
    return loi


def cmd_kiem_tra(_):
    hang, so_loi = [], 0
    for p in tat_ca():
        n = doc_nhan(p)
        for l in kiem_tra_nhan(p, n):
            print(f"LỖI {p.relative_to(GOC)}: {l}")
            so_loi += 1
        muc = n.get("muc")
        hang.append({**{k: n.get(k, "") for k in CSV_COT}, "kho": p.relative_to(GOC).parts[0],
                     "muc": "-".join(muc) if isinstance(muc, list) else muc,
                     "duong_dan": str(p.relative_to(GOC))})
    with open(GOC / "danh-muc/chi-muc.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, CSV_COT)
        w.writeheader()
        w.writerows(hang)
    cho = [h for h in hang if h["trang_thai"] == "cho-duyet"]
    de_xuat = [k for k, v in DANG.items() if v.get("trang_thai") == "de-xuat"]
    print(f"{len(hang)} câu, {so_loi} lỗi nhãn, {len(cho)} câu chờ duyệt, {len(de_xuat)} dạng đề xuất chờ duyệt.")
    return 1 if so_loi else 0


def khop(n, a):
    if a.lop and n.get("lop") != a.lop: return False
    if a.bai and n.get("bai") not in a.bai: return False
    if a.loai and n.get("loai") != a.loai: return False
    if a.dang and str(n.get("dang")) != a.dang: return False
    if a.muc:
        m = n.get("muc")
        if a.muc not in (m if isinstance(m, list) else [m]): return False  # DS: có ít nhất 1 ý ở mức này
    return n.get("trang_thai") == "chinh-thuc"


def cmd_tim(a):
    kq = [(p, n) for p in (GOC / "cau-hoi").rglob("*.tex") if khop(n := doc_nhan(p), a)]
    for p, n in kq:
        print(f"{n['ma']}\tL{n['lop']} B{n['bai']}\t{n['loai']}\t{n['muc']}\t{p.relative_to(GOC)}")
    print(f"-- {len(kq)} câu")


def chuan_hoa(s):
    s = re.sub(r"\\begin\{tikzpicture\}.*?\\end\{tikzpicture\}", " ", s, flags=re.S)
    s = re.sub(r"\\loigiai\{.*", " ", s, flags=re.S)
    s = re.sub(r"\\[a-zA-Z]+", " ", s)
    s = re.sub(r"\d+([.,]\d+)?", "#", s)  # đổi số -> '#': bắt được câu chỉ thay số
    return re.sub(r"[\s{}$\\\[\]()]+", " ", s).lower().strip()


def cmd_trung(a):
    p0 = Path(a.file).resolve()
    n0, t0 = doc_nhan(p0), chuan_hoa(noi_dung(p0))
    kq = []
    for p in tat_ca():
        if p.resolve() == p0: continue
        n = doc_nhan(p)
        if (n.get("lop"), n.get("bai")) != (n0.get("lop"), n0.get("bai")): continue
        kq.append((difflib.SequenceMatcher(None, t0, chuan_hoa(noi_dung(p))).ratio(), p))
    kq.sort(reverse=True)
    for r, p in kq[:5]:
        print(f"{r:.2f}\t{p.relative_to(GOC)}")
    print("-- Tỉ lệ ≥ 0.80: gần như chắc trùng (đổi số). 0.50–0.80: Claude đọc kỹ để xét trùng ý tưởng.")


def bien_dich(noidung, ra, loi_giai=True, tieu_de="", anh=False):
    ra = Path(ra); ra.parent.mkdir(parents=True, exist_ok=True)
    mau = (GOC / "preamble/mau.tex").read_text(encoding="utf-8")
    tex = (mau.replace("%%CHEDO%%", r"\hienloigiai" if loi_giai else r"\anloigiai")
              .replace("%%TIEUDE%%", tieu_de).replace("%%NOIDUNG%%", noidung))
    ra.with_suffix(".tex").write_text(tex, encoding="utf-8")
    env = {"TEXINPUTS": f"{GOC/'preamble'}//:", "PATH": "/usr/bin:/bin:/usr/local/bin"}
    r = subprocess.run(["latexmk", "-xelatex", "-interaction=nonstopmode", "-halt-on-error",
                        ra.with_suffix(".tex").name], cwd=ra.parent, env=env, capture_output=True, text=True)
    log = ra.with_suffix(".log").read_text(encoding="utf-8", errors="ignore") if ra.with_suffix(".log").exists() else r.stdout
    loi = re.findall(r"^! .*", log, flags=re.M)
    tran = re.findall(r"^(Overfull \\hbox.*)", log, flags=re.M)
    for l in loi: print("LỖI LaTeX:", l)
    for l in tran: print("CẢNH BÁO tràn lề:", l)
    ok = r.returncode == 0 and not loi
    print(("OK " if ok else "THẤT BẠI ") + str(ra.with_suffix(".pdf")))
    if ok and anh:
        subprocess.run(["pdftoppm", "-r", "110", "-png", ra.with_suffix(".pdf").name, ra.stem], cwd=ra.parent)
        print("Ảnh để kiểm hình:", *sorted(str(p) for p in ra.parent.glob(ra.stem + "-*.png")))
    return ok


def cmd_bien_dich(a):
    files = [Path(f).resolve() for f in a.files]
    body = "\n".join(noi_dung(f) for f in files)
    ra = GOC / "build" / (files[0].stem if len(files) == 1 else "nhieu-cau")
    return 0 if bien_dich(body, ra, a.loi_giai, anh=a.anh) else 1


def cmd_ghep_de(a):
    mt = yaml.safe_load(Path(a.ma_tran).read_text(encoding="utf-8"))
    rnd = random.Random(mt.get("hat_giong", 1))
    phan_tex, thieu = [], []
    for ph in mt["phan"]:
        chon = []
        for d in ph["dong"]:
            q = argparse.Namespace(lop=d.get("lop"), bai=d.get("bai"), loai=ph["loai"], muc=d.get("muc"), dang=d.get("dang"))
            kho = sorted(p for p in (GOC / "cau-hoi").rglob("*.tex") if khop(doc_nhan(p), q) and p not in chon)
            if len(kho) < d["so"]:
                thieu.append(f"{ph['loai']} lớp {d.get('lop')} bài {d.get('bai')} mức {d.get('muc')}: cần {d['so']}, có {len(kho)}")
            chon += rnd.sample(kho, min(d["so"], len(kho)))
        phan_tex.append(rf"\phan{{{ph['so']}}}{{{ph['tieu_de']}}}" + "\n" + "\n".join(noi_dung(p) for p in chon))
    for t in thieu: print("THIẾU:", t)
    td = rf"\begin{{center}}\bfseries\large {mt['ten']}\end{{center}}"
    ten = Path(a.ma_tran).stem
    ok1 = bien_dich("\n".join(phan_tex), GOC / "de" / ten, False, td)
    ok2 = bien_dich("\n".join(phan_tex), GOC / "de" / (ten + "-dap-an"), True, td)
    return 0 if ok1 and ok2 else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="lenh", required=True)
    sp.add_parser("kiem-tra").set_defaults(f=cmd_kiem_tra)
    t = sp.add_parser("tim"); t.set_defaults(f=cmd_tim)
    t.add_argument("--lop", type=int); t.add_argument("--bai", type=int, nargs="+")
    t.add_argument("--loai", choices=LOAI); t.add_argument("--muc", choices=MUC); t.add_argument("--dang")
    t = sp.add_parser("trung"); t.add_argument("file"); t.set_defaults(f=cmd_trung)
    t = sp.add_parser("bien-dich"); t.add_argument("files", nargs="+")
    t.add_argument("--loi-giai", action="store_true"); t.add_argument("--anh", action="store_true"); t.set_defaults(f=cmd_bien_dich)
    t = sp.add_parser("ghep-de"); t.add_argument("ma_tran"); t.set_defaults(f=cmd_ghep_de)
    a = ap.parse_args()
    sys.exit(a.f(a) or 0)


if __name__ == "__main__":
    main()
