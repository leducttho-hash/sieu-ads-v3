# Siêu Ads — OAuth Backend thử nghiệm

Bản thử độc lập với GitHub Pages đang dùng. Không đổi `index.html` gốc, không gọi Vercel hoặc Supabase. Build tạo một bản giao diện riêng trong `public/`, giữ lõi Daily, Page, Title, Scale và báo cáo hiện tại.

## Trạng thái

- Đã có backend và adapter cho giao diện hiện tại.
- Kiểm thử OAuth, tự gia hạn, mã hóa, cô lập hồ sơ, lỗi mạng và thu hồi quyền dùng Google giả lập; không đọc file công ty trong kiểm thử.
- Chưa xác minh đăng nhập Google thật, triển khai Cloudflare hoặc hiệu năng CPU trên gói Free. Chỉ chuyển sang dùng chính sau khi nghiệm thu thực tế.

## Thiết kế

- OAuth Authorization Code + PKCE, `access_type=offline`, quyền `openid email`, Sheets readonly và Drive readonly khi chọn Excel.
- Email xác minh từ Google phải thuộc danh sách server cho đúng hồ sơ. ID hồ sơ do trình duyệt gửi không tự cấp quyền.
- Refresh/access token được mã hóa AES-GCM trước khi lưu; AAD ràng buộc profile + Google subject. Khóa và client secret nằm trong Worker Secrets, không ghi Git hoặc backup.
- Phiên trình duyệt dùng cookie Secure/HttpOnly/SameSite, mặc định 14 ngày. Đây là thời hạn phiên ứng dụng, không phải cam kết thời hạn quyền Google.
- State và phiên dùng D1; state chỉ dùng một lần, khóa gia hạn nguyên tử để tránh ghi đè khi có nhiều yêu cầu cùng lúc. D1 được chọn thay KV cho các thao tác cần nhất quán này.
- Backend chỉ gọi các đường dẫn Google GET phục vụ đọc Sheets hoặc tải `.xlsx`; giới hạn 20 MB. Không ghi file Google, không tính công thức Excel, không tự đồng bộ theo lịch.
- File được truyền về browser worker hiện có để phân tích. Token Google không được gửi về trình duyệt.
- Không tự ghi log URL callback, auth code, token, cookie hay nội dung file.

## Chạy kiểm thử và build

Tại thư mục này, với Node 24:

```sh
npm test
npm run build
```

Kiểm thử dùng `node:sqlite` trong bộ nhớ và Google giả lập, không cần credentials. Build cần các assets đã có ở gốc repository.

## Cấu hình triển khai riêng

1. Đăng nhập Cloudflare. Tạo Worker `sieuads-oauth-pilot` và **database D1 mới** `sieuads-oauth-pilot-auth`. Không dùng database của dự án khác.
2. Chạy `schema.sql` trên đúng D1 mới. Gắn binding `AUTH_DB`. Điền ID D1 vào `wrangler.jsonc`.
3. Đặt `APP_ORIGIN` bằng đúng origin HTTPS của bản thử (không dấu `/` cuối). Giữ `SESSION_DAYS=14` hoặc chọn từ 1 đến 30 ngày.
4. Tạo OAuth client Web Application riêng trong Google Cloud, thêm Redirect URI `<APP_ORIGIN>/auth/callback`. Bản thử không dùng callback của GitHub Pages.
5. Thiết lập Worker Secrets, nhập trực tiếp trên dashboard hoặc secure CLI; **không gửi qua chat và không commit**:
   - `GOOGLE_CLIENT_ID`: client ID của bản thử.
   - `GOOGLE_CLIENT_SECRET`: secret của client đó.
   - `TOKEN_ENCRYPTION_KEY`: 32 byte ngẫu nhiên, mã hóa base64url. Tạo và giữ qua công cụ quản lý bí mật. Không thay khóa khi đã có kết nối nếu chưa có quy trình chuyển khóa.
   - `ALLOWED_USERS`: JSON ánh xạ chính xác email Google được dùng để đọc nguồn cho từng hồ sơ. Ví dụ cấu trúc sau chỉ là placeholder, phải thay bằng tài khoản thật đã xác minh:

```json
{"ThoLD":["THO_EMAIL"],"Mynnh":["MY_EMAIL"],"Huyenbtt":["HUYEN_EMAIL"]}
```

Có thể cho phép nhiều email trong một hồ sơ nếu cần dùng cả Gmail và email công ty. Mỗi lần kết nối, cookie của hồ sơ đó gắn với **một** tài khoản Google cụ thể. Hệ thống không cộng quyền của hai email. Chuyển tài khoản thì kết nối lại bằng đúng email.

6. Trên Cloudflare Git build, chọn nhánh `feature/oauth-backend-pilot`, build `node cloudflare-oauth/prepare.mjs`, deploy `npx wrangler deploy --config cloudflare-oauth/wrangler.jsonc`, root repository.
7. Nếu app vẫn External/Testing, thêm đúng test users và dự kiến cấp quyền lại sau 7 ngày. Đánh giá trạng thái Published/ngoại lệ sử dụng cá nhân với nhóm nhỏ hoặc chính sách Workspace trước khi coi là kết nối lâu dài. Không tự đổi sang Internal cho các tài khoản Gmail cá nhân.
8. Mỗi người tự đăng nhập và chấp thuận quyền Google trong popup. Không đưa mật khẩu, auth code hoặc refresh token cho người triển khai.

URL bản thử thay đổi origin lưu trữ trình duyệt: tải backup từ web hiện tại, rồi nhập backup tại bản thử. Không xóa dữ liệu ở web hiện tại. Import không chuyển token cũ; backend dùng kết nối Google riêng. Không gửi backup qua server.

## Nghiệm thu trước khi chuyển sang dùng chính

- Thọ/My/Huyền kết nối đúng email thật; thử cả tài khoản sai và truy cập sai hồ sơ.
- Đọc thành công nguồn Google Sheet Restricted và `.xlsx` Restricted; so sánh số mã, Header, nội dung, MIX và Page với nguồn thật.
- F5, đóng/mở lại tab, đổi Kho/kênh/hồ sơ: đúng kết nối; không lấy cấu hình từ modal đã đóng.
- Xác minh token được tự gia hạn bằng thời điểm hết hạn thực hoặc công cụ kiểm thử server; không sửa thời hạn Google trong browser.
- Thu hồi quyền: yêu cầu kết nối lại và giữ Catalog/Daily. Không tự thử lại liên tục khi 403/404/429.
- Hai lần Đồng bộ gần nhau: một lần gia hạn, kết quả không lẫn Kho.
- Đối chiếu Page/Title, hậu tố 8B, Scale và XLSX từ dữ liệu thật với bản đang dùng.
- Đo CPU/request và sử dụng D1 trên Cloudflare Free trước khi cam kết không phát sinh chi phí. Không bật gói trả phí trong quy trình này.

## Ngắt và khôi phục

`Ngắt` thu hồi grant Google cho OAuth client này rồi xóa kết nối và phiên ứng dụng liên quan. Google có thể thu hồi các scope khác của cùng tài khoản/client; bản thử dùng client riêng để tránh ảnh hưởng bản chính. Cần cấp quyền lại để dùng tiếp.

Nếu bản thử gặp lỗi, quay về GitHub Pages đang dùng. Mã chính và dữ liệu trên origin cũ không bị thay thế. Giữ khóa mã hóa ở nơi an toàn; mất khóa thì cần kết nối lại, không thể giải mã refresh token đã lưu.
