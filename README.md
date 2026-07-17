# Local AI Test Web

Web app chạy local để dán JSON test package từ Chrome Extension, gọi `codex exec`, chạy AI Website Test bằng Codex, rồi hiển thị kết quả ngay trên trình duyệt.

Ứng dụng này chỉ chạy trên máy của bạn, không public ra internet.

## 1. Vị trí dự án

Dự án đang nằm tại:

```text
D:\workspaces\AI Test Local Web
```

Thư mục server:

```text
D:\workspaces\AI Test Local Web\server
```

Địa chỉ web mặc định:

```text
http://127.0.0.1:4545
```

## 2. Cấu trúc thư mục

```text
AI Test Local Web/
├── server/
│   ├── index.js
│   ├── runCodex.js
│   ├── package.json
│   └── package-lock.json
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── prompts/
│   ├── test-prompt.md
│   ├── workflow.md
│   └── content-comparison-prompt.md
├── runs/
│   └── <timestamp>/
├── work-logs/
│   ├── server.out.log
│   └── server.err.log
└── README.md
```

## 3. Yêu cầu trước khi chạy

Cần cài:

- Node.js 18 trở lên.
- Codex CLI bản npm.
- Tài khoản Codex/OpenAI đã đăng nhập bằng `codex login`.

Kiểm tra Node.js:

```powershell
node --version
npm --version
```

Cài Codex CLI:

```powershell
npm.cmd install -g @openai/codex
```

Đăng nhập Codex:

```powershell
codex login
```

Kiểm tra Codex CLI:

```powershell
where.exe codex.cmd
codex --version
```

Kết quả đúng nên có dạng:

```text
C:\Users\admin\AppData\Roaming\npm\codex.cmd
codex-cli 0.xxx.x
```

Nếu `where.exe codex.cmd` không hiện đường dẫn trong `AppData\Roaming\npm`, server có thể không gọi được Codex CLI.

## 4. Cài dependency

Mở PowerShell và chạy:

```powershell
cd "D:\workspaces\AI Test Local Web\server"
npm.cmd install
```

Nếu đã cài rồi thì không cần chạy lại mỗi lần mở app.

## 5. Chạy server

Chạy:

```powershell
cd "D:\workspaces\AI Test Local Web\server"
npm.cmd start
```

Khi chạy thành công, terminal sẽ báo server chạy tại:

```text
http://127.0.0.1:4545
```

Sau đó mở trình duyệt:

```text
http://127.0.0.1:4545
```

## 6. Chạy bằng port khác

Nếu port `4545` đang bị chiếm, có thể chạy bằng port khác:

```powershell
cd "D:\workspaces\AI Test Local Web\server"
$env:PORT=4546; npm.cmd start
```

Sau đó mở:

```text
http://127.0.0.1:4546
```

## 7. Cách sử dụng

Ứng dụng hiện có 2 tính năng:

- `Chạy AI Test`: dán JSON test package từ Chrome Extension và chạy test website.
- `So Sánh Nội Dung`: nhập 2 URL bất kỳ để crawl và so sánh content parity giữa site gốc và site đích.

### 7.1. Chạy AI Test

1. Mở web app tại `http://127.0.0.1:4545`.
2. Chọn tab thao tác `Chạy AI Test`.
3. Dán JSON test package từ Chrome Extension vào ô `JSON test package`.
4. Bấm `Chạy AI Test`.
5. Chờ Codex chạy. Quá trình này có thể mất vài phút.
6. Theo dõi log trong tab kết quả `Tiến trình`.
7. Xem kết quả ở các tab:

- `Ảnh chụp`: ảnh bằng chứng trong `TEST_EVIDENCE`.
- `Test Report`: nội dung file `TEST_REPORT.md`.
- `Fix Plan`: nội dung file `FIX_PLAN.md`.

Có thể tải file Markdown gốc bằng nút tải xuống trên giao diện.

### 7.2. So Sánh Nội Dung

