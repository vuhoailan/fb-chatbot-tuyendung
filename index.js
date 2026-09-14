require('dotenv').config();
const express = require('express');
const axios = require('axios');
const larkBase = require('./larkBase');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const COMPANY_NAME = process.env.COMPANY_NAME || 'công ty';
const MIN_AGE = 18;

// In-memory session store — reset if the server restarts (fine for MVP on free hosting).
// Map<psid, { step: string, data: object }>
const sessions = new Map();

function newSession() {
  return { step: 'hoTen', data: {} };
}

function getSession(psid) {
  if (!sessions.has(psid)) sessions.set(psid, newSession());
  return sessions.get(psid);
}

// ---------- Facebook webhook ----------

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

  // Ack immediately; Facebook requires a fast 200.
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

// ---------- Conversation logic ----------

async function handlePayload(psid, payload) {
  switch (payload) {
    case 'GET_STARTED':
    case 'DANG_KY':
      sessions.set(psid, newSession());
      await sendText(psid, chaoMung());
      await askHoTen(psid);
      break;
    case 'GIOI_TINH_NAM':
      await setGioiTinh(psid, 'Nam');
      break;
    case 'GIOI_TINH_NU':
      await setGioiTinh(psid, 'Nữ');
      break;
    case 'XAC_NHAN':
      await submitCandidate(psid);
      break;
    case 'NHAP_LAI':
      sessions.set(psid, newSession());
      await askHoTen(psid);
      break;
  }
}

async function handleText(psid, text) {
  const lower = text.toLowerCase();

  if (['dang ky', 'đăng ký', 'bắt đầu', 'bat dau', 'start'].includes(lower)) {
    sessions.set(psid, newSession());
    await sendText(psid, chaoMung());
    await askHoTen(psid);
    return;
  }

  const session = getSession(psid);

  switch (session.step) {
    case 'hoTen':
      if (text.length < 2) {
        await sendText(psid, 'Bạn vui lòng nhập họ và tên đầy đủ giúp mình nhé.');
        return;
      }
      session.data.hoTen = text;
      session.step = 'namSinh';
      await sendText(psid, '2️⃣ Năm sinh của bạn là năm nào? (VD: 2000)');
      break;

    case 'namSinh': {
      const year = parseInt(text, 10);
      const currentYear = new Date().getFullYear();
      if (!year || year < currentYear - 80 || year > currentYear - 14) {
        await sendText(psid, 'Bạn nhập giúp mình năm sinh dạng số có 4 chữ số nhé (VD: 2000).');
        return;
      }
      session.data.namSinh = year;
      session.step = 'gioiTinh';
      await sendQuickReplies(psid, '3️⃣ Giới tính của bạn?', [
        { title: 'Nam', payload: 'GIOI_TINH_NAM' },
        { title: 'Nữ', payload: 'GIOI_TINH_NU' },
      ]);
      break;
    }

    case 'gioiTinh':
      if (['nam'].includes(lower)) {
        await setGioiTinh(psid, 'Nam');
      } else if (['nữ', 'nu'].includes(lower)) {
        await setGioiTinh(psid, 'Nữ');
      } else {
        await sendText(psid, 'Bạn vui lòng bấm 1 trong 2 nút Nam / Nữ phía trên giúp mình nhé.');
      }
      break;

    case 'chieuCao': {
      const cm = parseInt(text, 10);
      if (!cm || cm < 100 || cm > 230) {
        await sendText(psid, 'Bạn nhập chiều cao theo cm giúp mình nhé (VD: 170).');
        return;
      }
      session.data.chieuCao = cm;
      session.step = 'canNang';
      await sendText(psid, '5️⃣ Cân nặng của bạn (kg)?');
      break;
    }

    case 'canNang': {
      const kg = parseInt(text, 10);
      if (!kg || kg < 30 || kg > 200) {
        await sendText(psid, 'Bạn nhập cân nặng theo kg giúp mình nhé (VD: 60).');
        return;
      }
      session.data.canNang = kg;
      session.step = 'sdt';
      await sendText(psid, '6️⃣ Số điện thoại liên hệ của bạn?');
      break;
    }

    case 'sdt': {
      const digits = text.replace(/[^0-9]/g, '');
      if (digits.length < 9 || digits.length > 11) {
        await sendText(psid, 'Số điện thoại chưa đúng định dạng, bạn nhập lại giúp mình nhé (VD: 0912345678).');
        return;
      }
      session.data.sdt = digits;
      session.step = 'confirm';
      await sendConfirm(psid, session.data);
      break;
    }

    case 'confirm':
      if (['xac nhan', 'xác nhận'].includes(lower)) {
        await submitCandidate(psid);
      } else if (['nhap lai', 'nhập lại'].includes(lower)) {
        sessions.set(psid, newSession());
        await askHoTen(psid);
      } else {
        await sendText(psid, 'Bạn vui lòng bấm "Xác nhận" hoặc "Nhập lại" phía trên giúp mình nhé.');
      }
      break;

    case 'done':
      await sendText(psid, 'Thông tin của bạn đã được ghi nhận rồi nhé! Nếu muốn đăng ký thêm một hồ sơ khác, bạn gõ "đăng ký".');
      break;

    default:
      sessions.set(psid, newSession());
      await sendText(psid, chaoMung());
      await askHoTen(psid);
  }
}

async function setGioiTinh(psid, gioiTinh) {
  const session = getSession(psid);
  if (session.step !== 'gioiTinh') return;
  session.data.gioiTinh = gioiTinh;
  session.step = 'chieuCao';
  await sendText(psid, '4️⃣ Chiều cao của bạn (cm)?');
}

function chaoMung() {
  return `Chào bạn 👋 Cảm ơn bạn đã quan tâm đăng ký làm Cộng tác viên bảo vệ tại ${COMPANY_NAME}. Mình sẽ hỏi bạn vài thông tin cơ bản nhé!`;
}

async function askHoTen(psid) {
  await sendText(psid, '1️⃣ Cho mình xin họ và tên đầy đủ của bạn:');
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
  await sendQuickReplies(psid, 'Thông tin đã chính xác chưa ạ?', [
    { title: '✅ Xác nhận', payload: 'XAC_NHAN' },
    { title: '✏️ Nhập lại', payload: 'NHAP_LAI' },
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

// ---------- Facebook Send API helpers ----------

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
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
