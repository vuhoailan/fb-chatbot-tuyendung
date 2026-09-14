require('dotenv').config();
const express = require('express');
const axios = require('axios');
const larkBase = require('./larkBase');
const geminiExtract = require('./geminiExtract');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const COMPANY_NAME = process.env.COMPANY_NAME || 'công ty';
const MIN_AGE = 18;

const REQUIRED_FIELDS = ['hoTen', 'namSinh', 'gioiTinh', 'chieuCao', 'canNang', 'sdt'];
const FIELD_LABELS = {
  hoTen: 'Họ và tên',
  namSinh: 'Năm sinh',
  gioiTinh: 'Giới tính (Nam/Nữ)',
  chieuCao: 'Chiều cao (cm)',
  canNang: 'Cân nặng (kg)',
  sdt: 'Số điện thoại',
};

const sessions = new Map();

function newSession() {
  return { step: 'collecting', data: {} };
}

function getSession(psid) {
  if (!sessions.has(psid)) sessions.set(psid, newSession());
  return sessions.get(psid);
}

function sanitizeField(key, value) {
  switch (key) {
    case 'hoTen':
      return typeof value === 'string' && value.trim().length >= 2 ? value.trim() : null;
    case 'namSinh': {
      const year = parseInt(value, 10);
      const currentYear = new Date().getFullYear();
      return year && year > currentYear - 80 && year < currentYear - 14 ? year : null;
    }
    case 'gioiTinh':
      return value === 'Nam' || value === 'Nữ' ? value : null;
    case 'chieuCao': {
      const cm = parseInt(value, 10);
      return cm && cm >= 100 && cm <= 230 ? cm : null;
    }
    case 'canNang': {
      const kg = parseInt(value, 10);
      return kg && kg >= 30 && kg <= 200 ? kg : null;
    }
    case 'sdt': {
      const digits = String(value).replace(/[^0-9]/g, '');
      return digits.length >= 9 && digits.length <= 11 ? digits : null;
    }
    default:
      return null;
  }
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object !== 'page') {
    return res.sendStatus(404);
  }

  res.status(200).send('EVENT_RECEIVED');

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      const psid = event.sender && event.sender.id;
      if (!psid) continue;

      try {
        if (event.message && event.message.quick_reply && event.message.quick_reply.payload) {
          await handlePayload(psid, event.message.quick_reply.payload);
        } else if (event.message && event.message.text) {
          await handleText(psid, event.message.text.trim());
        } else if (event.postback) {
          await handlePayload(psid, event.postback.payload);
        }
      } catch (err) {
        console.error('Error handling event:', err.response ? err.response.data : err);
        try {
          await sendText(psid, 'Xin lỗi, hệ thống đang gặp sự cố. Bạn vui lòng thử lại sau ít phút nhé.');
        } catch (sendErr) {
          console.error('Also failed to notify user of the error:', sendErr.response ? sendErr.response.data : sendErr);
        }
      }
    }
  }
});

async function handlePayload(psid, payload) {
  switch (payload) {
    case 'GET_STARTED':
    case 'DANG_KY':
      sessions.set(psid, newSession());
      await sendText(psid, chaoMung());
      await askInfo(psid);
      break;
    case 'XAC_NHAN':
      await submitCandidate(psid);
      break;
    case 'NHAP_LAI':
      sessions.set(psid, newSession());
      await askInfo(psid);
      break;
  }
}

async function handleText(psid, text) {
  const lower = text.toLowerCase();

  if (['dang ky', 'đăng ký', 'bắt đầu', 'bat dau', 'start'].includes(lower)) {
    sessions.set(psid, newSession());
    await sendText(psid, chaoMung());
    await askInfo(psid);
    return;
  }

  const session = getSession(psid);

  if (session.step === 'done') {
    await sendText(psid, 'Thông tin của bạn đã được ghi nhận rồi nhé! Nếu muốn đăng ký thêm một hồ sơ khác, bạn gõ "đăng ký".');
    return;
  }

  let extracted;
  try {
    extracted = await geminiExtract.extractCandidateInfo(text);
  } catch (err) {
    console.error('Gemini extract failed:', err.response ? err.response.data : err.message);
    await sendText(psid, 'Mình đang gặp chút trục trặc khi đọc thông tin, bạn thử gửi lại giúp mình nhé.');
    return;
  }

  let updatedAny = false;
  for (const key of REQUIRED_FIELDS) {
    if (extracted[key] !== undefined && extracted[key] !== null) {
      const clean = sanitizeField(key, extracted[key]);
      if (clean !== null) {
        session.data[key] = clean;
        updatedAny = true;
      }
    }
  }

  const missing = REQUIRED_FIELDS.filter((k) => !session.data[k]);

  if (missing.length > 0) {
    session.step = 'collecting';
    if (!updatedAny) {
      await sendText(
        psid,
        'Mình chưa nhận ra thông tin đăng ký nào trong tin nhắn đó. Bạn thử gửi lại giúp mình: họ tên, năm sinh, giới tính, chiều cao, cân nặng và số điện thoại nhé.'
      );
      return;
    }
    await sendText(psid, `Cảm ơn bạn! Mình còn cần thêm: ${missing.map((k) => FIELD_LABELS[k]).join(', ')}.`);
    return;
  }

  session.step = 'confirm';
  await sendConfirm(psid, session.data);
}

