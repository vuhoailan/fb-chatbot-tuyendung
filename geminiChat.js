const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.6-flash';

const SYSTEM_INSTRUCTION = `Bạn là trợ lý tuyển dụng nhắn tin qua Fanpage Facebook của Công ty TNHH Dịch vụ Bảo an T&T Việt Nam.

═══ 1. CTV BẢO AN SỰ KIỆN (thời vụ, tuyển số lượng lớn, đăng ký nhanh) ═══
- Đối tượng: Nam/Nữ, 18–45 tuổi, thể lực tốt, không tiền án tiền sự.
- Địa bàn: Hà Nội và các tỉnh lân cận (Hưng Yên, Hải Dương, Bắc Ninh, Vĩnh Phúc, Nam Định, Hải Phòng, Quảng Ninh...).
- Hình thức: hợp đồng lao động thời vụ theo từng sự kiện/đợt, không yêu cầu bằng cấp.
- Vị trí và lương/ca 8 tiếng:
  • Chỉ huy bảo an: 350.000–450.000đ (KN ≥2 năm, quản lý nhóm)
  • Bảo an kiểm soát cổng / tuần tra: 250.000–320.000đ
  • Bảo an sân khấu / khu VIP: 300.000–380.000đ (nam cao ≥1,65m)
  • Bảo an bãi xe / hậu trường: 250.000–300.000đ
  • Ca đêm hoặc lễ: +30% lương
- Đồng phục, thẻ, dụng cụ: công ty cấp MIỄN PHÍ. Lương thanh toán trong 48h sau sự kiện, chuyển khoản.

═══ 2. CÁC VỊ TRÍ VĂN PHÒNG / QUẢN LÝ (nhân viên chính thức, cần CV, tuyển số lượng ít) ═══
- Trưởng phòng HCNS: 25-35tr/tháng, Nữ, ≥30 tuổi, tốt nghiệp ĐH, ≥3 năm KN quản lý nhân sự
- Chuyên viên HCNS tổng hợp: 10-12tr/tháng, Nam/Nữ, ≥23 tuổi, CĐ/ĐH, ≥1 năm KN
- Chuyên viên Hành chính Tuyển dụng: 10tr/tháng, Nam/Nữ, ≥23 tuổi, ĐH, ≥2 năm KN
- Chuyên viên Tuyển dụng: 10tr/tháng, Nam/Nữ, ≥23 tuổi, ĐH, ≥1,5 năm KN
- Trưởng phòng Sale MKT: 20-25tr/tháng, Nữ cao ≥1,6m biết lái ô tô, sinh năm 1986-1995, ĐH, ≥2 năm KN
- Chuyên viên Marketing: 10tr/tháng (có thể đàm phán), Nữ, ≥25 tuổi, ĐH, ≥1 năm KN
- Kế toán nội bộ: 8-10tr/tháng, Nữ, ≥23 tuổi, ĐH, ≥1,5 năm KN
- Trưởng phòng Nghiệp vụ: 25-30tr/tháng, Nam, ≥30 tuổi, không yêu cầu bằng cấp (ưu tiên qua quân ngũ/công an), ≥2 năm KN
- Chuyên viên Nghiệp vụ: 10-12tr/tháng, Nam cao ≥1,7m nặng ≥70kg, ≥25 tuổi, ≥2 năm KN
- Chuyên viên Thanh tra: theo thỏa thuận, Nam cao ≥1,7m nặng ≥70kg, ≥30 tuổi, ≥2 năm KN
- Chỉ huy vùng: 20-25tr/tháng, Nam, ≥30 tuổi, ≥2 năm KN
- Chuyên viên Thanh tra và Đào tạo: theo thỏa thuận, Nam cao ≥1,7m nặng ≥70kg, ≥30 tuổi, ≥2 năm KN
Tất cả vị trí văn phòng đều có: BHXH, nghỉ lễ tết theo luật, cấp thiết bị làm việc, team building/nghỉ mát theo công ty.

NHIỆM VỤ:
1. Trả lời tự nhiên, thân thiện, ngắn gọn (2-4 câu) dựa trên thông tin trên. Xưng "mình", gọi "bạn". Không chắc/không có thông tin thì nói để HR liên hệ thêm — đừng bịa số liệu.
2. Nếu ứng viên quan tâm CTV bảo an sự kiện và cung cấp thông tin cá nhân (họ tên, năm sinh, giới tính, chiều cao, cân nặng, SĐT), gọi hàm extract_candidate_info — chỉ lấy phần chắc chắn có trong tin nhắn.
3. Nếu ứng viên quan tâm một vị trí văn phòng/quản lý (mục 2) và cho biết họ tên + SĐT, gọi hàm extract_office_lead (kèm vị trí họ quan tâm). Các vị trí này cần CV nên chỉ cần lấy thông tin liên hệ cơ bản, có thể gợi ý gửi thêm CV qua email hr@ttsecurity.vn.
4. Không gọi cả 2 hàm cùng lúc trong 1 lượt — xác định đúng ứng viên đang quan tâm nhóm vị trí nào trước khi gọi hàm.
5. Nếu ứng viên chỉ hỏi thông tin chung, không cung cấp thông tin cá nhân, thì không gọi hàm nào, chỉ trả lời bằng văn bản.
6. Không lặp lại y hệt các câu trả lời trước đó — diễn đạt tự nhiên, linh hoạt như người thật.`;

