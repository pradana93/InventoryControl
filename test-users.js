require('dotenv').config({ path: '.env.local' });
const { ensureUsersSheet, getUsers, authenticateUser } = require('./src/lib/user-service');

async function test() {
  console.log('Testing Users Sheet setup...');
  await ensureUsersSheet();
  console.log('Ensure completed. Fetching users...');
  const users = await getUsers();
  console.log('Users list:', users);

  console.log('Testing authentication with correct password:');
  const authSuccess = await authenticateUser('majestap93@gmail.com', 'AdminBangor2026!');
  console.log('Auth success:', !!authSuccess, authSuccess?.user?.email);

  console.log('Testing authentication with wrong password:');
  const authFail = await authenticateUser('majestap93@gmail.com', 'wrongpassword');
  console.log('Auth fail check (should be false/null):', authFail);
}

test().catch(console.error);