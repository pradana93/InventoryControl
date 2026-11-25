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

  console.log('1. Testing public rack scan API (no auth)...');
  const scan = await request({ hostname: HOST, path: '/api/rack/scan/A0101A', method: 'GET' });
  console.log('   Status:', scan.status);
  if (scan.status === 200) console.log('   Data:', scan.body);

  console.log('\n2. Testing Rack Labels API (auth)...');
  const labels = await request({ hostname: HOST, path: '/api/rack?action=labels', method: 'GET', headers: { Cookie: cookie } });
  console.log('   Status:', labels.status);
  if (labels.status === 200) {
    const data = JSON.parse(labels.body);
    console.log(`   Labels count: ${data.length}`);
    console.log('   First 2:', JSON.stringify(data.slice(0, 2), null, 2));
  }

  console.log('\n3. Testing inbound via scan flow (A0101A + 500 pcs)...');
  const inboundBody = JSON.stringify({
    barcode: 'SCAN-A0101A',
    namaBarang: 'Apron',
    totalQty: 500,
    tanggalInbound: new Date().toISOString().slice(0, 10),
    tanggalKadaluarsa: '2027-12-31',
    nomorSJ: 'SJ-SCAN-TEST',
    rack1: 'A0101A',
    qtyRack1: 500,
    remarks: 'Test scan inbound',
  });
  const inbound = await request(
    { hostname: HOST, path: '/api/inbound', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(inboundBody), Cookie: cookie } },
    inboundBody
  );
  console.log('   Status:', inbound.status, inbound.body);

  console.log('\n4. Re-check rack A0101A after inbound...');
  const scan2 = await request({ hostname: HOST, path: '/api/rack/scan/A0101A', method: 'GET' });
  console.log('   Data:', scan2.body);
}

main().catch((e) => console.error('FATAL:', e));