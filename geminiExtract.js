const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.6-flash';

const EXTRACT_FUNCTION = {
  name: 'extract_candidate_info',
  description:
    'Trích xuất thông tin ứng viên đăng ký làm CTV bảo vệ từ tin nhắn của họ. ' +
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

async function extractCandidateInfo(userText) {
  const resp = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      tools: [{ functionDeclarations: [EXTRACT_FUNCTION] }],
      toolConfig: {
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['extract_candidate_info'] },
      },
    },
    {
      headers: { 'content-type': 'application/json' },
      params: { key: GEMINI_API_KEY },
      timeout: 15000,
    }
  );

  const parts = resp.data.candidates?.[0]?.content?.parts || [];
  const call = parts.find((p) => p.functionCall);
  return call ? call.functionCall.args : {};
}

module.exports = { extractCandidateInfo };