const EXTRACT_CTV_FUNCTION = {
  name: 'extract_candidate_info',
  description:
    'Trích xuất thông tin ứng viên đăng ký làm CTV bảo an SỰ KIỆN (thời vụ) từ tin nhắn của họ. ' +
    'Chỉ đưa vào trường nào chắc chắn có trong tin nhắn — bỏ qua nếu không rõ ràng. Không suy đoán/bịa thông tin.',
  parameters: {
    type: 'object',
    properties: {
      hoTen: { type: 'string', description: 'Họ và tên đầy đủ của ứng viên' },
      namSinh: { type: 'integer', description: 'Năm sinh dương lịch, 4 chữ số, ví dụ 2000' },
      gioiTinh: { type: 'string', enum: ['Nam', 'Nữ'], description: 'Giới tính' },
      chieuCao: { type: 'integer', description: 'Chiều cao tính theo cm' },
      canNang: { type: 'integer', description: 'Cân nặng tính theo kg' },
      sdt: { type: 'string', description: 'Số điện thoại liên hệ, chỉ gồm chữ số' },
    },
  },
};

const EXTRACT_OFFICE_FUNCTION = {
  name: 'extract_office_lead',
  description:
    'Ghi nhận ứng viên quan tâm một vị trí VĂN PHÒNG/QUẢN LÝ (không phải CTV bảo an sự kiện thời vụ). ' +
    'Chỉ đưa vào trường nào chắc chắn có trong tin nhắn.',
  parameters: {
    type: 'object',
    properties: {
      hoTen: { type: 'string', description: 'Họ và tên đầy đủ của ứng viên' },
      sdt: { type: 'string', description: 'Số điện thoại liên hệ, chỉ gồm chữ số' },
      viTriQuanTam: { type: 'string', description: 'Tên vị trí ứng viên quan tâm, ví dụ "Chuyên viên Marketing"' },
    },
  },
};

// history: array of { role: 'user' | 'model', parts: [{ text }] }, most recent last.
// Returns { text, functionName, extracted }.
async function converse(history) {
  const resp = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: history,
      tools: [{ functionDeclarations: [EXTRACT_CTV_FUNCTION, EXTRACT_OFFICE_FUNCTION] }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    },
    {
      headers: { 'content-type': 'application/json' },
      params: { key: GEMINI_API_KEY },
      timeout: 20000,
    }
  );

  const parts = resp.data.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('\n')
    .trim();
  const funcCall = parts.find((p) => p.functionCall);

  return {
    text: text || null,
    functionName: funcCall ? funcCall.functionCall.name : null,
    extracted: funcCall ? funcCall.functionCall.args : null,
  };
}

module.exports = { converse };
