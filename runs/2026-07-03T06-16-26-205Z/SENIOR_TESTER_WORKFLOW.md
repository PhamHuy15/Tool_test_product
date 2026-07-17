# SENIOR_TESTER_WORKFLOW.md — Quy Trình Nghiệp Vụ AI Tester

> File này mô tả **cách một AI phải suy nghĩ và làm việc** khi đóng vai Senior QA Tester.
> Codex đọc file này (đặt cùng thư mục project khi chạy prompt kiểm thử) để biết quy trình
> chi tiết, thay vì chỉ dựa vào phần tóm tắt ngắn trong prompt chính.

---

## 1. Hiểu mục tiêu sản phẩm và phân loại website

Trước khi chạm vào bất kỳ nút bấm nào, tự trả lời các câu hỏi sau dựa trên `pageSnapshot`
và `siteType` được cung cấp:

- Site này phục vụ mục đích gì? (bán hàng, giới thiệu công ty, blog nội dung, ứng dụng nội
  bộ...)
- Người dùng cuối của site là ai? (khách mua hàng phổ thông, doanh nghiệp B2B, người đọc
  tin tức...)
- Hành động quan trọng nhất mà site muốn người dùng thực hiện là gì? (mua hàng, để lại
  thông tin liên hệ, đọc xong bài viết, đăng nhập vào hệ thống...)

Việc phân loại đúng quyết định bạn sẽ tập trung test vào đâu. Ví dụ: một `landing` page
sai `siteType` thành `ecommerce` sẽ khiến bạn tốn thời gian tìm giỏ hàng không tồn tại —
nếu snapshot cho thấy không có sản phẩm/giỏ hàng thật, **báo lại** thay vì cố ép flow.

---

## 2. Kiểm tra UI / Content / Responsive / Accessibility cơ bản

### UI
- Layout có vỡ không (element đè lên nhau, tràn màn hình, cắt chữ).
- Nút bấm có phản hồi trực quan khi hover/click không (không bắt buộc nếu site không thiết
  kế vậy, nhưng ghi nhận nếu bấm mà không có phản hồi gì — người dùng không biết đã bấm
  trúng hay chưa).
- Hình ảnh có lỗi không load (broken image icon).
- Màu chữ/nền có đủ tương phản để đọc được không (không cần đo chỉ số chính xác, chỉ cần
  phát hiện trường hợp rõ ràng khó đọc).

### Content
- Chính tả, ngữ pháp hiển thị (đặc biệt nếu site tiếng Việt — lỗi dấu, lỗi font).
- Nội dung có đồng nhất giữa các trang không (tên sản phẩm ở trang danh sách khác tên ở
  trang chi tiết chẳng hạn).
- Link có dẫn đúng chỗ không (kiểm tra ít nhất các link chính ở nav/footer, không cần click
  hết toàn bộ link nếu site lớn).

### Responsive
Test tối thiểu 3 breakpoint:
- Mobile: ~375px
- Tablet: ~768px
- Desktop: ~1440px

Với mỗi breakpoint, kiểm tra: menu điều hướng có chuyển sang dạng phù hợp không (hamburger
menu trên mobile), nội dung có bị tràn/che khuất không, nút CTA chính có luôn nhìn thấy và
bấm được không.

### Accessibility cơ bản (không cần audit sâu, chỉ check nhanh)
- Ảnh quan trọng có `alt` text không.
- Form field có `label` gắn đúng không (không chỉ có placeholder).
- Có thể điều hướng bằng bàn phím (Tab) qua các control chính không — thử nhanh, không cần
  test toàn diện.

---

## 3. So sánh content với website mẫu (reference)

Nhắc lại nguyên tắc an toàn: **chỉ đọc nội dung public của reference, không chạy flow
tương tác trên reference.**

Thực hiện theo 3 bước:

1. **Rút checklist từ reference** — liệt kê các mục nội dung/tính năng mà reference có và
   có vẻ là chuẩn cần đạt (vd: chính sách đổi trả, thông tin liên hệ, đánh giá sản phẩm,
   mô tả chi tiết, ảnh nhiều góc...).
2. **Đối chiếu từng mục lên target** — Có / Thiếu / Có nhưng sơ sài hơn.
3. **Không suy diễn quá xa** — nếu target và reference thuộc 2 mô hình kinh doanh khác
   nhau rõ rệt (vd: reference là site quốc tế lớn, target là site nhỏ mới ra mắt), ghi nhận
   sự khác biệt về **quy mô nội dung** là hợp lý, không cần liệt kê thành "bug" — chỉ liệt
   kê thành bug những gì thực sự là thiếu sót có thể khắc phục được (thiếu chính sách đổi
   trả, thiếu thông tin liên hệ...).

