# Test Report - https://alternita.devseite.top/
- Ngay test: 2026-07-03
- Site type: landing / company services site (snapshot ghi `unknown`)
- Test scope: content, ui, responsive
- Reference URL: khong co

## Tong quan
Trang la website gioi thieu dich vu B2B cua Alternita Dienstleistungs-GmbH, tap trung vao hosting, buchhaltung, IT/server/network va digital media. Da doc workflow va input snapshot, sau do thu mo `targetUrl` bang Playwright/Chrome that nhung moi truong chay bi chan truy cap mang ra internet (`net::ERR_NETWORK_ACCESS_DENIED`); `Invoke-WebRequest` cung khong ket noi duoc toi remote server. Vi vay phan UI/responsive tren browser that chua the ket luan day du va khong co screenshot/trace hop le. Cac loi ben duoi chi la loi content/link co the doi chieu truc tiep tu snapshot dau vao, khong suy dien them hanh vi dong.

## Danh sach loi

### [MEDIUM] Card/link dich vu IT tro toi URL sai `http://it-/`
- **Vi tri:** Homepage `https://alternita.devseite.top/`, link card/section dich vu IT trong main content; snapshot link co `href="http://it-/"`
- **Muc do:** Medium
- **Buoc tai hien:**
  1. Mo homepage.
  2. Tim card/section dich vu IT, Server, Netzwerk.
  3. Click link/card dich vu tuong ung.
- **Ky vong (Expected):** Link dieu huong toi trang noi bo hop le, kha nang cao la `https://alternita.devseite.top/it-server-netzwerk/`.
- **Thuc te (Actual):** Snapshot ghi link dich vu nay tro toi `http://it-/`, day la URL khong hop le va co the dua nguoi dung ra khoi site hoac den trang loi.
- **Anh huong:** Nguoi dung quan tam dich vu IT co the khong vao duoc trang chi tiet, lam mat lead va gay cam giac site chua san sang ra mat.
- **De xuat sua:** Cap nhat `href` cua card/anchor dich vu IT trong homepage ve URL noi bo dung, dong bo voi link nav `https://alternita.devseite.top/it-server-netzwerk/`.
- **Bang chung:** Snapshot input; khong co screenshot vi browser bi chan truy cap mang trong moi truong test.

### [MEDIUM] Link email hien thi va dia chi `mailto` khong khop
- **Vi tri:** Footer/contact tren homepage; link text `E-Mail: hosting@alternita.gmbh`
- **Muc do:** Medium
- **Buoc tai hien:**
  1. Mo homepage.
  2. Cuon den footer/contact.
  3. Click link email hien thi `hosting@alternita.gmbh`.
- **Ky vong (Expected):** `mailto` phai dung voi email hien thi, vi du `mailto:hosting@alternita.gmbh`.
- **Thuc te (Actual):** Snapshot ghi link co `href="mailto:%20info@alternita.com"` trong khi text hien thi la `hosting@alternita.gmbh`.
- **Anh huong:** Email client co the mo dia chi sai, lam that lac yeu cau lien he/lead va tao nham lan ve kenh ho tro chinh thuc.
- **De xuat sua:** Chon mot dia chi email chinh thuc va dong bo ca text hien thi lan `href`; loai bo khoang trang encoded `%20` trong `mailto`.
- **Bang chung:** Snapshot input; khong co screenshot vi browser bi chan truy cap mang trong moi truong test.

### [LOW] Nhieu link co text rong trong snapshot
- **Vi tri:** Header/logo va mot so card dich vu tren homepage; snapshot co nhieu anchor text rong nhu link logo, hosting, buchhaltung, text-grafik-video.
- **Muc do:** Low
- **Buoc tai hien:**
  1. Mo homepage.
  2. Kiem tra cac link bang keyboard/screen reader hoac accessibility tree.
  3. Di qua logo/card co anchor khong co accessible text.
- **Ky vong (Expected):** Moi link co ten truy cap ro rang qua text, `aria-label`, hoac alt text anh ben trong.
- **Thuc te (Actual):** Snapshot ghi nhieu link co `text=""`; neu khong co `aria-label`/alt text phu hop tren DOM that, nguoi dung dung cong cu ho tro se kho xac dinh dich den.
- **Anh huong:** Anh huong kha nang truy cap va navigation bang screen reader/keyboard, nhung can browser/accessibility audit de xac nhan muc do thuc te.
- **De xuat sua:** Them `aria-label` mo ta dich den cho logo/card image links, hoac dam bao anh ben trong anchor co `alt` meaningful.
- **Bang chung:** Snapshot input; can test lai tren browser that de xac nhan accessible name.

## Checklist nghiem thu
- [ ] Khong con bug Critical
- [ ] Khong con bug High lien quan business-flow
- [ ] Responsive OK o 3 breakpoint da test
- [ ] Content khop reference (khong ap dung vi khong co referenceUrl)
- [ ] Khong phat hien ro ri du lieu nhay cam

## Pham vi chua test duoc
- Chua kiem tra responsive thuc te o mobile/tablet/desktop vi Playwright/Chrome bi chan truy cap `targetUrl`.
- Chua xac minh layout vo, anh loi, hover/click state va accessibility tree tren DOM live.
- Chua kiem tra link live bang HTTP/browser; cac bug link duoc ghi tu snapshot do extension cung cap.
