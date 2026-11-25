const https = require('https');

const HOST = 'inventory-control-five.vercel.app';
const EMAIL = 'majestap93@gmail.com';
const PASSWORD = 'majestap93';

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  const csrfRes = await request({ hostname: HOST, path: '/api/auth/csrf', method: 'GET' });
  const csrfToken = JSON.parse(csrfRes.body).csrfToken;
  const csrfCookie = csrfRes.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

  const loginBody = new URLSearchParams({
    email: EMAIL, password: PASSWORD, csrfToken,
    callbackUrl: `https://${HOST}/`, json: 'true',
  }).toString();

  const loginRes = await request(
    { hostname: HOST, path: '/api/auth/callback/credentials', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(loginBody), Cookie: csrfCookie } },
    loginBody
  );
  const sessionCookie = (loginRes.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const cookie = `${csrfCookie}; ${sessionCookie}`;
  console.log('Logged in:', loginRes.status);

  // List opname
  const list = await request({ hostname: HOST, path: '/api/stock-opname?action=list', method: 'GET', headers: { Cookie: cookie } });
  const opnameList = JSON.parse(list.body);
  console.log(`\nStock Opname rows: ${opnameList.length}`);
  console.log('Sample (first 3):');
  opnameList.slice(0, 3).forEach((o) => console.log(' ', JSON.stringify(o)));

  // Submit a physical count for A0101A (system says 2000) -> count 1900 (loss of 100)
  const sohBody = JSON.stringify({
    rackId: 'A0101A',
    skuName: opnameList[0].skuName,
    qtyFisikSOH: 1900,
    petugas: 'Test Auditor',
    catatan: 'Selisih 100 pcs',
  });

  const upd = await request(
    { hostname: HOST, path: '/api/stock-opname', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(sohBody), Cookie: cookie } },
    sohBody
  );
  console.log('\nPOST SOH status:', upd.status, upd.body);

  // Re-check dashboard
  const dash = await request({ hostname: HOST, path: '/api/dashboard', method: 'GET', headers: { Cookie: cookie } });
  const d = JSON.parse(dash.body);
  console.log('\nDashboard summary after opname:', JSON.stringify(d.summary));

  // Check that A0101A lot now reflects SOH/variance
  const lotA = d.inventory.find((l) => l.nomorRak === 'A0101A');
  if (lotA) console.log('A0101A lot:', JSON.stringify({ sku: lotA.namaBarang, sistem: lotA.qtySistem, soh: lotA.soh, variance: lotA.variance, akurasi: lotA.akurasi }));
}

main().catch((e) => console.error('FATAL:', e));
