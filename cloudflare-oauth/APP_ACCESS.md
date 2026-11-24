# Pilot: yêu cầu đăng nhập Google trước khi vào chương trình

- Origin triển khai giữ nguyên; không đổi Main, root index, nguồn dữ liệu, công thức hay Extension.
- Worker kiểm tra phiên Google hiện có trước khi trả HTML/JS/CSS riêng của app. `assets.run_worker_first=true` là bắt buộc: chỉ kiểm tra trong JavaScript hoặc chỉ ẩn nút tải không bảo vệ được asset tĩnh.
- Người chưa có phiên nhận màn hình chọn hồ sơ + Đăng nhập bằng Google. Chỉ callback Google xác minh email thuộc ALLOWED_USERS mới tạo được phiên. Client kiểm tra lại phiên truy cập server trước khi chuyển vào app. Luồng đăng nhập chỉ xin openid/email, không xin quyền Sheets/Drive hay refresh token; kết nối đọc nguồn là luồng riêng hiện có.
- Phiên có cookie Secure/HttpOnly/SameSite và thời hạn đang cấu hình. Không lưu mật khẩu Google, token hoặc khóa mới trong trình duyệt. Giữ nguyên scope của luồng kết nối nguồn, danh sách email, khóa mã hóa và schema D1. Phiên đăng nhập riêng dùng cookie mã hóa ràng buộc hồ sơ, email, Google subject, hạn và session server; không giả làm kết nối nguồn.
- Giữ công khai riêng các trang About/Privacy/Terms và CSS của các trang này để phục vụ thông tin ứng dụng/Google consent.
- Đã đăng nhập thì tải app với Cache-Control no-store, bỏ cache validators; phiên bị gỡ quyền sẽ bị chặn ở request tiếp theo. Back/forward cache buộc tải lại để kiểm tra phiên.
- Build bỏ link Tải HTML và thay bằng Đăng xuất. Logout có kiểm tra phiên, Origin và CSRF, xóa đúng các phiên thuộc cookie trình duyệt hiện tại; không revoke Google grant hay xóa dữ liệu cục bộ/Sheet. Khởi động chọn hồ sơ đã xác thực nếu hồ sơ cục bộ cũ không có phiên.

## Giới hạn cần xử lý ngoài bản triển khai

Repository hiện có visibility public. Lớp đăng nhập Worker không thay đổi quyền GitHub, GitHub Pages, các bản deploy/HTML cũ hoặc mã đã được tải. Chủ repository cần chuyển Private và kiểm tra/tắt các bản phát hành công khai cũ nếu muốn hạn chế tiếp cận mã nguồn. Người dùng đã được cấp quyền vẫn có thể xem/lưu mã phía trình duyệt; không có cam kết chống sao chép HTML/JavaScript sau khi đã cấp nó cho trình duyệt. Đây không phải cơ chế phân quyền các dữ liệu đã có trong IndexedDB trên một máy dùng chung.

## Kiểm thử

- 22 kiểm tra truy cập/phiên/OAuth/login/logout dùng Node SQLite và Google giả lập, không gọi Google hoặc ghi Sheet thật.
- 56 kiểm tra hồi quy hiện có của Pilot và hai bộ kiểm tra backend/client đã có (tổng 80 test cases).
- DOM mô phỏng: vào đúng hồ sơ Google, không còn Tải HTML, còn nút Đăng xuất, không lỗi JavaScript.
- Nghiệm thu live: cửa sổ chưa đăng nhập chỉ thấy màn hình đăng nhập; link asset trực tiếp bị chặn; đăng nhập đúng Google vào app; tài khoản ngoài allowlist không vào; đăng xuất rồi Back/F5 phải yêu cầu đăng nhập.
