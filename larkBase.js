const axios = require('axios');

const LARK_DOMAIN = 'https://open.larksuite.com';
const APP_ID = process.env.LARK_APP_ID;
const APP_SECRET = process.env.LARK_APP_SECRET;
const BASE_APP_TOKEN = process.env.LARK_BASE_APP_TOKEN;
const TABLE_ID = process.env.LARK_TABLE_ID;

let cachedToken = null;
let tokenExpiryMs = 0;

async function getTenantAccessToken() {
  if (cachedToken && Date.now() < tokenExpiryMs) return cachedToken;

  const resp = await axios.post(
    `${LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`,
    { app_id: APP_ID, app_secret: APP_SECRET }
  );

  if (resp.data.code !== 0) {
    throw new Error(`Lark auth failed: ${resp.data.code} ${resp.data.msg}`);
  }

  cachedToken = resp.data.tenant_access_token;
  tokenExpiryMs = Date.now() + (resp.data.expire - 300) * 1000;
  return cachedToken;
}

// Field names verified against the real "Danh sách bảo vệ" table schema (2026-09-14)
// via listFields(). "Năm sinh" is a Text field in this table, so it must be sent as
// a string, not a number. "Mã NV" (UV code) is intentionally left unset — it's
// manually assigned by HR and the bot has no reliable way to know the next number.
function buildFields(candidate) {
  return {
    'Họ và tên': candidate.hoTen,
    'Năm sinh': String(candidate.namSinh),
    'Giới tính': candidate.gioiTinh,
    'Chiều cao (cm)': candidate.chieuCao,
    'Cân nặng (kg)': candidate.canNang,
    'SĐT': candidate.sdt,
    'Ghi chú': candidate.ghiChu || 'Đăng ký qua Fanpage Messenger',
  };
}

async function addCandidate(candidate) {
  const token = await getTenantAccessToken();
  const fields = buildFields(candidate);

  const resp = await axios.post(
    `${LARK_DOMAIN}/open-apis/bitable/v1/apps/${BASE_APP_TOKEN}/tables/${TABLE_ID}/records`,
    { fields },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (resp.data.code !== 0) {
    throw new Error(`Lark create record failed: ${resp.data.code} ${resp.data.msg}`);
  }

  return resp.data.data.record;
}

// Utility to inspect the real field schema of the target table.
// Run once (e.g. via `node -e "require('./larkBase').listFields().then(console.log)"`)
// after setting env vars, then fix buildFields() above to match exactly.
async function listFields() {
  const token = await getTenantAccessToken();
  const resp = await axios.get(
    `${LARK_DOMAIN}/open-apis/bitable/v1/apps/${BASE_APP_TOKEN}/tables/${TABLE_ID}/fields`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return resp.data.data.items.map((f) => ({ name: f.field_name, type: f.type }));
}

module.exports = { addCandidate, listFields, getTenantAccessToken };
