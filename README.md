# Chatbot Messenger — Tuyển dụng CTV bảo vệ

Bot Messenger trên Fanpage: hỏi ứng viên vài câu (họ tên, năm sinh, giới tính,
chiều cao, cân nặng, SĐT) rồi tự động ghi vào bảng "Danh sách bảo vệ" trong
Lark Base đã dùng cho dự án Tràng Tiền Plaza.

## Việc cần làm, theo thứ tự

### A. Tạo Facebook App (Messenger)

1. Vào https://developers.facebook.com/apps → **Create App** → chọn loại
   **Business** → đặt tên bất kỳ (VD: "Chatbot tuyển dụng").
2. Trong Dashboard của app, ở mục **Add products**, chọn **Messenger** → **Set up**.
3. Trong "Access Tokens", bấm **Add or Remove Pages** → đăng nhập bằng tài
   khoản Facebook đang quản lý Fanpage công ty → chọn đúng Fanpage → cấp quyền.
4. Sau khi thêm xong, bấm **Generate Token** cạnh tên Fanpage → copy chuỗi
   token này lại — đây là `FB_PAGE_ACCESS_TOKEN`.
5. Tự đặt một chuỗi bất kỳ (VD: `botbaove2026xyz`) làm `FB_VERIFY_TOKEN` —
   chuỗi này bạn tự nghĩ ra, không lấy từ đâu cả, dùng để Facebook xác minh
   webhook ở bước D.

> Lưu ý: nếu app đang ở chế độ **Development**, bot chỉ chat được với các tài
> khoản Facebook có vai trò Admin/Developer/Tester trong app đó. Muốn công
> khai cho mọi khách hàng nhắn tin, cần chuyển app sang **Live mode** (Facebook
> có thể yêu cầu xác minh doanh nghiệp — việc này làm sau khi bot chạy ổn).

### B. Lấy Lark App Secret

Base đang dùng app tự xây `cli_aa0b761c8d78ded2` (đã có quyền `bitable:app`).
Vào https://open.larksuite.com → **Developer Console** → chọn app này →
mục **Credentials & Basic Info** → copy **App Secret** → đây là `LARK_APP_SECRET`.

### C. Deploy code lên Render (miễn phí)

1. Đưa thư mục `fb-chatbot-tuyendung` này lên một repo GitHub (có thể để
   private).
2. Vào https://render.com → đăng ký/đăng nhập (dùng tài khoản GitHub cho
   nhanh) → **New** → **Web Service** → chọn repo vừa đẩy lên.
3. Cấu hình:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Mục **Environment Variables**, thêm đúng các biến trong file `.env.example`
   (điền giá trị thật, KHÔNG commit file `.env` thật lên GitHub):
   - `FB_VERIFY_TOKEN`
   - `FB_PAGE_ACCESS_TOKEN`
   - `COMPANY_NAME`
   - `LARK_APP_ID`
   - `LARK_APP_SECRET`
   - `LARK_BASE_APP_TOKEN`
   - `LARK_TABLE_ID`
5. Bấm **Create Web Service**. Sau khi build xong, Render cho một URL dạng
   `https://ten-app-cua-ban.onrender.com`.

> Free tier của Render sẽ "ngủ" sau ~15 phút không có ai gọi tới, lần nhắn
> tin đầu tiên sau khi ngủ có thể chậm vài giây trong lúc server khởi động
> lại — sau đó chạy bình thường. Nếu công ty cần phản hồi tức thời 24/7, có
> thể nâng cấp gói trả phí thấp nhất của Render sau.

### D. Khai báo Webhook trên Facebook App

1. Quay lại Messenger settings của app Facebook (bước A) → mục **Webhooks**
   → **Add Callback URL**.
2. **Callback URL**: `https://ten-app-cua-ban.onrender.com/webhook`
3. **Verify Token**: đúng chuỗi `FB_VERIFY_TOKEN` đã đặt ở bước A5.
4. Sau khi verify thành công, tick chọn các trường cần subscribe:
   `messages`, `messaging_postbacks`.
5. Ở mục **Webhooks** cũng cần bấm **Subscribe** app này vào đúng Fanpage.

### E. Test thử

Nhắn tin vào Fanpage (bằng tài khoản Facebook đã cấp quyền tester nếu app
còn ở Development mode), gõ "đăng ký" để bắt đầu luồng hỏi thông tin.

Sau khi bấm "Xác nhận" ở bước cuối, kiểm tra trong Lark Base bảng
"Danh sách bảo vệ" xem đã có dòng mới chưa.

## Đã xác nhận với Base thật (2026-09-14)

Tên cột trong `larkBase.js` đã được kiểm tra và test ghi/xoá thử trực tiếp
trên bảng "Danh sách bảo vệ" thật — hoạt động đúng. Ghi chú:
- `Năm sinh` là cột kiểu Text trong bảng này nên code gửi dạng chuỗi, không
  phải số.
- Cột chiều cao/cân nặng thật tên là `Chiều cao (cm)` / `Cân nặng (kg)`.
- Cột `Mã NV` (mã UV) cố tình để trống — HR tự đánh số thủ công sau, bot
  không tự sinh mã để tránh trùng số với người khác đang được nhập song
  song.

## Ghi chú khác

- Bot lưu trạng thái hội thoại trong bộ nhớ (RAM) — nếu server Render khởi
  động lại giữa chừng, ứng viên đang trả lời dở sẽ phải gõ lại "đăng ký" từ
  đầu. Chấp nhận được ở quy mô nhỏ; nếu cần bền hơn, có thể nâng cấp lưu
  trạng thái vào một Bitable/DB riêng sau.
- Ứng viên dưới 18 tuổi vẫn được ghi nhận nhưng có gắn chú thích "cần HR xét
  duyệt riêng" ở cột Ghi chú, theo đúng quy định hiện tại của công ty (mặc
  định loại, trừ trường hợp cấp bách do HR quyết định) — bot không tự động
  từ chối.
- Không commit file `.env` thật (chứa token/secret) lên GitHub — đã có trong
  `.gitignore`.
