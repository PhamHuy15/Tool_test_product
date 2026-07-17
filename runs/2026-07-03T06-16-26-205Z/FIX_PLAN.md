# Fix Plan - https://alternita.devseite.top/

## Uu tien 1 - Phai sua truoc khi ra mat (Critical/High)
Khong ghi nhan bug Critical/High trong pham vi co the kiem tra. Can chay lai Playwright tren moi truong co network de xac nhan UI/responsive truoc khi go-live.

## Uu tien 2 - Nen sua som (Medium)
1. [MEDIUM] Link dich vu IT sai `http://it-/` - Cap nhat anchor/card homepage ve URL noi bo dung `https://alternita.devseite.top/it-server-netzwerk/`; kiem tra lai tat ca card dich vu bang click test - effort: nho.
2. [MEDIUM] Email hien thi va `mailto` khong khop - Dong bo text footer/contact va `href` ve cung mot email chinh thuc, vi du `mailto:hosting@alternita.gmbh`; xoa `%20` dau chuoi - effort: nho.

## Uu tien 3 - Co the de sau (Low)
1. [LOW] Link text rong - Them accessible name cho logo va card image links bang `aria-label` hoac alt text co y nghia; xac minh bang accessibility tree/browser audit - effort: nho-vua.

## Ghi chu ky thuat
Hai loi Medium co kha nang nam trong template homepage/footer cua WordPress theme hoac page builder. Nen sua truc tiep tai component/section sinh anchor thay vi chi redirect tam thoi, de tranh link sai tiep tuc xuat hien trong sitemap, SEO crawl va accessibility tree.