1. Mở web app tại `http://127.0.0.1:4545`.
2. Chọn tab thao tác `So Sánh Nội Dung`.
3. Nhập `URL trang gốc`, là site nguồn chứa nội dung chuẩn.
4. Nhập `URL trang đích`, là site cần kiểm tra sau khi chuyển theme/giao diện.
5. Bấm `So Sánh Nội Dung`.
6. Theo dõi log trong tab kết quả `Tiến trình`.
7. Khi hoàn tất, xem:

- `Cặp trang`: bảng tóm tắt từ `page_pairs.csv`.
- `So sánh nội dung`: báo cáo Markdown render từ `CONTENT_COMPARISON_REPORT.md`.

Tính năng này chỉ đọc nội dung public, không đăng nhập, không submit form và không tự sửa website.

## 8. JSON test package cần có gì

JSON tối thiểu cần các field:

```json
{
  "targetUrl": "https://example.com",
  "siteType": "landing",
  "testScope": ["content", "ui", "responsive"],
  "pageSnapshot": {}
}
```

Các field quan trọng:

- `targetUrl`: URL website cần test.
- `siteType`: loại website, ví dụ `landing`, `ecommerce`, `blog`, `webapp`.
- `testScope`: phạm vi test, ví dụ `content`, `ui`, `responsive`, `business-flow`, `cart`.
- `pageSnapshot`: dữ liệu snapshot do Chrome Extension export.
- `referenceUrl`: website mẫu để so sánh, nếu có.
- `reportLanguage`: ngôn ngữ báo cáo, nếu có.

Nếu JSON sai format hoặc thiếu `targetUrl`, server sẽ báo lỗi và không chạy Codex.

## 9. Endpoint backend

Các endpoint chính:

- `POST /api/run-test`: chạy AI Website Test từ JSON test package.
- `POST /api/compare-content`: chạy so sánh nội dung giữa 2 URL.
- `GET /api/runs/:runId/events`: stream tiến trình bằng SSE.
- `GET /api/runs/:runId/files/:fileName`: tải file kết quả.

Body cho `POST /api/compare-content`:

```json
{
  "sourceUrl": "https://source-site.example/",
  "targetUrl": "https://target-site.example/"
}
```

Server sẽ validate URL, trích xuất domain, thay placeholder trong `prompts/content-comparison-prompt.md`, tạo thư mục `runs/compare-<timestamp>/`, rồi gọi `codex exec`.

Khi gọi Codex, server đã cấu hình sẵn network access cho sandbox bằng flag:

```text
-c sandbox_workspace_write.network_access=true
```

Flag này cho phép Playwright/fetch truy cập website thật khi chạy trong sandbox `workspace-write`. Người dùng không cần tự chỉnh thêm cấu hình network.

Riêng với `So Sánh Nội Dung`, server có thêm cơ chế theo dõi file kết quả. Khi `CONTENT_COMPARISON_REPORT.md` và `page_pairs.csv` đã được ghi xong và ổn định vài giây, server sẽ tự trả kết quả về giao diện, kể cả khi process Codex còn chậm đóng sau đó.

## 10. Kết quả được lưu ở đâu

Mỗi lần chạy sẽ tạo một thư mục riêng trong:

```text
D:\workspaces\AI Test Local Web\runs
```

Ví dụ:

```text
D:\workspaces\AI Test Local Web\runs\2026-07-06T10-20-30-000Z
```

Với tính năng `So Sánh Nội Dung`, thư mục run có dạng:

```text
D:\workspaces\AI Test Local Web\runs\compare-2026-07-06T10-20-30-000Z
```

Trong mỗi thư mục run thường có:

