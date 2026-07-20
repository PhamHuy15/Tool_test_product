# Tài Liệu Test Cases Kiểm Thử Thủ Công — https://example.com

- **QA Lead:** Senior QA (10 years experienced)
- **Ngày thiết kế:** 2026-07-20
- **Loại Website:** landing
- **Target URL:** https://example.com

## 1. Tóm Tắt Kế Hoạch Kiểm Thử (Test Summary)
Website này là trang landing page đơn giản hiển thị thông tin tên miền tham khảo. Chiến lược test tập trung chủ yếu vào tính đúng đắn của nội dung cung cấp, tính tương thích trên các kích thước màn hình di động/tablet, khả năng tải nhanh và hoạt động chính xác của các đường liên kết (nút bấm chuyển hướng).

## 2. Danh Sách Chi Tiết Test Cases

| Test Case ID | Thành Phần / Trang | Tiêu Đề / Mục Tiêu | Điều Kiện Tiên Quyết | Các Bước Thực Hiện | Kết Quả Kỳ Vọng | Severity | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| TC_UI_001 | Trang chủ | Kiểm tra hiển thị tiêu đề chính | Trang load xong thành công | 1. Mở trang chủ targetUrl<br>2. Kiểm tra font chữ, cỡ chữ tiêu đề chính | Tiêu đề "Example Domain" hiển thị đúng kiểu chữ Outfit, căn giữa, không lỗi font | High | P0 |
| TC_FUNC_002 | Trang chủ | Kiểm tra liên kết "More information..." | Trang load xong thành công | 1. Di chuyển chuột đến link "More information..."<br>2. Bấm vào liên kết | Trang web chuyển hướng an toàn tới tên miền của IANA (https://www.iana.org/domains/reserved) | Critical | P0 |
| TC_RESP_003 | Mobile Layout | Kiểm tra hiển thị trên Mobile 375px | Thiết bị hoặc giả lập iPhone X/12 | 1. Resize màn hình về chiều rộng 375px<br>2. Kiểm tra khoảng cách lề và kích thước chữ | Toàn bộ chữ và hình nằm trọn trong khung hình, không xuất hiện thanh cuộn ngang | Medium | P1 |

## 3. Hướng Dẫn Thực Hiện & Nghiệm Thu (User Acceptance Testing Guides)
1. Hãy mở trình duyệt Chrome/Firefox thông thường, bật công cụ F12 (Developer Tools) và chọn chế độ Device Mode để kiểm tra responsive.
2. Kiểm tra việc tải tài nguyên ảnh và phản hồi nút chuyển trang trên các đường mạng/độ trễ thông thường.
3. Nghiệm thu: Bộ test case cần đạt 100% P0 hiển thị thành công.
