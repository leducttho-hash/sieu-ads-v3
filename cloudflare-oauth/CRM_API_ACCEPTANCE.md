# Nguồn CRM API — phạm vi Pilot

Nhánh: `feature/oauth-backend-pilot`, base `187d2a5cccdcecf825af85833c4c4227eacd8b53`.

Build `node cloudflare-oauth/prepare.mjs`. Deploy tiếp tục dùng cấu hình Worker hiện có. Không đổi secrets, D1, schema, OAuth, main hay root index.html.

Nguồn CRM có Dán/File và API CRM; cấu hình người dùng/kênh và dữ liệu theo hồ sơ/kho/kênh được lưu cùng dữ liệu cục bộ hiện tại. API chỉ chạy khi bấm Lấy CRM. Trên Pilot, nút 4/7 ngày luôn lấy 4/7 ngày đã qua trước hôm nay theo giờ Việt Nam, kết thúc hôm qua; không thay presets của Extension. Khoảng ngày sai, thiếu dữ liệu, lỗi CRM hay thay đổi bộ lọc làm chặn xuất API; không tự ghi số 0 thay trường thiếu.

Module chuyển chi tiết đã xác minh thành TSV có header, đưa vào chính parser và bộ ghép mã hiện tại. Không lấy trung bình tỷ lệ; không sửa công thức TLC, quy tắc 8B/L12/TET, link, Daily, Build hoặc Scale.

Phải cập nhật Extension lên 3.2.13 trước khi dùng API. Origin cho phép: `https://sieuads-oauth-pilot.leducttho.workers.dev`; Extension ID giữ nguyên `mopcgklafblfklmngbhccfonefidcajf`. Không cần mở side panel. Module cầu nối nguồn được lưu trong `cloudflare-oauth/extension-bridge/`; ZIP đầy đủ được phát hành riêng.

## Hotfix 3.2.13 — đúng endpoint chi tiết MESS

Request URL do người dùng xác nhận là `https://bituchat-report-api.vuihoc.vn/api/v1/marketing/report/rows`. Cầu nối cũ gọi `/marketing/report`, là hợp đồng số tổng đang dùng trong BC Ngày/BCKG, rồi đọc nó như hợp đồng chi tiết có metaData. Đây là sai endpoint; nới chốt page trước đó không giải quyết được nguyên nhân.

Chỉ đổi URL trong module cầu nối sang `/report/rows`. Không đổi CRM_MESS_API_BASE hoặc mã BC Ngày/BCKG cũ, UI Pilot, OAuth, presets, công thức, ghép mã, bộ lọc hay cache. Lọc nhân sự bằng ID đã xác minh, không đưa chuỗi tìm tên giao diện vào nguồn báo cáo.

Bổ sung kiểm thử HTTP phân biệt endpoint tổng với endpoint rows (không dùng cùng một mock cho mọi đường dẫn). Hai response chi tiết mới được kiểm tra riêng: lấy đủ hai trang và đối chiếu cả sáu tổng; tỷ lệ null và các dòng hội thoại bằng 0 nhưng có contact/đơn được giữ. Dữ liệu CRM thật không được đưa vào repository công khai; bài test trong repository dùng dữ liệu tổng hợp. Kiểm thử không đăng nhập CRM thật và không ghi Sheet.

## Hotfix 3.2.12 (lịch sử)

Ảnh lỗi `CRM thiếu hoặc sai page` xác định nhánh chặn ở parser pagination; chưa có response thực tế mới để khẳng định kiểu giá trị `page` nào đã được trả. Không giả định đây là lỗi đăng nhập. Parser không bắt buộc echo page: traversal dùng page request, nhưng vẫn yêu cầu tổng số dòng, chiều dài từng trang, khóa dòng không trùng và sáu tổng khớp. Giá trị page được trả rõ ràng mà mâu thuẫn/sai dạng vẫn bị từ chối. Hỗ trợ chuỗi số nguyên, alias currentPage/per_page, giới hạn page size của server; không nới kiểm tra chỉ số tài chính.

Khung CRM có ID riêng để chặn rule CSS cũ kéo giãn section-head. Preview mã dùng chính kết quả parser hiện tại, có tìm và phân trang cục bộ, không tạo request CRM. Snapshot cũ giữ lại và gắn nhãn Mã lần lấy trước khi đổi bộ lọc; chặn xuất vẫn giữ nguyên.

## Kết quả kiểm tra ban đầu và kiểm tra bổ sung

### UI range-v3 — chỉ giao diện Pilot

- Ba header Meta/CRM/Link dùng chung chiều cao và lề trong vùng report input được đánh dấu riêng; bỏ flex kéo giãn header. Style không áp dụng cho Daily/Build/Scale hoặc modal cấu hình khác.
- Một nút khoảng ngày mở hai lịch tháng. Chọn ngày đầu/cuối rồi Áp dụng; có hủy và Escape. Đổi tháng/chọn ngày/Áp dụng không gọi CRM. Ngày tương lai bị khóa; một ngày và chọn ngược được xử lý rõ ràng.
- 4/7 ngày lấy đến hôm qua theo Asia/Ho_Chi_Minh, không bám ngày kết thúc cũ. Ví dụ 22/11: 4 ngày = 18–21/11, 7 ngày = 15–21/11. Custom range vẫn có thể chứa hôm nay.
- Bảng mã luôn nằm dưới controls ở chế độ API, không nằm trong details. Snapshot khôi phục vẫn hiện mã mà không gọi lại API. Có tìm và phân trang xem cục bộ.
- Thêm cache key cho CSS và dấu data-crm-ui=range-v3 để phân biệt bản giao diện. Root index.html, Extension 3.2.12, bridge, công thức và ghép mã giữ nguyên.

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