- `combined-prompt.txt`: prompt đã ghép với JSON test package.
- `SENIOR_TESTER_WORKFLOW.md`: workflow được dùng cho phiên test.
- `TEST_REPORT.md`: báo cáo test.
- `FIX_PLAN.md`: kế hoạch sửa lỗi.
- `TEST_EVIDENCE\`: ảnh chụp hoặc bằng chứng test, nếu Codex tạo.

Với run so sánh nội dung, thư mục có thể có:

- `combined-prompt.txt`: prompt đã thay URL/domain.
- `page_pairs.csv`: danh sách cặp trang đã ghép.
- `CONTENT_COMPARISON_REPORT.md`: báo cáo so sánh nội dung.

## 11. Log server

Log server nằm trong:

```text
D:\workspaces\AI Test Local Web\work-logs
```

Các file chính:

- `server.out.log`: log output bình thường.
- `server.err.log`: log lỗi server.

## 12. Dừng server

Nếu đang chạy trong terminal, bấm:

```text
Ctrl + C
```

Nếu server đang chạy nền và muốn dừng process đang nghe port `4545`:

```powershell
$line = netstat -ano | Select-String ':4545\s+.*LISTENING' | Select-Object -First 1
$pidToStop = [int](($line.ToString().Trim() -split '\s+')[-1])
Stop-Process -Id $pidToStop -Force
```

## 13. Lỗi thường gặp

### Lỗi `spawn EPERM`

Nguyên nhân thường gặp: Windows đang chặn executable `codex` trong `WindowsApps`, hoặc máy chưa có Codex CLI bản npm.

Kiểm tra:

```powershell
where.exe codex.cmd
where.exe codex.exe
codex --version
```

Cách sửa:

```powershell
npm.cmd install -g @openai/codex
codex login
```

Sau đó restart server:

```powershell
cd "D:\workspaces\AI Test Local Web\server"
npm.cmd start
```

### Lỗi không tìm thấy Codex CLI

Cài lại Codex CLI:

```powershell
npm.cmd install -g @openai/codex
codex login
```

Kiểm tra lại:

```powershell
where.exe codex.cmd
codex --version
```

### Lỗi PowerShell chặn `npm`

Nếu chạy `npm install` hoặc `npm start` bị lỗi execution policy, dùng `npm.cmd`:

```powershell
npm.cmd install
npm.cmd start
```

### Lỗi port 4545 bị chiếm

Dùng port khác:

```powershell
$env:PORT=4546; npm.cmd start
```

Hoặc dừng process đang dùng port `4545`.

### JSON không hợp lệ

Kiểm tra JSON bằng validator hoặc đảm bảo JSON có dấu ngoặc, dấu phẩy, dấu nháy kép đúng chuẩn.

Ví dụ đúng:

```json
{
  "targetUrl": "https://example.com",
  "siteType": "landing",
  "testScope": ["ui"],
  "pageSnapshot": {}
}
```

### URL so sánh không hợp lệ

Khi dùng `So Sánh Nội Dung`, cả 2 URL phải bắt đầu bằng `http://` hoặc `https://`.

Ví dụ đúng:

```text
https://site-goc.example/
https://site-dich.example/
```

## 14. Lưu ý về quota và chi phí

Mỗi lần bấm `Chạy AI Test` hoặc `So Sánh Nội Dung`, web app sẽ gọi thật:

```text
codex exec
```

Vì vậy nó dùng quota/limit của tài khoản Codex/OpenAI đang đăng nhập bằng `codex login`.

Nếu dùng ChatGPT Plus, nó sẽ dùng hạn mức Codex/agentic usage gắn với tài khoản đó. Một lần chạy có thể tốn nhiều usage hơn chat thường vì prompt dài, có JSON snapshot hoặc nhiều trang cần crawl, có thể mở Playwright và tạo báo cáo.

Riêng `So Sánh Nội Dung` có thể mất nhiều phút đến hàng giờ nếu 2 site có nhiều trang.

## 15. Lưu ý an toàn

- Server chỉ bind trên `127.0.0.1`.
- Không mở server ra internet.
- Không đổi sang bind `0.0.0.0` nếu không thật sự hiểu rủi ro.
- Không có UI để người dùng chỉnh các file trong `prompts/`.
- Backend gọi Codex bằng `child_process.spawn` với argument riêng, không nối chuỗi shell.
- Backend chỉ bật riêng quyền network trong sandbox bằng `-c sandbox_workspace_write.network_access=true`, không dùng `--sandbox danger-full-access`.
- Mọi kết quả chỉ lưu local trong thư mục `runs`.

## 16. Lệnh chạy nhanh

Nếu máy đã cài đủ dependency và Codex CLI:

```powershell
cd "D:\workspaces\AI Test Local Web\server"
npm.cmd start
```

Mở:

```text
http://127.0.0.1:4545
```
