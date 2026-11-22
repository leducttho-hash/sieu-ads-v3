# Nguồn CRM API — phạm vi Pilot

Nhánh: `feature/oauth-backend-pilot`, base `187d2a5cccdcecf825af85833c4c4227eacd8b53`.

Build `node cloudflare-oauth/prepare.mjs`. Deploy tiếp tục dùng cấu hình Worker hiện có. Không đổi secrets, D1, schema, OAuth, main hay root index.html.

Nguồn CRM có Dán/File và API CRM; cấu hình người dùng/kênh và dữ liệu theo hồ sơ/kho/kênh được lưu cùng dữ liệu cục bộ hiện tại. API chỉ chạy khi bấm Lấy CRM. Nút 4/7 ngày tính cả ngày kết thúc. Khoảng ngày sai, thiếu dữ liệu, lỗi CRM hay thay đổi bộ lọc làm chặn xuất API; không tự ghi số 0 thay trường thiếu.

Module chuyển chi tiết đã xác minh thành TSV có header, đưa vào chính parser và bộ ghép mã hiện tại. Không lấy trung bình tỷ lệ; không sửa công thức TLC, quy tắc 8B/L12/TET, link, Daily, Build hoặc Scale.

Phải cập nhật Extension lên 3.2.12 trước khi dùng API. Origin cho phép: `https://sieuads-oauth-pilot.leducttho.workers.dev`; Extension ID giữ nguyên `mopcgklafblfklmngbhccfonefidcajf`. Không cần mở side panel. Module cầu nối nguồn được lưu trong `cloudflare-oauth/extension-bridge/`; ZIP đầy đủ được phát hành riêng.

## Hotfix 3.2.12

Ảnh lỗi `CRM thiếu hoặc sai page` xác định nhánh chặn ở parser pagination; chưa có response thực tế mới để khẳng định kiểu giá trị `page` nào đã được trả. Không giả định đây là lỗi đăng nhập. Parser không bắt buộc echo page: traversal dùng page request, nhưng vẫn yêu cầu tổng số dòng, chiều dài từng trang, khóa dòng không trùng và sáu tổng khớp. Giá trị page được trả rõ ràng mà mâu thuẫn/sai dạng vẫn bị từ chối. Hỗ trợ chuỗi số nguyên, alias currentPage/per_page, giới hạn page size của server; không nới kiểm tra chỉ số tài chính.

Khung CRM có ID riêng để chặn rule CSS cũ kéo giãn section-head. Preview mã dùng chính kết quả parser hiện tại, có tìm và phân trang cục bộ, không tạo request CRM. Snapshot cũ giữ lại và gắn nhãn Mã lần lấy trước khi đổi bộ lọc; chặn xuất vẫn giữ nguyên.

## Kết quả kiểm tra ban đầu và kiểm tra bổ sung

- 26 kiểm tra cầu nối trên JSON thật được cấp, gồm MESS 135 dòng/3 trang và CĐ 110 dòng/2 cấp học.
- 11 kiểm tra DOM/sự kiện: không tự gọi, nút 4/7 ngày, manual/API tương đương, chặn xuất khi đổi ngày, scope, phản hồi đến muộn, giữ dữ liệu khi đổi tab, lưu/tải lại, khôi phục backup toàn bộ và không có token trong dữ liệu backup.
- 25 kiểm tra hồi quy Pilot hiện có, 13 kiểm tra độc lập có thể chạy từ repository; 70 kiểm tra hồi quy Extension 3.2.10.
- Root index.html và runtime Extension cũ được kiểm tra byte/hash, giữ nguyên.

Kiểm thử không gọi CRM/Sheet thật, không ghi dữ liệu lên Sheet. Chromium thật không chạy được trong môi trường kiểm tra hiện tại; cần nghiệm thu Chrome thật sau cập nhật. Video người dùng chỉ minh họa thao tác, không là oracle nghiệm thu tổng đầu ra.

## Nghiệm thu trực tiếp

1. Cập nhật đúng thư mục Extension cũ → Tải lại. F5 Pilot.
2. Với từng hồ sơ/kênh, chọn nhân sự rồi chọn cùng khoảng ngày như CRM.
3. Bấm Lấy CRM. MESS phải tải đủ trang, CĐ đủ hai cấp học.
4. Cùng file Meta/link và cùng cấu hình: so API với cách dán thủ công từng mã, chỉ số, CRM-only, file XLSX/TSV và công thức.
5. Đổi ngày không tự gọi, xuất phải yêu cầu lấy lại; đổi tab giữ snapshot; đổi hồ sơ không lẫn tên/dữ liệu; F5/backup khôi phục giữ cấu hình.
6. Nếu API chưa dùng được, chuyển Dán/File. Không cần thay đổi cấu hình Google, mã CRM_TOKEN hay lịch Auto Báo Cáo đang chạy.
