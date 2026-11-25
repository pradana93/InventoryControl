const https = require('https');

const HOST = 'inventory-control-five.vercel.app';
const EMAIL = 'majestap93@gmail.com';
const PASSWORD = 'majestap93';

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: data })
      );
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function main() {
  // 1. Get CSRF token
  const csrfRes = await request({
    hostname: HOST,
    path: '/api/auth/csrf',
    method: 'GET',
  });
  const csrfToken = JSON.parse(csrfRes.body).csrfToken;
  const csrfCookie = csrfRes.headers['set-cookie']
    .map((c) => c.split(';')[0])
    .join('; ');
  console.log('1. CSRF token obtained');

  // 2. Login with credentials
  const loginBody = new URLSearchParams({
    email: EMAIL,
    password: PASSWORD,
    csrfToken,
    callbackUrl: `https://${HOST}/`,
    json: 'true',
  }).toString();

  const loginRes = await request(
    {
      hostname: HOST,
      path: '/api/auth/callback/credentials',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(loginBody),
        Cookie: csrfCookie,
      },
    },
    loginBody
  );
  console.log('2. Login status:', loginRes.status);
  console.log('   Login body:', loginRes.body);
  const sessionCookie = (loginRes.headers['set-cookie'] || [])
    .map((c) => c.split(';')[0])
    .join('; ');

  // 3. Check session
  const sessionRes = await request({
    hostname: HOST,
    path: '/api/auth/session',
    method: 'GET',
    headers: { Cookie: `${csrfCookie}; ${sessionCookie}` },
  });
  console.log('3. Session:', sessionRes.body);

  // 4. Fetch dashboard
  const cookie = `${csrfCookie}; ${sessionCookie}`;
  const dashRes = await request({
    hostname: HOST,
    path: '/api/dashboard',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('4. Dashboard status:', dashRes.status);
  if (dashRes.status === 200) {
    const dash = JSON.parse(dashRes.body);
    console.log('   Summary:', JSON.stringify(dash.summary));
    console.log('   Zones:', JSON.stringify(dash.charts?.zoneDistribution));
  } else {
    console.log('   Body:', dashRes.body.slice(0, 200));
  }

  // 5. Health endpoint
  const healthRes = await request({
    hostname: HOST,
    path: '/api/health',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  console.log('5. Health:', healthRes.body);

  // 6. Submit an Inbound entry (auto-sync test)
  const testRack = 'A0101A';
  // read the pre-qty through health? Instead just submit and confirm success
  const inboundBody = JSON.stringify({
    barcode: 'TEST-SYNC-01',
    namaBarang: 'Apron',
    totalQty: 111,
    tanggalInbound: '25-Nov-2026',
    tanggalKadaluarsa: '31-Dec-2027',
    nomorSJ: 'SJ-TEST-SYNC',
    rack1: testRack,
    qtyRack1: 111,
    rack2: '', qtyRack2: 0,
    rack3: '', qtyRack3: 0,
    rack4: '', qtyRack4: 0,
    rack5: '', qtyRack5: 0,
    rack6: '', qtyRack6: 0,
    remarks: 'automated sync test',
  });
  const inboundRes = await request(
    {
      hostname: HOST,
      path: '/api/inbound',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(inboundBody),
        Cookie: cookie,
      },
    },
    inboundBody
  );
  console.log('6. Inbound status:', inboundRes.status, inboundRes.body);
}

main().catch((e) => console.error('FATAL:', e));