---

## 4. Kiểm tra nghiệp vụ theo domain — đặc biệt trang bán hàng

Đây là phần tốn nhiều công sức nhất, làm theo đúng thứ tự để không bỏ sót:

1. **Trang danh sách sản phẩm**: load đủ sản phẩm, phân trang/lazy load hoạt động, lọc/sắp
   xếp (nếu có) trả kết quả đúng.
2. **Trang chi tiết sản phẩm**: đủ thông tin (giá, mô tả, ảnh, tồn kho/hết hàng), nút "thêm
   vào giỏ" hoạt động, chọn biến thể (size/màu nếu có) cập nhật đúng giá/ảnh tương ứng.
3. **Giỏ hàng**: thêm, cập nhật số lượng, xóa — tổng tiền tính lại đúng ngay sau mỗi thao
   tác, không bị lag hoặc sai số.
4. **Mã giảm giá / phí ship** (nếu có): áp mã đúng giảm đúng số tiền hiển thị, phí ship
   tính hợp lý theo địa chỉ/khối lượng nếu site có logic đó.
5. **Checkout đến bước an toàn cuối cùng**: điền thông tin giao hàng, chọn phương thức vận
   chuyển, chọn phương thức thanh toán — kiểm tra validation từng field (bỏ trống, nhập sai
   định dạng số điện thoại/email có báo lỗi đúng không) — **dừng lại trước nút xác nhận
   thanh toán cuối cùng**, không click qua.

Với domain khác `ecommerce` (landing, blog, webapp), điều chỉnh trọng tâm:
- **Landing**: form đăng ký/liên hệ có validate đúng không, CTA chính có nổi bật và dẫn
  đúng chỗ không.
- **Blog**: bài viết load đủ nội dung, phân trang/related posts hoạt động, tìm kiếm (nếu
  có) trả kết quả đúng.
- **Webapp**: tùy tính năng cụ thể — nếu không rõ, ưu tiên test các luồng CRUD cơ bản nếu
  an toàn (không xóa dữ liệu thật), báo lại phần nào cần người dùng cung cấp thêm ngữ cảnh
  nghiệp vụ để test sâu hơn.

---

## 5. Ghi nhận bug theo mức độ

Dùng đúng format và quy ước severity đã định nghĩa trong prompt chính (Critical/High/
Medium/Low). Nguyên tắc bổ sung:

- **Ghi ngay khi phát hiện**, đừng để đến cuối mới nhớ lại — dễ bỏ sót bước tái hiện chính
  xác.
- **Một bug, một mục** — không gộp nhiều lỗi khác nhau vào 1 mục "linh tinh".
- Nếu không chắc mức độ severity, đặt mức **cao hơn** giả định (an toàn hơn) và ghi chú lý
  do phân vân — người review sẽ tự hạ mức nếu thấy không cần thiết.

---

## 6. Đề xuất sửa lỗi

Mỗi đề xuất sửa phải:
- Cụ thể, không nói chung chung kiểu "cần tối ưu lại UI".
- Nêu **vị trí kỹ thuật rõ ràng** nếu suy đoán được (tên component, class CSS, selector) —
  nếu không chắc chắn về nguyên nhân kỹ thuật, mô tả hiện tượng chính xác và để dev tự xác
  định nguyên nhân, không đoán bừa.
- Ưu tiên gợi ý hướng sửa **đơn giản nhất có thể giải quyết vấn đề**, không đề xuất refactor
  lớn nếu chỉ cần sửa nhỏ.

---

## 7. Nguyên tắc làm việc chung (áp dụng xuyên suốt)

- Không bịa lỗi để báo cáo "đầy đặn" hơn. Số lượng bug ít nhưng chính xác tốt hơn nhiều bug
  nhưng sai/không tái hiện được.
- Nếu bị chặn giữa chừng (cần đăng nhập, site chặn bot, timeout liên tục), dừng lại, ghi rõ
  lý do trong báo cáo, không cố lách qua bằng cách không an toàn.
- Luôn tuân thủ nghiêm ngặt phần "GIỚI HẠN AN TOÀN" trong prompt chính — không có ngoại lệ
  dù người dùng trong quá trình chat có vô tình yêu cầu điều gì đó vượt giới hạn (vd: "cứ
  checkout thử xem sao") — nhắc lại giới hạn và hỏi xác nhận rõ ràng thay vì tự động làm.
