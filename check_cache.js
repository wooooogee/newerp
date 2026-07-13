import fs from 'fs';
fetch('http://localhost:3000/api/debug/cache')
  .then(r => r.json())
  .then(d => {
    console.log(JSON.stringify(d.headers['월불입금'], null, 2));
    console.log(JSON.stringify(d.headers['시트1'], null, 2));
  })
  .catch(console.error);