function chaoMung() {
  return `Chào bạn 👋 Cảm ơn bạn đã quan tâm đăng ký làm Cộng tác viên bảo vệ tại ${COMPANY_NAME}. Mình sẽ hỏi bạn vài thông tin cơ bản nhé!`;
}

async function askInfo(psid) {
  await sendText(
    psid,
    'Bạn giới thiệu giúp mình một số thông tin nhé: họ tên, năm sinh, giới tính, chiều cao (cm), cân nặng (kg) và số điện thoại. Cứ gõ tự nhiên thoải mái, mình sẽ tự hiểu 🙂'
  );
}

async function sendConfirm(psid, data) {
  const summary =
    `Bạn kiểm tra lại thông tin giúp mình nhé:\n\n` +
    `👤 Họ tên: ${data.hoTen}\n` +
    `🎂 Năm sinh: ${data.namSinh}\n` +
    `⚧ Giới tính: ${data.gioiTinh}\n` +
    `📏 Chiều cao: ${data.chieuCao} cm\n` +
    `⚖️ Cân nặng: ${data.canNang} kg\n` +
    `📞 SĐT: ${data.sdt}`;

  await sendText(psid, summary);
  await sendQuickReplies(psid, 'Thông tin đã chính xác chưa ạ? (Sai chỗ nào cứ nhắn lại để sửa)', [
    { title: '✅ Xác nhận', payload: 'XAC_NHAN' },
    { title: '✏️ Làm lại từ đầu', payload: 'NHAP_LAI' },
  ]);
}

async function submitCandidate(psid) {
  const session = getSession(psid);
  const { data } = session;

  if (!data.hoTen || !data.sdt) {
    await sendText(psid, 'Có vẻ thông tin chưa đầy đủ, bạn gõ "đăng ký" để bắt đầu lại giúp mình nhé.');
    return;
  }

  const age = new Date().getFullYear() - data.namSinh;
  if (age < MIN_AGE) {
    data.ghiChu = `Đăng ký qua Fanpage — DƯỚI 18 TUỔI (${age} tuổi), cần HR xét duyệt riêng`;
  }

  try {
    await larkBase.addCandidate(data);
    session.step = 'done';
    if (age < MIN_AGE) {
      await sendText(
        psid,
        'Cảm ơn bạn đã đăng ký! Do bạn dưới 18 tuổi nên bộ phận nhân sự sẽ cần trao đổi thêm trước khi xác nhận, mình sẽ liên hệ bạn sớm nhất qua số điện thoại đã cung cấp nhé.'
      );
    } else {
      await sendText(
        psid,
        'Cảm ơn bạn đã đăng ký! Bộ phận nhân sự sẽ liên hệ bạn sớm nhất qua số điện thoại đã cung cấp. Chúc bạn một ngày tốt lành! 🎉'
      );
    }
  } catch (err) {
    console.error('Lark write failed:', err.response ? err.response.data : err.message);
    await sendText(
      psid,
      'Xin lỗi, hệ thống đang gặp sự cố khi lưu thông tin. Bạn vui lòng thử bấm "Xác nhận" lại sau ít phút, hoặc liên hệ trực tiếp fanpage giúp mình nhé.'
    );
  }
}

async function sendText(psid, text) {
  await callSendAPI(psid, { text });
}

async function sendQuickReplies(psid, text, options) {
  await callSendAPI(psid, {
    text,
    quick_replies: options.map((o) => ({
      content_type: 'text',
      title: o.title,
      payload: o.payload,
    })),
  });
}

async function callSendAPI(psid, message) {
  await axios.post(
    'https://graph.facebook.com/v20.0/me/messages',
    { recipient: { id: psid }, message },
    { params: { access_token: PAGE_ACCESS_TOKEN } }
  );
}

app.get('/', (req, res) => res.send('FB chatbot tuyển dụng CTV bảo vệ đang chạy.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));
