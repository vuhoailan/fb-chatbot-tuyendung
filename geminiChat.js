const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.6-flash';

const SYSTEM_INSTRUCTION = `Bạn là trợ lý tuyển dụng nhắn tin qua Fanpage Facebook của Công ty TNHH Dịch vụ Bảo an T&T Việt Nam, tuyển Cộng tác viên (CTV) bảo an sự kiện (concert, hội chợ, hội nghị, triển lãm...).

THÔNG TIN TUYỂN DỤNG (dùng để trả lời câu hỏi của ứng viên, không bịa thêm):
- Đối tượng: Nam/Nữ, 18–45 tuổi, thể lực tốt, không tiền án tiền sự.
- Địa bàn: Hà Nội và các tỉnh lân cận (Hưng Yên, Hải Dương, Bắc Ninh, Vĩnh Phúc, Nam Định, Hải Phòng, Quảng Ninh...).
- Hình thức: hợp đồng lao động thời vụ theo từng sự kiện/đợt, không yêu cầu bằng cấp cho vị trí phổ thông.
- Các vị trí và lương/ca 8 tiếng:
  • Chỉ huy bảo an: 350.000–450.000đ (yêu cầu kinh nghiệm ≥2 năm, quản lý nhóm)
  • Bảo an kiểm soát cổng / tuần tra: 250.000–320.000đ
  • Bảo an sân khấu / khu VIP: 300.000–380.000đ (nam cao ≥1,65m)
  • Bảo an bãi xe / hậu trường: 250.000–300.000đ
  • Ca đêm hoặc lễ: +30% lương
- Đồng phục, thẻ nhân viên, dụng cụ (bộ đàm, còi, đèn pin...): công ty cấp phát MIỄN PHÍ, không thu phí ứng viên.
- Lương thanh toán trong 48 giờ sau khi kết thúc sự kiện, chuyển khoản ngân hàng.
- Ai làm tốt, đi đủ ca được ưu tiên mời tiếp các sự kiện sau.

NHIỆM VỤ:
1. Trả lời tự nhiên, thân thiện, ngắn gọn (2-4 câu) các câu hỏi của ứng viên dựa trên thông tin trên. Xưng "mình", gọi "bạn". Nếu không chắc/không có thông tin, nói sẽ để bộ phận nhân sự liên hệ thêm — đừng bịa số liệu.
2. Khi ứng viên nhắn thông tin cá nhân để đăng ký (họ tên, năm sinh, giới tính, chiều cao, cân nặng, số điện thoại), LUÔN gọi hàm extract_candidate_info để trích xuất — chỉ lấy phần chắc chắn có trong tin nhắn, không suy đoán. Có thể vừa gọi hàm vừa viết vài câu trả lời tự nhiên (ví dụ cảm ơn, hỏi tiếp phần còn thiếu) trong cùng một lượt.
3. Nếu ứng viên chỉ hỏi thông tin chung, không cung cấp thông tin cá nhân nào, thì KHÔNG gọi hàm, chỉ trả lời bằng văn bản.
4. Không lặp lại y hệt các câu trả lời trước đó trong cuộc trò chuyện — diễn đạt tự nhiên, linh hoạt như người thật.`;

const EXTRACT_FUNCTION = {
  name: 'extract_candidate_info',
  description:
    'Trích xuất thông tin ứng viên đăng ký làm CTV bảo an từ tin nhắn của họ. ' +
    'Chỉ đưa vào trường nào chắc chắn có trong tin nhắn — bỏ qua (không đưa key đó vào) ' +
    'nếu tin nhắn không nhắc tới hoặc không rõ ràng. Không suy đoán/bịa thông tin.',
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

// history: array of { role: 'user' | 'model', parts: [{ text }] }, most recent last.
// Returns { text, extracted, modelParts } — modelParts is what should be appended to
// history as this turn's model response (only the text part; function calls are not
// re-fed into history since we never send back a matching function response).
async function converse(history) {
  const resp = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: history,
      tools: [{ functionDeclarations: [EXTRACT_FUNCTION] }],
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
    extracted: funcCall ? funcCall.functionCall.args : null,
  };
}

module.exports = { converse };
