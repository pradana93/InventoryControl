const bcrypt = require('bcryptjs');

async function main() {
  const hash = '$2b$10$3EIdHyP1yBKgqxqDrgYh0..sW/s.f5KjfpETEtNt9jTQwNzC8TH3y';
  console.log('Hash:', hash);
  
  const match1 = await bcrypt.compare('majestap93', hash);
  console.log('majestap93 =>', match1);
  
  const match2 = await bcrypt.compare('AdminBangor2026!', hash);
  console.log('AdminBangor2026! =>', match2);
}

main().catch(console.error);