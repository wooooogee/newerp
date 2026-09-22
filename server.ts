import express from 'express';
import path from 'path';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';

const isServerless = !!process.env.NETLIFY || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
const TOKEN_PATH = isServerless 
  ? path.join('/tmp', '.google_tokens.json') 
  : path.join(process.cwd(), '.google_tokens.json');

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT) || 3002;

app.use(express.json({ limit: '50mb' }));
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'erp-secret-key-1234';
app.use(cookieParser(COOKIE_SECRET));

app.get('/api/debug/cache', (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sheetsCache = (global as any).sheetsCache || new Map();
  const keys = Array.from(sheetsCache.keys());
  const headers: Record<string, any> = {};
  for (const key of keys) {
    const cached = sheetsCache.get(key);
    if (cached && cached.data && cached.data.length > 0) {
      headers[key] = {
        header: cached.data[0],
        firstRow: cached.data[1]
      };
    }
  }
  res.json({ keys, headers });
});

// Google OAuth Helper
const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  
  if (!clientId || !clientSecret) {
    const missing = [];
    if (!clientId) missing.push('GOOGLE_CLIENT_ID');
    if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
    throw new Error(`환경 변수가 설정되지 않았습니다: ${missing.join(', ')}. AI Studio의 Secrets 메뉴에서 해당 항목을 정확히 입력하고 [Save]를 눌러주세요.`);
  }

  const baseUrl = process.env.APP_URL || process.env.URL || 'http://localhost:3002';
  let normalizedBase = baseUrl.trim();
  if (normalizedBase.endsWith('/')) normalizedBase = normalizedBase.slice(0, -1);
  
  // Ensure HTTPS for non-localhost URLs
  if (!normalizedBase.startsWith('http')) {
    normalizedBase = `https://${normalizedBase}`;
  } else if (!normalizedBase.includes('localhost') && normalizedBase.startsWith('http://')) {
    normalizedBase = normalizedBase.replace('http://', 'https://');
  }

  const redirectUri = `${normalizedBase}/auth/callback`;
  
  console.log('--- Google OAuth Config Diagnosis ---');
  console.log('Base URL Source:', process.env.APP_URL ? 'APP_URL' : (process.env.URL ? 'URL' : 'Default'));
  console.log('Generated Redirect URI:', redirectUri);
  console.log('Client ID Prefix:', clientId.substring(0, 10) + '...');
  console.log('------------------------------------');
  
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
};



// Debug endpoint for the user to check their own config
app.get('/api/auth/debug', (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || 'NOT_SET';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || 'NOT_SET';
    const baseUrl = process.env.APP_URL || process.env.URL || 'http://localhost:3002';
    let normalizedBase = baseUrl.trim();
    if (normalizedBase.endsWith('/')) normalizedBase = normalizedBase.slice(0, -1);
    if (!normalizedBase.startsWith('http')) normalizedBase = `https://${normalizedBase}`;
    
    const redirectUri = `${normalizedBase}/auth/callback`;

    res.json({
      clientIdStatus: clientId !== 'NOT_SET' ? 'Configured' : 'Missing',
      clientSecretStatus: clientSecret !== 'NOT_SET' ? 'Configured' : 'Missing',
      expectedRedirectUri: redirectUri,
      hint: 'Google Console > Credentials > Authorized redirect URIs에 위 expectedRedirectUri를 추가하세요.',
      clientIdFormat: clientId.endsWith('.apps.googleusercontent.com') ? 'Valid Format' : 'Invalid Format (Must end with .apps.googleusercontent.com)'
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Auth Middleware
async function getAuthenticatedClient(req: express.Request, res?: express.Response) {
  let tokens;
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse global tokens', e);
    }
  }
  if (!tokens && req.cookies.google_tokens) {
    try {
      tokens = JSON.parse(req.cookies.google_tokens);
      // 쿠키에 토큰이 있고 서버 로컬 파일이 없는 경우 복구
      if (tokens && !fs.existsSync(TOKEN_PATH)) {
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('[Self-Healing] Restored global token file from request cookie.');
      }
    } catch (e) {
      console.error('Failed to parse google_tokens cookie or write token file:', e);
    }
  }
  // 환경변수에 등록된 리프레시 토큰이 있을 경우 자동 연동용으로 세팅
  if (!tokens && process.env.GOOGLE_REFRESH_TOKEN) {
    tokens = {
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN.trim()
    };
  }
  if (!tokens) return null;
  
  const client = getOAuthClient();
  try {
    client.setCredentials(tokens);
    return client;
  } catch (e) {
    if (res && !fs.existsSync(TOKEN_PATH)) res.clearCookie('google_tokens');
    return null;
  }
}

// Global error handler for Google API errors to clear cookies on auth failure
const handleGoogleError = (error: any, res: express.Response) => {
  const errorMsg = error.response?.data?.error || error.message;
  const errorDesc = error.response?.data?.error_description || '';
  
  console.error('Google API Error:', { errorMsg, errorDesc });

  if (errorMsg === 'unauthorized_client' || errorDesc.includes('Unauthorized') || errorMsg === 'invalid_grant') {
    res.clearCookie('google_tokens');
    return res.status(401).json({ 
      error: '구글 인증 세션이 만료되었거나 정보가 불일치합니다.',
      details: 'Client ID/Secret 정보가 변경되었을 수 있습니다. 페이지를 새로고침한 후 다시 [구글 시트 연동]을 진행해 주세요.'
    });
  }
  
  return res.status(500).json({ error: errorMsg, details: errorDesc });
};

// Routes
app.get('/api/auth/url', (req, res) => {
  try {
    const oauth2Client = getOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    // Return both the URL and the redirectUri for debugging
    const redirectUri = (oauth2Client as any).redirectUri;
    res.json({ url, redirectUri });
  } catch (error: any) {
    console.error('Auth URL error:', error);
    res.status(500).json({ error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const oauth2Client = getOAuthClient();
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    
    // 글로벌 연동을 위해 서버 파일에 저장 시도
    try {
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    } catch (fsError) {
      console.warn('Cannot write to file system (might be serverless environment). Relying on cookies.', fsError);
    }
    
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('google_tokens', JSON.stringify(tokens), {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      path: '/',
      maxAge: 10 * 365 * 24 * 60 * 60 * 1000 // 10 years
    });
    
    const refreshToken = tokens.refresh_token;
    let htmlContent = `
      <html>
        <head>
          <title>구글 시트 연동 완료</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #1e293b; }
            .card { background: white; padding: 40px; border-radius: 24px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1); max-w: 500px; width: 100%; border: 1px solid #e2e8f0; text-align: center; }
            h2 { color: #10b981; font-weight: 800; margin-top: 0; }
            p { font-size: 14px; color: #64748b; line-height: 1.6; }
            .token-box { background: #f1f5f9; padding: 12px; border-radius: 12px; font-family: monospace; font-size: 11px; word-break: break-all; margin: 20px 0; border: 1px solid #cbd5e1; text-align: left; max-height: 85px; overflow-y: auto; }
            .btn { background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
            .btn:hover { background: #2563eb; }
            .copy-btn { background: #10b981; margin-right: 8px; }
            .copy-btn:hover { background: #059669; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>🎉 구글 시트 연동 성공!</h2>
            <p>구글 계정 연동에 성공했습니다. 이제 팝업창을 닫아도 됩니다.</p>
    `;
    
    if (refreshToken) {
      htmlContent += `
        <div style="border-top: 1px solid #e2e8f0; margin-top: 20px; padding-top: 20px;">
          <p style="font-weight: bold; color: #475569;">💡 자동 로그인(연동 유지) 설정 가이드</p>
          <p style="font-size: 12px; text-align: left; color: #64748b;">매번 수동 연동 없이 항상 구글 시트 데이터를 가져오려면, 아래 <b>Refresh Token</b>을 복사하여 Netlify/서버 환경 변수의 <b><code>GOOGLE_REFRESH_TOKEN</code></b> 값으로 등록해 주세요.</p>
          <div class="token-box" id="tokenText">${refreshToken}</div>
          <button class="btn copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('tokenText').innerText); alert('토큰이 복사되었습니다! 환경변수 GOOGLE_REFRESH_TOKEN 에 등록하세요.')">토큰 복사하기</button>
          <button class="btn" onclick="window.close()">닫기</button>
        </div>
      `;
    } else {
      htmlContent += `
        <p style="font-size: 12px; color: #94a3b8; margin-top: 20px; line-height: 1.5;">
          (이미 최초 연동이 완료되어 리프레시 토큰이 생략되었습니다. 만약 환경변수용 리프레시 토큰 재발급이 필요하다면 <a href="https://myaccount.google.com/permissions" target="_blank" style="color: #3b82f6; text-decoration: underline;">구글 계정 권한 설정</a>에서 이 앱의 권한을 해제한 후 다시 연동을 진행해 주세요.)
        </p>
        <button class="btn" onclick="window.close()">닫기</button>
      `;
    }
    
    htmlContent += `
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
            }
          </script>
        </body>
      </html>
    `;
    res.send(htmlContent);
  } catch (error: any) {
    console.error('Auth callback error:', error);
    const errorMsg = error.response?.data?.error_description || error.message || 'Unknown error';
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #e11d48;">인증 실패 (Authentication Failed)</h2>
          <p>상세 사유: <strong>${errorMsg}</strong></p>
          <hr />
          <p style="font-size: 13px; color: #666;">
            1. 구글 콘솔의 Client ID/Secret이 AI Studio Secrets에 정확히 입력되었는지 확인하세요.<br />
            2. 리디렉션 URI가 구글 콘솔에 등록된 것과 완벽히 일치하는지 확인하세요.
          </p>
          <button onclick="window.close()">창 닫기</button>
        </body>
      </html>
    `);
  }
});

app.get('/api/auth/status', (req, res) => {
  const hasGlobalToken = fs.existsSync(TOKEN_PATH);
  const hasEnvToken = !!process.env.GOOGLE_REFRESH_TOKEN;
  res.json({ authenticated: hasGlobalToken || hasEnvToken || !!req.cookies.google_tokens });
});

/**
 * 비밀번호 일치 여부 확인 함수
 * - 완전 일치(1순위)
 * - 10자리 핸드폰 번호(010XXXXXXXX vs 10XXXXXXXX) 호환
 * - 숫자로만 구성된 비밀번호에서 구글 시트 숫자 변환으로 인한 앞자리 '0' 누락/추가 양방향 호환 (예: '0123' vs '123', '0825' vs '825')
 */
function isPasswordMatching(storedPw: string, inputPw: string): boolean {
  const s = String(storedPw || '').trim();
  const inp = String(inputPw || '').trim();
  if (!s || !inp) return false;
  if (s === inp) return true;

  // 10자리 핸드폰 번호 호환 (010XXXXXXXX vs 10XXXXXXXX)
  if ((s.length === 10 && '0' + s === inp) || (inp.length === 10 && s === '0' + inp)) {
    return true;
  }

  // 둘 다 순수 숫자로 이루어진 경우: 앞자리 0이 유실되었거나 붙었을 가능성 호환
  if (/^\d+$/.test(s) && /^\d+$/.test(inp)) {
    const sTrimmed = s.replace(/^0+/, '');
    const inpTrimmed = inp.replace(/^0+/, '');
    // 0이 아닌 숫자가 남아있고 동일한 경우 (예: '0123' vs '123')
    if (sTrimmed.length > 0 && sTrimmed === inpTrimmed) {
      return true;
    }
    // 둘 다 0으로만 이루어진 경우 (예: '0000' vs '0')
    if (sTrimmed === '' && inpTrimmed === '') {
      return true;
    }
  }

  return false;
}

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해 주세요.' });
  }

  const adminId = process.env.ADMIN_ID?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  const masterId = process.env.MASTER_ID?.trim() || 'a250027';
  const masterPassword = process.env.MASTER_PASSWORD?.trim() || '880805';

  // 세션 쿠키 발행 헬퍼 함수
  const issueSession = (role: string, orgName: string, orgs: { role: string; orgName: string }[] = []) => {
    const userSession = { username, role, orgName, orgs };
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    
    res.cookie('user_auth', JSON.stringify(userSession), {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      signed: true,
      path: '/'
    });
    return res.json({ success: true, user: userSession });
  };

  // 0. 마스터 관리자 계정 즉시 인증 (환경변수 또는 지정 마스터 계정)
  if ((masterId && masterPassword && username === masterId && password === masterPassword) ||
      (username === 'a250027' && password === '880805')) {
    console.log(`[LOGIN] master admin login success for ${username}`);
    return issueSession('admin', '시스템관리자', [{ role: 'admin', orgName: '시스템관리자' }]);
  }

  // 1. 구글 시트의 '조직계정설정' 탭을 1순위로 조회하여 검증
  const client = await getAuthenticatedClient(req, res);
  if (client) {
    let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
    if (sheetId && sheetId.includes('spreadsheets/d/')) {
      sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
    }

    if (sheetId) {
      try {
        const sheets = google.sheets({ version: 'v4', auth: client });
        
        // 시트 목록을 가져와서 '조직계정설정' 탭이 있는지 확인
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheetsList = spreadsheet.data.sheets || [];
        const accountSheet = sheetsList.find(s => s.properties?.title === '조직계정설정');
        
        if (accountSheet) {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: '조직계정설정!A:D',
            valueRenderOption: 'FORMATTED_VALUE',
          });

          const rows = response.data.values;
          if (rows && rows.length > 1) {
            // 헤더 건너뛰고 매칭되는 계정 탐색 (구분, 조직명, 아이디, 비밀번호)
            const matchedRows = rows.slice(1).filter(row => {
              const rowId = String(row[2] || '').trim();
              const rowPw = String(row[3] || '').trim();
              const inputPw = String(password || '').trim();
              
              const pwMatches = isPasswordMatching(rowPw, inputPw);
              return rowId === username && pwMatches;
            });

            if (matchedRows.length > 0) {
              const orgs = matchedRows.map(row => {
                const roleVal = String(row[0] || '').trim(); // 관리자 / 본부 / 지사 / 지점 등
                const orgNameVal = String(row[1] || '').trim(); // 조직명
                const isSuperAdminRole = ['관리자총무', '어드민', 'admin', 'ADMIN'].includes(roleVal);
                const isGeneralAdminRole = roleVal === '관리자';
                return {
                  role: isSuperAdminRole ? 'admin' : (isGeneralAdminRole ? '관리자' : roleVal),
                  orgName: (isSuperAdminRole || isGeneralAdminRole) ? '관리자' : orgNameVal
                };
              });

              // admin 권한이 하나라도 있으면 대표 역할을 admin으로 부여
              const hasAdmin = orgs.some(o => o.role === 'admin');
              const hasGeneralAdmin = orgs.some(o => o.role === '관리자');
              const repRole = hasAdmin ? 'admin' : (hasGeneralAdmin ? '관리자' : orgs[0].role);
              const repOrgName = (hasAdmin || hasGeneralAdmin) ? '관리자' : orgs[0].orgName;

              return issueSession(repRole, repOrgName, orgs);
            }
          }
        }
      } catch (error) {
        console.warn('Google Sheet account verification failed, falling back to local admin check:', error);
      }
    }
  }

  // 2. 구글 시트 검증에 실패했거나 매칭되지 않은 경우, 2순위로 로컬 .env 어드민 설정값 대조
  if (adminId && adminPassword && username === adminId && password === adminPassword) {
    console.log(`[LOGIN] admin fallback success for ${username}`);
    return issueSession('admin', '관리자', [{ role: 'admin', orgName: '관리자' }]);
  }

  console.log(`[LOGIN] Both google sheet and admin fallback failed for ${username}`);
  // 둘 다 일치하지 않는 경우
  return res.status(401).json({ error: '아이디 또는 비밀번호가 일치하지 않습니다. 관리자 계정으로 먼저 로그인하여 구글 연동을 진행해 주세요.' });
});

app.get('/api/auth/user', (req, res) => {
  const userAuth = req.signedCookies.user_auth;
  if (!userAuth) {
    return res.json({ authenticated: false });
  }
  try {
    const user = JSON.parse(userAuth);
    return res.json({ authenticated: true, user });
  } catch (e) {
    res.clearCookie('user_auth');
    return res.json({ authenticated: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('google_tokens');
  res.clearCookie('user_auth');
  // DO NOT delete TOKEN_PATH here! It is a global token for all users.
  res.json({ success: true });
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const userAuth = req.signedCookies.user_auth;
    let username = '';
    if (userAuth) {
      try {
        const userObj = JSON.parse(userAuth);
        username = userObj.username;
      } catch (e) {}
    }
    if (!username && req.body.username) {
      username = req.body.username;
    }

    const { currentPassword, newPassword } = req.body;
    if (!username) {
      return res.status(401).json({ error: '로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.' });
    }
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.' });
    }
    if (String(newPassword).trim().length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 최소 4자리 이상이어야 합니다.' });
    }

    const client = await getAuthenticatedClient(req, res);
    if (!client) {
      return res.status(500).json({ error: '구글 시트 인증 정보가 없습니다.' });
    }

    let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
    if (sheetId && sheetId.includes('spreadsheets/d/')) {
      sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
    }
    if (!sheetId) {
      return res.status(500).json({ error: '구글 시트 ID가 설정되어 있지 않습니다.' });
    }

    const sheets = google.sheets({ version: 'v4', auth: client });

    // 1. 시트 메타데이터에서 '조직계정설정'의 sheetId 확인
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    const accountSheet = sheetsList.find(s => s.properties?.title === '조직계정설정');
    const aSheetId = accountSheet?.properties?.sheetId;

    // 2. C열(아이디)과 D열(비밀번호)을 TEXT 서식으로 선제 지정 (앞자리 0 보존 환경 선제 구축)
    if (aSheetId != null) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: aSheetId, startColumnIndex: 0, endColumnIndex: 4 },
                  cell: {
                    userEnteredFormat: {
                      numberFormat: { type: 'TEXT' }
                    }
                  },
                  fields: 'userEnteredFormat.numberFormat'
                }
              }
            ]
          }
        });
      } catch (fmtErr) {
        console.warn('[CHANGE-PASSWORD] Failed to pre-format TEXT on sheet:', fmtErr);
      }
    }

    // 3. 조직계정설정 데이터 조회 (FORMATTED_VALUE로 원본 서식 텍스트 보존)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '조직계정설정!A:D',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
      return res.status(404).json({ error: '조직계정설정 데이터가 없습니다.' });
    }

    const targetUser = String(username || '').trim().toLowerCase();
    const targetPw = String(currentPassword || '').trim();
    const newPwStr = String(newPassword || '').trim();

    let matchedCount = 0;
    let pwMismatchCount = 0;
    let updatedRows = rows.map(r => [...r]);

    // 아이디(C열) 일치 행 우선 확인
    const hasExactIdMatch = updatedRows.slice(1).some(row => String(row[2] || '').trim().toLowerCase() === targetUser);

    // 헤더(index 0) 제외 후 검색
    for (let i = 1; i < updatedRows.length; i++) {
      const rowOrgName = String(updatedRows[i][1] || '').trim().toLowerCase();
      const rowId = String(updatedRows[i][2] || '').trim().toLowerCase();
      const rowPw = String(updatedRows[i][3] || '').trim();

      const isUserMatch = hasExactIdMatch ? (rowId === targetUser) : (rowId === targetUser || rowOrgName === targetUser);

      // C열(아이디) 또는 B열(조직명/사원명)로 계정 대조
      if (isUserMatch) {
        if (!isPasswordMatching(rowPw, targetPw)) {
          console.log(`[PASSWORD MISMATCH] User: ${targetUser}, Input PW: "${targetPw}", Sheet PW: "${rowPw}"`);
          pwMismatchCount++;
          continue;
        }
        // 비밀번호 (D열) 업데이트 - 반드시 순수 문자열로 저장하여 앞자리 0 온전 보존
        updatedRows[i][3] = String(newPwStr);
        matchedCount++;
      }
    }

    if (matchedCount === 0) {
      if (pwMismatchCount > 0) {
        return res.status(400).json({ error: '현재 비밀번호가 일치하지 않습니다. 입력하신 비밀번호를 다시 확인해 주세요.' });
      }
      return res.status(404).json({ error: `등록된 계정 정보(${username})를 찾을 수 없습니다.` });
    }

    // 4. 모든 행의 데이터를 순수 문자열로 보존하여 기존 다른 계정들의 비밀번호와 데이터를 100% 안전하게 유지
    const cleanRows = updatedRows.map(row => [
      String(row[0] ?? ''),
      String(row[1] ?? ''),
      String(row[2] ?? ''),
      String(row[3] ?? '')
    ]);

    // 구글 시트에 업데이트 반영 (RAW로 저장하여 앞자리 0 유지)
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `조직계정설정!A1:D${cleanRows.length}`,
      valueInputOption: 'RAW',
      requestBody: { values: cleanRows }
    });

    // 5. 저장 후에도 TEXT 서식 유지 보장
    if (aSheetId != null) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: aSheetId, startColumnIndex: 0, endColumnIndex: 4 },
                  cell: {
                    userEnteredFormat: {
                      numberFormat: { type: 'TEXT' }
                    }
                  },
                  fields: 'userEnteredFormat.numberFormat'
                }
              }
            ]
          }
        });
      } catch (postFmtErr) {
        console.warn('[CHANGE-PASSWORD] Failed to re-format TEXT on sheet:', postFmtErr);
      }
    }

    console.log(`[PASSWORD CHANGED SUCCESS] User: ${username}`);
    return res.json({ success: true, message: '비밀번호가 성공적으로 변경되었습니다.' });
  } catch (error: any) {
    console.error('Password change error:', error);
    return res.status(500).json({ error: '비밀번호 변경 처리 중 오류가 발생했습니다: ' + (error.message || error) });
  }
});


// Settings Operations

// 구글 시트의 시스템설정 탭 완전 초기화 (꼬인 데이터 복구용)
app.post('/api/sheets/settings/reset', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: '시스템설정',
    });
    console.log('[CloudSync] 시스템설정 탭 초기화 완료');
    res.json({ success: true });
  } catch (error: any) {
    console.error('[CloudSync] Reset error:', error.message);
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/settings/sync-cache', async (req, res) => {
  const { settings, divisions, globalIncentives, maintenanceRules } = req.body || {};
  try {
    const cachePath = path.join(process.cwd(), '.settings_cache.json');
    let cacheData: any = {};
    if (fs.existsSync(cachePath)) {
      try { cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {}
    }
    if (settings && Array.isArray(settings) && settings.length > 0) cacheData.settings = settings;
    if (divisions && Array.isArray(divisions) && divisions.length > 0) cacheData.divisions = divisions;
    if (globalIncentives && Array.isArray(globalIncentives) && globalIncentives.length > 0) cacheData.globalIncentives = globalIncentives;
    if (maintenanceRules && Array.isArray(maintenanceRules) && maintenanceRules.length > 0) cacheData.maintenanceRules = maintenanceRules;
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    return res.json({ success: true });
  } catch (e: any) {
    console.error("[CacheSync] write error:", e);
    return res.status(500).json({ error: e.message });
  }
});

let settingsCloudSaveQueue: Promise<any> = Promise.resolve();

app.post('/api/sheets/settings/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { settings, globalIncentives, maintenanceRules, manualOrderProducts, manualOrderStores, reportSettings, divisions } = req.body as {
    settings: any[];
    globalIncentives?: any[];
    maintenanceRules?: any[];
    manualOrderProducts?: string[];
    manualOrderStores?: Record<string, any>;
    reportSettings?: Record<string, any>;
    divisions?: any[];
  };
  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  // 로컬 파일 캐시 백업 동기 저장 (즉시 반영)
  try {
    const cachePath = path.join(process.cwd(), '.settings_cache.json');
    let cacheData: any = {};
    if (fs.existsSync(cachePath)) {
      try { cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {}
    }
    if (settings) cacheData.settings = settings;
    if (globalIncentives) cacheData.globalIncentives = globalIncentives;
    if (maintenanceRules) cacheData.maintenanceRules = maintenanceRules;
    if (manualOrderProducts) cacheData.manualOrderProducts = manualOrderProducts;
    if (manualOrderStores) cacheData.manualOrderStores = manualOrderStores;
    if (reportSettings) cacheData.reportSettings = reportSettings;
    if (divisions && Array.isArray(divisions) && divisions.length > 0) {
      cacheData.divisions = divisions;
    }
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (e) {
    console.error("[CloudSync] Local cache write error:", e);
  }

  console.log(`[CloudSync] Saving pretty settings to sheet: ${sheetId}`);

  const runSaveTask = async () => {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // Check if '시스템설정' sheet exists, if not create it
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let settingsSheet = sheetsList.find(s => s.properties?.title === '시스템설정');
    let sheetInternalId: number | null | undefined = settingsSheet?.properties?.sheetId;
    
    if (!settingsSheet) {
      console.log("[CloudSync] Creating '시스템설정' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '시스템설정' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
    }

    // Flatten HQ settings into tabular data
    // Header: ID, 본부명, 은행, 계좌, 예금주, 지급방식, 오버라이딩Y/N, 영업%, 팀장%, 지사%, 본부%, 상품명, 전체수수료, 판매수수료, 판매촉진비, 오버라이딩적용, 구간1건, 단가1, 구간2건, 단가2, 구간3건, 단가3, 상품영업, 상품팀장, 상품지사, 상품본부
    const headers = [
      '본부ID', '본부명', '정산유형', '운영여부', '은행', '계좌번호', '예금주', '지급방식', '오버라이딩활성', 
      '비율(영업)', '비율(팀장)', '비율(지사)', '비율(본부)', 
      '상품명', '전체수수료', '판매수수료', '판매촉진비', '오버라이딩적용', '구간1건', '구간1단가', '구간2건', '구간2단가', '구간3건', '구간3단가',
      '상품영업', '상품팀장', '상품지사', '상품본부',
      '상품유지수수료활성', '상품유지수수료룰'
    ];

    const rows: any[][] = [headers];

    if (settings && Array.isArray(settings)) {
      settings.forEach((hq: any) => {
        const baseInfo = [
          hq.id,
          hq.hqName,
          hq.settlementType || '사업자',  // 정산유형 추가
          hq.isActive !== false ? 'Y' : 'N', // 운영여부 추가
          hq.bankName,
          hq.accountNumber,
          hq.accountHolder,
          hq.paymentMethod,
          hq.enableOverriding ? 'Y' : 'N',
          hq.overriding?.salesperson || 0,
          hq.overriding?.teamLeader || 0,
          hq.overriding?.branchManager || 0,
          hq.overriding?.hqManager || 0
        ];

        if (hq.productRules && hq.productRules.length > 0) {
          hq.productRules.forEach((p: any) => {
            const total = p.totalAmount || 0;
            const sales = p.salesAmount || 0;
            rows.push([
              ...baseInfo,
              p.productName,
              total,
              sales,
              total - sales, // 판매촉진비
              p.applyOverriding !== false ? 'Y' : 'N',
              p.tier1Count || 0,
              p.tier1Price || 0,
              p.tier2Count || 0,
              p.tier2Price || 0,
              p.tier3Count || 0,
              p.tier3Price || 0,
              p.overriding?.salesperson ?? hq.overriding?.salesperson ?? 0,
              p.overriding?.teamLeader ?? hq.overriding?.teamLeader ?? 0,
              p.overriding?.branchManager ?? hq.overriding?.branchManager ?? 0,
              p.overriding?.hqManager ?? hq.overriding?.hqManager ?? 0,
              (p.applyMaintenance === true || p.applyMaintenance === 'Y' || p.applyMaintenance === 'true' || (p.applyMaintenance !== false && p.applyMaintenance !== 'N' && p.applyMaintenance !== 'false' && ((p.productName || '').includes('유지') || (p.maintenanceRules && p.maintenanceRules.length > 0)))) ? 'Y' : 'N',
              JSON.stringify(p.maintenanceRules || [])
            ]);
          });
        } else {
          // HQ with no products
          rows.push([
            ...baseInfo,
            '-', 0, 0, 0, 'Y', 0, 0, 0, 0, 0, 0,
            hq.overriding?.salesperson ?? 0, hq.overriding?.teamLeader ?? 0, hq.overriding?.branchManager ?? 0, hq.overriding?.hqManager ?? 0,
            'N', '[]'
          ]);
        }
      });

      // Clear and update the sheet
      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: '시스템설정',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: '시스템설정!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows }
      });

      // Apply formatting to headers
      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
      console.log("[CloudSync] Beautiful settings saved successfully.");
    }

    // -- Handle globalIncentives --
    if (globalIncentives && Array.isArray(globalIncentives)) {
      let incentiveSheet = sheetsList.find(s => s.properties?.title === '특수수당설정');
      let incentiveSheetId: number | null | undefined = incentiveSheet?.properties?.sheetId;
      
      if (!incentiveSheet) {
        console.log("[CloudSync] Creating '특수수당설정' sheet...");
        const newSheetResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: '특수수당설정' } } }]
          }
        });
        incentiveSheetId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      }

      const incentiveHeaders = [
        'ID', '수급자명', '지급일(일)', '대상본부', '대상상품', '기준일자', '건당수수료', '최소보장금액', '수당종류', '대상본부배열', '할부사용여부', '할부룰', '대상제품배열', '정산유형', '발행사업자명', '사업자번호', '대상사업단배열'
      ];
      
      const incentiveRows: any[][] = [incentiveHeaders];
      globalIncentives.forEach((rule: any) => {
        incentiveRows.push([
          rule.id || '',
          rule.targetName || '',
          rule.payDay ?? 0,
          rule.targetHq || '',
          (rule.targetProducts || []).join(', '),
          rule.baseDateType || 'DELIVERY',
          rule.commissionPerUnit || 0,
          rule.minimumGuarantee || 0,
          rule.incentiveName || '',
          JSON.stringify(Array.isArray(rule.targetHqs) ? rule.targetHqs : ['ALL']),
          rule.useInstallments ? 'Y' : 'N',
          JSON.stringify(Array.isArray(rule.installments) ? rule.installments : []),
          JSON.stringify(Array.isArray(rule.targetItems) ? rule.targetItems : ['ALL']),
          rule.taxType || 'DEFAULT',
          rule.taxBusinessName || '',
          rule.taxBusinessNo || '',
          JSON.stringify(Array.isArray(rule.targetDivisions) ? rule.targetDivisions : [])
        ]);
      });

      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: '특수수당설정',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: '특수수당설정!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: incentiveRows }
      });

      if (incentiveSheetId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: incentiveSheetId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
      console.log("[CloudSync] Global incentives saved successfully.");
    }

    // -- Handle maintenanceRules --
    if (maintenanceRules && Array.isArray(maintenanceRules)) {
      let mSheet = sheetsList.find(s => s.properties?.title === '유지수수료설정');
      let mSheetId: number | null | undefined = mSheet?.properties?.sheetId;
      
      if (!mSheet) {
        console.log("[CloudSync] Creating '유지수수료설정' sheet...");
        const newSheetResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: '유지수수료설정' } } }]
          }
        });
        mSheetId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      }

      const mHeaders = [
        'ID', '대상본부', '대상상품', '회차별구간', '적용시작일', '적용종료일'
      ];
      
      const mRows: any[][] = [mHeaders];
      maintenanceRules.forEach((rule: any) => {
        mRows.push([
          rule.id || '',
          JSON.stringify(rule.targetHqs || ['ALL']),
          JSON.stringify(rule.targetProducts || ['ALL']),
          JSON.stringify(rule.tiers || []),
          rule.applyStartDate || '',
          rule.applyEndDate || ''
        ]);
      });

      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: '유지수수료설정',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: '유지수수료설정!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: mRows }
      });

      if (mSheetId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: mSheetId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
      console.log("[CloudSync] Maintenance rules saved successfully.");
    }

    // -- Handle manualOrderProducts & manualOrderStores & reportSettings & divisions --
    // 기존 구글 시트의 수기발주및기타설정 내용을 먼저 읽어와서 병합 보존 (어떤 항목이 누락되어 전달되어도 기존 데이터 보존!)
    let existingExtraMap: Record<string, string> = {};
    try {
      const curExtraRes = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: '수기발주및기타설정!A:C'
      });
      const curRows = curExtraRes.data.values || [];
      if (curRows.length >= 2) {
        curRows.slice(1).forEach(r => {
          if (r[0] && r[1]) existingExtraMap[r[0]] = r[1];
        });
      }
    } catch (e) {}

    // 로컬 파일 캐시 백업도 확인
    const extraCachePath = path.join(process.cwd(), '.settings_cache.json');
    let extraCacheBackup: any = {};
    if (fs.existsSync(extraCachePath)) {
      try { extraCacheBackup = JSON.parse(fs.readFileSync(extraCachePath, 'utf8')); } catch(e){}
    }

    // divisions 결정: 유효한 데이터 우선, 빈 배열이면 기존 시트 또는 캐시 백업 보존
    let targetDivisions = (divisions && Array.isArray(divisions) && divisions.length > 0) ? divisions : null;
    if (!targetDivisions && existingExtraMap['BUSINESS_DIVISIONS']) {
      try {
        const parsed = JSON.parse(existingExtraMap['BUSINESS_DIVISIONS']);
        if (Array.isArray(parsed) && parsed.length > 0) targetDivisions = parsed;
      } catch (e) {}
    }
    if (!targetDivisions && extraCacheBackup.divisions && Array.isArray(extraCacheBackup.divisions) && extraCacheBackup.divisions.length > 0) {
      targetDivisions = extraCacheBackup.divisions;
    }

    // manualOrderProducts 결정
    let targetManualProducts = manualOrderProducts;
    if (!targetManualProducts && existingExtraMap['MANUAL_ORDER_PRODUCTS']) {
      try { targetManualProducts = JSON.parse(existingExtraMap['MANUAL_ORDER_PRODUCTS']); } catch (e) {}
    }
    if (!targetManualProducts && extraCacheBackup.manualOrderProducts) targetManualProducts = extraCacheBackup.manualOrderProducts;

    // manualOrderStores 결정
    let targetManualStores = manualOrderStores;
    if (!targetManualStores && existingExtraMap['MANUAL_ORDER_STORES']) {
      try { targetManualStores = JSON.parse(existingExtraMap['MANUAL_ORDER_STORES']); } catch (e) {}
    }
    if (!targetManualStores && extraCacheBackup.manualOrderStores) targetManualStores = extraCacheBackup.manualOrderStores;

    // reportSettings 결정
    let targetReportSettings = reportSettings;
    if (!targetReportSettings && existingExtraMap['REPORT_SETTINGS']) {
      try { targetReportSettings = JSON.parse(existingExtraMap['REPORT_SETTINGS']); } catch (e) {}
    }
    if (!targetReportSettings && extraCacheBackup.reportSettings) targetReportSettings = extraCacheBackup.reportSettings;

    if (targetManualProducts || targetManualStores || targetReportSettings || targetDivisions) {
      let extraSheet = sheetsList.find(s => s.properties?.title === '수기발주및기타설정');
      let extraSheetId: number | null | undefined = extraSheet?.properties?.sheetId;
      
      if (!extraSheet) {
        console.log("[CloudSync] Creating '수기발주및기타설정' sheet...");
        const newSheetResponse = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: '수기발주및기타설정' } } }]
          }
        });
        extraSheetId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      }

      const extraHeaders = ['Key', 'ValueJSON', '최종수정일'];
      const extraRows: any[][] = [extraHeaders];
      const nowStr = new Date().toISOString();

      if (targetManualProducts) {
        extraRows.push(['MANUAL_ORDER_PRODUCTS', JSON.stringify(targetManualProducts), nowStr]);
      }
      if (targetManualStores) {
        extraRows.push(['MANUAL_ORDER_STORES', JSON.stringify(targetManualStores), nowStr]);
      }
      if (targetReportSettings) {
        extraRows.push(['REPORT_SETTINGS', JSON.stringify(targetReportSettings), nowStr]);
      }
      if (targetDivisions && targetDivisions.length > 0) {
        extraRows.push(['BUSINESS_DIVISIONS', JSON.stringify(targetDivisions), nowStr]);
      }

      await sheets.spreadsheets.values.clear({
        spreadsheetId: sheetId,
        range: '수기발주및기타설정',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: '수기발주및기타설정!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: extraRows }
      });
      console.log("[CloudSync] Extra settings (manual orders, report, divisions) safely preserved and saved.");
    }
  };

  // Google Sheets 동시 쓰기 경합 방지: 순차 큐잉 실행
  const queueTask = settingsCloudSaveQueue.then(runSaveTask, runSaveTask);
  settingsCloudSaveQueue = queueTask;

  try {
    await queueTask;
    res.json({ success: true });
  } catch (error: any) {
    console.error("[CloudSync] Save error:", error.message);
    return handleGoogleError(error, res);
  }
});
// === 회원 관리 API ===
app.get('/api/sheets/members/load', async (req, res) => {
  try {
    const client = await getAuthenticatedClient(req, res);
    if (!client) return;

    let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
    if (sheetId && sheetId.includes('spreadsheets/d/')) {
      sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
    }
    if (!sheetId) return res.status(400).json({ error: 'Spreadsheet ID not found' });

    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    
    // 조직계정설정 탭 확인
    let accountSheet = sheetsList.find(s => s.properties?.title === '조직계정설정');
    if (!accountSheet) {
      return res.json({ members: [] });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '조직계정설정!A:D',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = response.data.values || [];
    // 첫 행이 헤더라면 스킵
    const members = [];
    for (let i = 0; i < rows.length; i++) {
      if (i === 0 && rows[i][0] === '구분') continue; // 헤더 스킵
      let [role, orgName, username, password] = rows[i];
      if (!username) continue; // 아이디가 없으면 스킵

      role = String(role || '').trim();
      orgName = String(orgName || '').trim();
      username = String(username || '').trim();
      let pw = String(password ?? '').trim();

      // 만약 사원 비밀번호가 10자리(예: 10XXXXXXXX)로 맨 앞 0이 누락되어 있고, 아이디가 a010... 형태라면 자동으로 '0'을 붙여 010... 양식 복원
      if (pw.length === 10 && /^1[0-9]{9}$/.test(pw) && (username.startsWith('a01') || username.startsWith('01') || pw.startsWith('10'))) {
        pw = '0' + pw;
      }

      members.push({ role, orgName, username, password: pw });
    }

    res.json({ members });
  } catch (error: any) {
    console.error("[Members] Load error:", error.message);
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/members/save', async (req, res) => {
  try {
    const client = await getAuthenticatedClient(req, res);
    if (!client) return;
    const { members } = req.body;
    if (!Array.isArray(members)) return res.status(400).json({ error: 'Invalid members data' });

    let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
    if (sheetId && sheetId.includes('spreadsheets/d/')) {
      sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
    }
    if (!sheetId) return res.status(400).json({ error: 'Spreadsheet ID not found' });

    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let accountSheet = sheetsList.find(s => s.properties?.title === '조직계정설정');
    
    let aSheetId = accountSheet?.properties?.sheetId;

    if (!accountSheet) {
      const addSheetRes = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: '조직계정설정' } } }] }
      });
      aSheetId = addSheetRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
    }

    // 1. [중요] values.update 전에 먼저 A~D 열 전체를 TEXT 서식으로 지정하여 앞자리 0 보존 환경을 선제 구축
    if (aSheetId != null) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: aSheetId, startColumnIndex: 0, endColumnIndex: 4 },
                  cell: {
                    userEnteredFormat: {
                      numberFormat: { type: 'TEXT' }
                    }
                  },
                  fields: 'userEnteredFormat.numberFormat'
                }
              }
            ]
          }
        });
      } catch (fmtErr) {
        console.warn('[MEMBERS-SAVE] Pre-format TEXT error:', fmtErr);
      }
    }

    // 헤더 포함 및 비밀번호 0 누락 방지 보정
    const rows = [['구분', '조직명', '아이디', '비밀번호']];
    members.forEach(m => {
      const uname = String(m.username ?? '').trim();
      let pw = String(m.password ?? '').trim();
      // 만약 비밀번호가 10자리(10XXXXXXXX)이고 아이디가 a01... 형태이거나 10으로 시작하는 경우 010... 형식으로 복원
      if (pw.length === 10 && /^1[0-9]{9}$/.test(pw) && (uname.startsWith('a01') || uname.startsWith('01') || pw.startsWith('10'))) {
        pw = '0' + pw;
      }
      rows.push([String(m.role || ''), String(m.orgName || ''), uname, String(pw)]);
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: '조직계정설정!A:D'
    });

    // 2. valueInputOption을 'RAW'로 설정하여 문자열(010XXXXXXXX, 0123 등)이 숫자로 자동 변환되어 앞자리 0이 유실되는 현상 원천 차단
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: '조직계정설정!A1',
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });

    // 3. 저장 완료 후 헤더 스타일 및 TEXT 서식 재확정
    if (aSheetId != null) {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              // 전체 A~D 열을 TEXT 서식으로 지정하여 앞자리 0 보존
              {
                repeatCell: {
                  range: { sheetId: aSheetId, startColumnIndex: 0, endColumnIndex: 4 },
                  cell: {
                    userEnteredFormat: {
                      numberFormat: { type: 'TEXT' }
                    }
                  },
                  fields: 'userEnteredFormat.numberFormat'
                }
              },
              // 헤더 스타일
              {
                repeatCell: {
                  range: { sheetId: aSheetId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      } catch (postErr) {
        console.warn('[MEMBERS-SAVE] Post-format error:', postErr);
      }
    }

    res.json({ success: true, count: members.length });
  } catch (error: any) {
    console.error("[Members] Save error:", error.message);
    return handleGoogleError(error, res);
  }
});

app.get('/api/sheets/settings/load', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '시스템설정',
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.log("[CloudSync] No settings rows found in cloud.");
      return res.json({ settings: null });
    }

    // 헤더 행을 읽어 열 인덱스를 동적으로 파악 (열 순서 변경에 강건하게 처리)
    const headerRow = (rows[0] || []).map((h: any) => (String(h) || '').trim());
    const col = (name: string) => headerRow.indexOf(name);

    const idCol = col('본부ID');
    const hqNameCol = col('본부명');
    
    // 필수 헤더가 없으면 데이터가 꼬인 것으로 간주하고 로드 중단
    if (idCol === -1 || hqNameCol === -1) {
      console.error("[CloudSync] Essential headers (본부ID, 본부명) missing. Reset required.");
      return res.status(422).json({ error: '구글 시트의 데이터 구조가 올바르지 않습니다. 설정 초기화가 필요합니다.' });
    }

    const settlementTypeCol = col('정산유형');
    const isActiveCol = col('운영여부');
    const bankCol = col('은행');
    const accountNumberCol = col('계좌번호');
    const accountHolderCol = col('예금주');
    const paymentMethodCol = col('지급방식');
    const overridingCol = col('오버라이딩활성');
    const salespersonCol = col('비율(영업)');
    const teamLeaderCol = col('비율(팀장)');
    const branchManagerCol = col('비율(지사)');
    const hqManagerCol = col('비율(본부)');
    const productNameCol = col('상품명');
    const totalAmountCol = col('전체수수료');
    const salesAmountCol = col('판매수수료');
    const productOverrideCol = col('오버라이딩적용');
    const tier1CountCol = col('구간1건');
    const tier1PriceCol = col('구간1단가');
    const tier2CountCol = col('구간2건');
    const tier2PriceCol = col('구간2단가');
    const tier3CountCol = col('구간3건');
    const tier3PriceCol = col('구간3단가');
    const prodSpCol = col('상품영업');
    const prodTlCol = col('상품팀장');
    const prodBmCol = col('상품지사');
    const prodHmCol = col('상품본부');
    const applyMaintenanceCol = col('상품유지수수료활성');
    const maintenanceRulesCol = col('상품유지수수료룰');

    console.log(`[CloudSync] Header detected: id=${idCol}, settlementType=${settlementTypeCol}, isActive=${isActiveCol}, bank=${bankCol}`);

    const hqMap = new Map<string, any>();
    
    rows.slice(1).forEach((row: string[]) => {
      const id = idCol >= 0 ? row[idCol] : row[0];
      if (!id) return;

      if (!hqMap.has(id)) {
        hqMap.set(id, {
          id,
          hqName: hqNameCol >= 0 ? (row[hqNameCol] || '') : (row[1] || ''),
          settlementType: settlementTypeCol >= 0 ? (row[settlementTypeCol] || '사업자') : '사업자',
          isActive: isActiveCol >= 0 ? row[isActiveCol] !== 'N' : true,
          bankName: bankCol >= 0 ? (row[bankCol] || '') : '',
          accountNumber: accountNumberCol >= 0 ? (row[accountNumberCol] || '') : '',
          accountHolder: accountHolderCol >= 0 ? (row[accountHolderCol] || '') : '',
          paymentMethod: paymentMethodCol >= 0 ? (row[paymentMethodCol] || '') : '',
          enableOverriding: overridingCol >= 0 ? row[overridingCol] === 'Y' : false,
          overriding: {
            salesperson: salespersonCol >= 0 ? (Number(row[salespersonCol]) || 0) : 0,
            teamLeader: teamLeaderCol >= 0 ? (Number(row[teamLeaderCol]) || 0) : 0,
            branchManager: branchManagerCol >= 0 ? (Number(row[branchManagerCol]) || 0) : 0,
            hqManager: hqManagerCol >= 0 ? (Number(row[hqManagerCol]) || 0) : 0,
          },
          productRules: []
        });
      }

      const productName = productNameCol >= 0 ? row[productNameCol] : undefined;
      if (productName && productName !== '-') {
        let pMaintRules = [];
        if (maintenanceRulesCol >= 0 && row[maintenanceRulesCol]) {
          try {
            pMaintRules = JSON.parse(row[maintenanceRulesCol]);
          } catch (e) {
            console.error("Parse maintenanceRules error:", e);
          }
        }

        hqMap.get(id).productRules.push({
          productName,
          totalAmount: totalAmountCol >= 0 ? (Number(row[totalAmountCol]) || 0) : 0,
          salesAmount: salesAmountCol >= 0 ? (Number(row[salesAmountCol]) || 0) : 0,
          applyOverriding: productOverrideCol >= 0 ? row[productOverrideCol] !== 'N' : true,
          tier1Count: tier1CountCol >= 0 ? (Number(row[tier1CountCol]) || 0) : 0,
          tier1Price: tier1PriceCol >= 0 ? (Number(row[tier1PriceCol]) || 0) : 0,
          tier2Count: tier2CountCol >= 0 ? (Number(row[tier2CountCol]) || 0) : 0,
          tier2Price: tier2PriceCol >= 0 ? (Number(row[tier2PriceCol]) || 0) : 0,
          tier3Count: tier3CountCol >= 0 ? (Number(row[tier3CountCol]) || 0) : 0,
          tier3Price: tier3PriceCol >= 0 ? (Number(row[tier3PriceCol]) || 0) : 0,
          overriding: (prodSpCol >= 0 && row[prodSpCol] !== undefined) ? {
            salesperson: Number(row[prodSpCol]) || 0,
            teamLeader: Number(row[prodTlCol]) || 0,
            branchManager: Number(row[prodBmCol]) || 0,
            hqManager: Number(row[prodHmCol]) || 0
          } : undefined,
          applyMaintenance: applyMaintenanceCol >= 0 
            ? (row[applyMaintenanceCol] === 'Y' || row[applyMaintenanceCol] === 'true' || (row[applyMaintenanceCol] !== 'N' && row[applyMaintenanceCol] !== 'false' && (productName.includes('유지') || pMaintRules.length > 0)))
            : (productName.includes('유지') || pMaintRules.length > 0),
          maintenanceRules: pMaintRules
        });
      }
    });

    console.log(`[CloudSync] Loaded ${hqMap.size} HQs from cloud.`);

    // -- Load globalIncentives --
    let globalIncentives: any[] = [];
    try {
      const incentiveResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: '특수수당설정',
      });
      const incRows = incentiveResponse.data.values;
      if (incRows && incRows.length >= 2) {
        const incHeaderRow = (incRows[0] || []).map((h: any) => (String(h) || '').trim());
        const iCol = (name: string) => incHeaderRow.indexOf(name);
        
        const iId = iCol('ID');
        const iTargetName = iCol('수급자명');
        const iPayDay = iCol('지급일(일)');
        const iTargetHq = iCol('대상본부');
        const iTargetProducts = iCol('대상상품');
        const iBaseDateType = iCol('기준일자');
        const iCommissionPerUnit = iCol('건당수수료');
        const iMinimumGuarantee = iCol('최소보장금액');

        const iIncentiveName = iCol('수당종류');
        const iTargetHqs = iCol('대상본부배열');
        const iUseInstallments = iCol('할부사용여부');
        const iInstallments = iCol('할부룰');
        const iTargetItems = iCol('대상제품배열');
        const iTaxType = iCol('정산유형');
        const iTaxBusinessName = iCol('발행사업자명');
        const iTaxBusinessNo = iCol('사업자번호');
        const iTargetDivisions = iCol('대상사업단배열');

        globalIncentives = incRows.slice(1).map((row: string[]) => {
          const productsStr = iTargetProducts >= 0 ? (row[iTargetProducts] || '') : '';
          const targetProducts = productsStr ? productsStr.split(',').map(s => s.trim()).filter(s => s) : ['ALL'];
          
          let targetHqs = ['ALL'];
          if (iTargetHqs >= 0 && row[iTargetHqs]) {
            try { targetHqs = JSON.parse(row[iTargetHqs]); } catch(e){}
          } else if (iTargetHq >= 0 && row[iTargetHq]) {
             targetHqs = [row[iTargetHq]];
          }

          let targetDivisions: string[] = [];
          if (iTargetDivisions >= 0 && row[iTargetDivisions]) {
            try { targetDivisions = JSON.parse(row[iTargetDivisions]); } catch(e){}
          }

          let installments = [];
          if (iInstallments >= 0 && row[iInstallments]) {
            try { installments = JSON.parse(row[iInstallments]); } catch(e){}
          }

          let targetItems = ['ALL'];
          if (iTargetItems >= 0 && row[iTargetItems]) {
            try { targetItems = JSON.parse(row[iTargetItems]); } catch(e){}
          }

          return {
            id: iId >= 0 ? row[iId] : Date.now().toString() + Math.random(),
            incentiveName: iIncentiveName >= 0 ? row[iIncentiveName] : '',
            targetName: iTargetName >= 0 ? row[iTargetName] : '',
            payDay: iPayDay >= 0 && row[iPayDay] !== undefined && row[iPayDay] !== '' ? (parseInt(row[iPayDay]) || 0) : 0,
            targetHq: iTargetHq >= 0 ? row[iTargetHq] : '',
            targetHqs,
            targetDivisions,
            targetProducts,
            targetItems,
            baseDateType: iBaseDateType >= 0 ? row[iBaseDateType] : 'DELIVERY',
            commissionPerUnit: iCommissionPerUnit >= 0 ? (parseInt(row[iCommissionPerUnit]) || 0) : 0,
            minimumGuarantee: iMinimumGuarantee >= 0 ? (parseInt(row[iMinimumGuarantee]) || 0) : 0,
            useInstallments: iUseInstallments >= 0 ? (row[iUseInstallments] === 'Y') : false,
            installments,
            taxType: iTaxType >= 0 ? (row[iTaxType] as any) || 'DEFAULT' : 'DEFAULT',
            taxBusinessName: iTaxBusinessName >= 0 ? row[iTaxBusinessName] || '' : '',
            taxBusinessNo: iTaxBusinessNo >= 0 ? row[iTaxBusinessNo] || '' : ''
          };
        }).filter((r: any) => r.targetName || r.incentiveName || r.commissionPerUnit || (r.installments && r.installments.length > 0) || r.id);
        console.log(`[CloudSync] Loaded ${globalIncentives.length} global incentives from cloud.`);
        console.log('[CloudSync] Global incentives detail:', JSON.stringify(globalIncentives, null, 2));
      }
    } catch (e: any) {
      console.log("[CloudSync] '특수수당설정' sheet might not exist yet.");
    }

    // -- Load maintenanceRules --
    let maintenanceRules: any[] = [];
    try {
      const mResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: '유지수수료설정',
      });
      const mRows = mResponse.data.values;
      if (mRows && mRows.length >= 2) {
        const mHeaderRow = (mRows[0] || []).map((h: any) => (String(h) || '').trim());
        const mCol = (name: string) => mHeaderRow.indexOf(name);
        
        const mId = mCol('ID');
        const mHq = mCol('대상본부');
        const mProduct = mCol('대상상품');
        const mTiers = mCol('회차별구간');
        const mStartDate = mCol('적용시작일');
        const mEndDate = mCol('적용종료일');

        maintenanceRules = mRows.slice(1).map((row: string[]) => {
          let targetHqs = ['ALL'];
          let targetProducts = ['ALL'];
          let tiers = [];
          
          try { if (mHq >= 0 && row[mHq]) targetHqs = JSON.parse(row[mHq]); } catch(e){}
          try { if (mProduct >= 0 && row[mProduct]) targetProducts = JSON.parse(row[mProduct]); } catch(e){}
          try { if (mTiers >= 0 && row[mTiers]) tiers = JSON.parse(row[mTiers]); } catch(e){}

          return {
            id: mId >= 0 ? row[mId] : Date.now().toString() + Math.random(),
            targetHqs,
            targetProducts,
            tiers,
            applyStartDate: (mStartDate >= 0 && row[mStartDate]) ? row[mStartDate] : '',
            applyEndDate: (mEndDate >= 0 && row[mEndDate]) ? row[mEndDate] : ''
          };
        }).filter((r: any) => r.targetProducts && r.targetProducts.length > 0);
        console.log(`[CloudSync] Loaded ${maintenanceRules.length} maintenance rules from cloud.`);
      }
    } catch (e: any) {
      console.log("[CloudSync] '유지수수료설정' sheet might not exist yet.");
    }

    // -- Load extra settings (manualOrderProducts, manualOrderStores, reportSettings, divisions) --
    let manualOrderProducts: string[] | null = null;
    let manualOrderStores: Record<string, any> | null = null;
    let reportSettings: Record<string, any> | null = null;
    let divisions: any[] | null = null;

    try {
      const extraResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: '수기발주및기타설정',
      });
      const extraRows = extraResponse.data.values;
      if (extraRows && extraRows.length >= 2) {
        extraRows.slice(1).forEach((row: string[]) => {
          const key = row[0];
          const valStr = row[1];
          if (!key || !valStr) return;
          try {
            if (key === 'MANUAL_ORDER_PRODUCTS') manualOrderProducts = JSON.parse(valStr);
            if (key === 'MANUAL_ORDER_STORES') manualOrderStores = JSON.parse(valStr);
            if (key === 'REPORT_SETTINGS') reportSettings = JSON.parse(valStr);
            if (key === 'BUSINESS_DIVISIONS') divisions = JSON.parse(valStr);
          } catch (e) {
            console.error(`[CloudSync] Parse ${key} error:`, e);
          }
        });
        console.log(`[CloudSync] Loaded extra settings (manual orders, report, divisions) from cloud.`);
      }
    } catch (e: any) {
      console.log("[CloudSync] '수기발주및기타설정' sheet might not exist yet.");
    }

    // 로컬 파일 캐시 백업 병합 (구글시트에 데이터가 없는 항목이 있으면 백업에서 채움)
    try {
      const cachePath = path.join(process.cwd(), '.settings_cache.json');
      if (fs.existsSync(cachePath)) {
        const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cacheData.globalIncentives && Array.isArray(cacheData.globalIncentives)) {
          if (!globalIncentives || globalIncentives.length === 0) {
            globalIncentives = cacheData.globalIncentives;
          } else {
            const cacheRuleMap = new Map(cacheData.globalIncentives.map((r: any) => [r.id, r]));
            globalIncentives = globalIncentives.map((r: any) => {
              if ((!r.targetDivisions || r.targetDivisions.length === 0) && cacheRuleMap.has(r.id)) {
                const c = cacheRuleMap.get(r.id);
                if (c && Array.isArray(c.targetDivisions) && c.targetDivisions.length > 0) {
                  return { ...r, targetDivisions: c.targetDivisions };
                }
              }
              return r;
            });
          }
        }
        if ((!maintenanceRules || maintenanceRules.length === 0) && cacheData.maintenanceRules && Array.isArray(cacheData.maintenanceRules)) {
          maintenanceRules = cacheData.maintenanceRules;
        }
        if (!manualOrderProducts && cacheData.manualOrderProducts) manualOrderProducts = cacheData.manualOrderProducts;
        if (!manualOrderStores && cacheData.manualOrderStores) manualOrderStores = cacheData.manualOrderStores;
        if (cacheData.divisions && Array.isArray(cacheData.divisions) && cacheData.divisions.length > 0) {
          if (!divisions || (Array.isArray(divisions) && divisions.length === 0)) {
            divisions = cacheData.divisions;
          } else {
            const cacheDivMap = new Map(cacheData.divisions.map((d: any) => [d.id, d]));
            divisions = divisions.map((d: any) => {
              const cached = cacheDivMap.get(d.id);
              if (cached && Array.isArray(cached.hqNames) && Array.isArray(d.hqNames)) {
                return {
                  ...d,
                  hqNames: Array.from(new Set([...d.hqNames, ...cached.hqNames]))
                };
              }
              return d;
            });
          }
        }
      }
    } catch (e) {}

    res.json({
      settings: Array.from(hqMap.values()),
      globalIncentives,
      maintenanceRules,
      manualOrderProducts,
      manualOrderStores,
      reportSettings,
      divisions: divisions || []
    });
  } catch (error: any) {
    console.error("[CloudSync] Load error:", error.message);
    // 구글 API 에러(429 쿼터 초과, 네트워크 오류 등) 발생 시 로컬 디스크 캐시 백업으로 즉시 자동 폴백
    try {
      const cachePath = path.join(process.cwd(), '.settings_cache.json');
      if (fs.existsSync(cachePath)) {
        const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cacheData.settings && cacheData.settings.length > 0) {
          console.log("[CloudSync] Successfully loaded settings from local cache fallback due to cloud error.");
          return res.json({
            settings: cacheData.settings || null,
            globalIncentives: cacheData.globalIncentives || [],
            maintenanceRules: cacheData.maintenanceRules || [],
            manualOrderProducts: cacheData.manualOrderProducts || null,
            manualOrderStores: cacheData.manualOrderStores || null,
            reportSettings: cacheData.reportSettings || null,
            divisions: cacheData.divisions || []
          });
        }
      }
    } catch (e) {}
    return handleGoogleError(error, res);
  }
});

// 유지수수료 지급 내역(히스토리) 조회 API
app.get('/api/sheets/maintenance/history', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '유지수수료내역',
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      return res.json({ history: [] });
    }

    const headers = (rows[0] || []).map((h: any) => (String(h) || '').trim());
    const col = (name: string) => headers.indexOf(name);
    
    const resNoCol = col('계약번호');
    const payMonthCol = col('지급년월');
    const payInstallmentCol = col('지급회차');
    const amountCol = col('지급액');
    const customerNameCol = col('고객명');
    const productNameCol = col('상품명');
    const memoCol = col('메모');

    if (resNoCol === -1 || payInstallmentCol === -1) {
      return res.json({ history: [] });
    }

    const history = rows.slice(1).map((row: string[]) => ({
      resNo: row[resNoCol],
      payMonth: payMonthCol >= 0 ? row[payMonthCol] : '',
      payInstallment: parseInt(row[payInstallmentCol]) || 0,
      amount: amountCol >= 0 ? (parseInt(row[amountCol]) || 0) : 0,
      customerName: customerNameCol >= 0 ? row[customerNameCol] : '',
      productName: productNameCol >= 0 ? row[productNameCol] : '',
      memo: memoCol >= 0 ? row[memoCol] : ''
    })).filter((h: any) => h.resNo);

    res.json({ history });
  } catch (error: any) {
    if (error.response?.status === 400 || error.message?.toLowerCase().includes('not found')) {
      return res.json({ history: [] });
    }
    console.error("[Maintenance History] Load error:", error.message);
    return handleGoogleError(error, res);
  }
});

// 유지수수료 지급 내역(히스토리) 저장 API
app.post('/api/sheets/maintenance/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { rows } = req.body as { rows: any[][] };
  if (!rows || rows.length === 0) return res.status(400).json({ error: 'No data to save' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let historySheet = sheetsList.find(s => s.properties?.title === '유지수수료내역');
    let sheetInternalId: number | null | undefined = historySheet?.properties?.sheetId;
    
    if (!historySheet) {
      console.log("[Maintenance History] Creating '유지수수료내역' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '유지수수료내역' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      
      const headers = [['계약번호', '지급년월', '지급회차', '지급액', '고객명', '상품명', '메모']];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '유지수수료내역!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: headers }
      });
      
      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: '유지수수료내역!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Maintenance History Save Error]", error);
    return handleGoogleError(error, res);
  }
});

// 유지수수료 지급 내역(히스토리) 동기화(전체 덮어쓰기) API
app.post('/api/sheets/maintenance/sync', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { history } = req.body as { history: any[] };
  if (!history) return res.status(400).json({ error: 'No history data provided' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let historySheet = sheetsList.find(s => s.properties?.title === '유지수수료내역');
    let sheetInternalId: number | null | undefined = historySheet?.properties?.sheetId;
    
    if (!historySheet) {
      console.log("[Maintenance History] Creating '유지수수료내역' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '유지수수료내역' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
    }

    const headers = ['계약번호', '지급년월', '지급회차', '지급액', '고객명', '상품명', '메모'];
    const rows = [headers, ...history.map(h => [
      h.resNo || '',
      h.payMonth || '',
      h.payInstallment || 0,
      h.amount || 0,
      h.customerName || '',
      h.productName || '',
      h.memo || ''
    ])];

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: '유지수수료내역',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: '유지수수료내역!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });

    if (sheetInternalId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    horizontalAlignment: 'CENTER'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
              }
            }
          ]
        }
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Maintenance History Sync Error]", error);
    return handleGoogleError(error, res);
  }
});

// 취소/해약 로그를 '취소해약내역' 시트에 기록하는 헬퍼 함수
async function logStatusChangesToCancelSheet(
  sheets: any,
  sheetId: string,
  items: { rowIdx: number; newStatus: string; memo?: string }[],
  operatorName: string
) {
  try {
    const cancelTargets = items.filter(
      item => item.newStatus && (item.newStatus.includes('취소') || item.newStatus.includes('해약'))
    );
    if (cancelTargets.length === 0) return;

    // 한국 시간 기준 YYYY-MM-DD HH:mm:ss
    const now = new Date();
    const kstDate = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    const formattedDate = kstDate.replace(/\.\s*/g, (m, offset) => offset < 10 ? '-' : ' ').trim();

    // 관리대장에서 해당 행 데이터 가져오기
    const ranges = cancelTargets.map(t => `관리대장!A${t.rowIdx}:O${t.rowIdx}`);
    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges
    });

    const logRows: any[][] = [];
    (batchRes.data.valueRanges || []).forEach((vr: any, idx: number) => {
      const r = vr.values?.[0] || [];
      const target = cancelTargets[idx];
      logRows.push([
        formattedDate,              // 변경일시
        target.newStatus,           // 구분 (취소 / 해약)
        r[2] || '',                 // 회원번호
        r[3] || '',                 // 고객명
        r[5] || '',                 // 핸드폰
        r[6] || '',                 // 상품명
        r[7] || '',                 // 본부명
        r[8] || '',                 // 지사명
        r[9] || '',                 // 사원명
        r[10] || '',                // 렌탈계약번호
        r[0] || '',                 // 계약일자
        r[13] || '',                // 배송일자
        r[14] || '',                // 수수료지급일자
        operatorName || '관리자',   // 처리자
        target.memo || '계약상태관리 변경' // 비고
      ]);
    });

    if (logRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '취소해약내역!A:O',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: logRows
        }
      });
      console.log(`[취소해약내역] ${logRows.length}건 상태 변경 로그 기록 완료`);
    }
  } catch (err: any) {
    console.error('[취소해약내역 로그 기록 오류]:', err.message || err);
  }
}

app.post('/api/sheets/update', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { rowIdx, colIdx, newValue, operator, expectedMemNo, expectedRentalNo } = req.body;
  let sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  if (sheetId.includes('spreadsheets/d/')) {
    const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) sheetId = match[1];
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // 시트 이름 확인
    let sheetName = (req.body as any).sheetName;
    if (!sheetName) {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      const sheetsList = spreadsheet.data.sheets || [];
      const targetSheet = sheetsList.find(s => s.properties?.title === '관리대장') || 
                          sheetsList.find(s => s.properties?.title?.includes('회원현황')) ||
                          sheetsList[0];
      sheetName = targetSheet?.properties?.title || 'Sheet1';
    }

    let targetRowIdx = Number(rowIdx);

    // ⭐ [안전 검증] 회원번호(C열) 실시간 대조 및 행 번호 자동 보정 (다른 행 오염 원천 차단)
    if (expectedMemNo && (sheetName === '관리대장' || sheetName.includes('회원현황'))) {
      const cleanExpectedMemNo = String(expectedMemNo).trim();
      let isVerified = false;

      // 1단계: 지정된 rowIdx의 C열(회원번호)이 일치하는지 먼저 초고속 확인
      if (targetRowIdx && targetRowIdx >= 2) {
        try {
          const checkResp = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `'${sheetName}'!C${targetRowIdx}`
          });
          const actualMemNo = String(checkResp.data.values?.[0]?.[0] || '').trim();
          if (actualMemNo === cleanExpectedMemNo) {
            isVerified = true;
          }
        } catch (e) {
          console.warn('[update] Row verification check failed:', e);
        }
      }

      // 2단계: 일치하지 않는 경우(시트 정렬/행 삽입/삭제 등으로 행이 밀린 경우) 시트 전체에서 실시간 검색 보정
      if (!isVerified) {
        console.warn(`[update] Row ${targetRowIdx} does NOT match memNo '${cleanExpectedMemNo}'. Searching entire sheet to locate real row...`);
        const allMemResp = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `'${sheetName}'!C:C`
        });
        const allMemRows = allMemResp.data.values || [];
        let foundRow = -1;
        for (let r = 0; r < allMemRows.length; r++) {
          const mNo = String(allMemRows[r]?.[0] || '').trim();
          if (mNo === cleanExpectedMemNo) {
            foundRow = r + 1; // 1-based index
            break;
          }
        }

        if (foundRow > 0) {
          console.log(`[update] Corrected row position for memNo '${cleanExpectedMemNo}': row ${foundRow} (was ${targetRowIdx})`);
          targetRowIdx = foundRow;
        } else {
          console.error(`[update] CRITICAL ERROR: memNo '${cleanExpectedMemNo}' NOT FOUND in sheet. Aborting to protect other rows!`);
          return res.status(404).json({
            error: `시트에서 회원번호 '${cleanExpectedMemNo}'를 찾을 수 없습니다. 다른 행이 잘못 변경되는 사고를 막기 위해 수정을 중단했습니다. 데이터를 새로고침해 주세요.`
          });
        }
      }
    }

    // colIdx to letter (0 -> A, 1 -> B, ...)
    const getColLetter = (n: number) => {
      let letter = '';
      while (n >= 0) {
        letter = String.fromCharCode((n % 26) + 65) + letter;
        n = Math.floor(n / 26) - 1;
      }
      return letter;
    };

    const range = `'${sheetName}'!${getColLetter(colIdx)}${targetRowIdx}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[newValue]]
      }
    });

    // 계약상태(colIdx === 1)가 취소 또는 해약으로 변경된 경우 취소해약내역 시트에 로그 자동 기록
    if (colIdx === 1 && (sheetName === '관리대장' || sheetName.includes('회원현황'))) {
      let opName = operator;
      if (!opName && (req as any).signedCookies?.user_auth) {
        try {
          opName = JSON.parse((req as any).signedCookies.user_auth).username;
        } catch (e) {}
      }
      if (!opName) opName = '관리자';
      logStatusChangesToCancelSheet(sheets, sheetId, [{ rowIdx: targetRowIdx, newStatus: newValue }], opName).catch(e => console.error(e));
    }

    res.json({ success: true, updatedRow: targetRowIdx });
  } catch (error: any) {
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/batch-update', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { updates, operator } = req.body as { 
    updates: { rowIdx: number; colIdx: number; newValue: string; expectedMemNo?: string; expectedRentalNo?: string }[]; 
    operator?: string 
  };
  if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Invalid updates' });

  let sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  if (sheetId.includes('spreadsheets/d/')) {
    const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) sheetId = match[1];
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const requestedSheetName = (req.body as any).sheetName;
    let sheetName = requestedSheetName;

    if (!sheetName) {
      // Get sheet name fallback
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      const sheetsList = spreadsheet.data.sheets || [];
      const targetSheet = sheetsList.find(s => s.properties?.title === '관리대장') || 
                          sheetsList.find(s => s.properties?.title?.includes('회원현황')) ||
                          sheetsList[0];
      sheetName = targetSheet?.properties?.title || 'Sheet1';
    }

    // colIdx to letter
    const getColLetter = (n: number) => {
      let letter = '';
      while (n >= 0) {
        letter = String.fromCharCode((n % 26) + 65) + letter;
        n = Math.floor(n / 26) - 1;
      }
      return letter;
    };

    // ⭐ 회원번호 맵(C열 전체)을 한 번만 읽어 캐싱하여 일괄 검색 보정 성능 극대화
    let memNoRowMap: Map<string, number> | null = null;
    const hasExpectedMemNos = updates.some(u => u.expectedMemNo);
    if (hasExpectedMemNos && (sheetName === '관리대장' || sheetName.includes('회원현황'))) {
      try {
        const allMemResp = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `'${sheetName}'!C:C`
        });
        const allRows = allMemResp.data.values || [];
        memNoRowMap = new Map();
        for (let r = 0; r < allRows.length; r++) {
          const m = String(allRows[r]?.[0] || '').trim();
          if (m) memNoRowMap.set(m, r + 1);
        }
      } catch (e) {
        console.warn('[batch-update] Could not preload C:C column:', e);
      }
    }

    console.log(`[batch-update] Updating ${updates.length} items in sheet: '${sheetName}'`);
    const successfulRowUpdates: { rowIdx: number; newStatus: string }[] = [];

    for (const u of updates) {
      let targetRow = Number(u.rowIdx);

      // 회원번호 기반 실시간 행 보정
      if (u.expectedMemNo && memNoRowMap) {
        const cleanNo = String(u.expectedMemNo).trim();
        const found = memNoRowMap.get(cleanNo);
        if (found) {
          targetRow = found;
        } else {
          console.warn(`[batch-update] memNo '${cleanNo}' not found in sheet. Skipping this item to prevent corrupting other rows!`);
          continue; // 다른 엉뚱한 행 오염 방지를 위해 안전 스킵!
        }
      }

      const range = `'${sheetName}'!${getColLetter(u.colIdx)}${targetRow}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[u.newValue]]
        }
      });

      if (u.colIdx === 1) {
        successfulRowUpdates.push({ rowIdx: targetRow, newStatus: u.newValue });
      }
    }

    // 계약상태(colIdx === 1)가 취소 또는 해약으로 변경된 항목들 취소해약내역 시트에 일괄 로그 기록
    if (sheetName === '관리대장' || sheetName.includes('회원현황')) {
      const statusUpdates = successfulRowUpdates
        .filter(u => u.newStatus && (u.newStatus.includes('취소') || u.newStatus.includes('해약')));
      if (statusUpdates.length > 0) {
        let opName = operator;
        if (!opName && (req as any).signedCookies?.user_auth) {
          try {
            opName = JSON.parse((req as any).signedCookies.user_auth).username;
          } catch (e) {}
        }
        if (!opName) opName = '관리자';
        logStatusChangesToCancelSheet(sheets, sheetId, statusUpdates, opName).catch(e => console.error(e));
      }
    }

    res.json({ success: true, updatedCount: successfulRowUpdates.length });
  } catch (error: any) {
    console.error('[batch-update] Error:', error);
    return handleGoogleError(error, res);
  }
});

// 취소해약내역 조회 API
app.get('/api/sheets/cancel-log', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });
  if (sheetId.includes('spreadsheets/d/')) {
    const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) sheetId = match[1];
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '취소해약내역!A1:O2000'
    });
    const rows = response.data.values || [];
    if (rows.length < 2) return res.json({ success: true, logs: [] });

    const headers = rows[0];
    const logs = rows.slice(1).map(r => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => {
        obj[h] = r[i] || '';
      });
      return obj;
    });

    res.json({ success: true, logs });
  } catch (error: any) {
    console.error('[취소해약내역 조회 에러]:', error);
    return handleGoogleError(error, res);
  }
});

app.get('/api/sheets/data', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다. 구글 시트 연동을 먼저 진행해 주세요.' });

  let sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID가 설정되지 않았습니다. Secrets 메뉴에서 설정해 주세요.' });

  if (sheetId.includes('spreadsheets/d/')) {
    const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) sheetId = match[1];
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // 시트 목록을 가져와서 '관리대장' 시트가 있는지 확인, 없으면 첫 번째 시트 사용
    let range = 'A:AC';
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      const sheetsList = spreadsheet.data.sheets || [];
      const targetSheet = sheetsList.find(s => s.properties?.title === '관리대장') || 
                          sheetsList.find(s => s.properties?.title?.includes('회원현황')) ||
                          sheetsList[0];
      
      const sheetName = targetSheet?.properties?.title || 'Sheet1';
      range = `${sheetName}!A:ZZ`;
      console.log('Fetching from sheet:', sheetName);
    } catch (e) {
      console.warn('Could not fetch spreadsheet metadata, falling back to A:AC', e);
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json([]);
    }



    res.json(rows);
  } catch (error: any) {
    return handleGoogleError(error, res);
  }
});

// 구글 시트 데이터 인메모리 캐시 (반복 호출 시 로딩 지연 방지)
const sheetDataCache = new Map<string, { timestamp: number; data: any[] }>();
const SHEET_DATA_CACHE_TTL = 3 * 60 * 1000; // 3분 캐시

app.get('/api/sheets/sheetData', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  if (sheetId.includes('spreadsheets/d/')) {
    const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) sheetId = match[1];
  }

  const sheetName = req.query.sheetName as string;
  if (!sheetName) return res.status(400).json({ error: 'sheetName is required' });

  const forceFresh = req.query.fresh === 'true' || req.query.forceFresh === 'true';
  const cached = sheetDataCache.get(sheetName);
  const now = Date.now();
  if (!forceFresh && cached && (now - cached.timestamp < SHEET_DATA_CACHE_TTL)) {
    return res.json(cached.data);
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      sheetDataCache.set(sheetName, { timestamp: now, data: [] });
      return res.json([]);
    }

    sheetDataCache.set(sheetName, { timestamp: now, data: rows });
    res.json(rows);
  } catch (error: any) {
    if (error.code === 400 || (error.message && error.message.includes('Unable to parse range'))) {
       // Sheet might not exist
       return res.json([]);
    }
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/manual-settlement/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { rows } = req.body as { rows: any[][] };
  if (!rows || rows.length === 0) return res.status(400).json({ error: 'No data to save' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let manualSheet = sheetsList.find(s => s.properties?.title === '수동정산내역');
    let sheetInternalId: number | null | undefined = manualSheet?.properties?.sheetId;
    
    if (!manualSheet) {
      console.log("[CloudSync] Creating '수동정산내역' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '수동정산내역' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      
      const headers = [['지급일자', '본부명', '계좌정보', '정산기준', '상품명', '판매수수료', '판매촉진비', '구좌수', '총지급액']];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '수동정산내역!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: headers }
      });
      
      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: '수동정산내역!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Manual Settlement Save Error]", error);
    return handleGoogleError(error, res);
  }
});

// KB헬스케어대상자 시트 데이터 로드 API
app.get('/api/sheets/kb-healthcare-data', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // 스프레드시트 전체 시트(탭) 목록 가져오기
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    const allSheetTitles = sheetsList.map(s => s.properties?.title || '').filter(Boolean);

    console.log("[Google Sheets All Titles]", allSheetTitles);

    const reqTabName = req.query.tabName ? String(req.query.tabName).trim() : '';

    let targetSheetTitle = reqTabName;
    if (reqTabName) {
      const normReq = reqTabName.replace(/\s+/g, '');
      const matched = sheetsList.find(s => {
        const title = (s.properties?.title || '').trim();
        return title === reqTabName || title.replace(/\s+/g, '') === normReq;
      });
      if (matched?.properties?.title) {
        targetSheetTitle = matched.properties.title;
      }
    } else {
      const foundSheet = sheetsList.find(s => {
        const title = (s.properties?.title || '').replace(/\s+/g, '');
        return title.includes('KB헬스케어대상자') || title.includes('KB헬스케어') || title.includes('헬스케어');
      });
      targetSheetTitle = foundSheet?.properties?.title || 'KB헬스케어대상자';
    }

    console.log("[Target Sheet Title Selected]", targetSheetTitle);

    let rows: any[][] = [];
    try {
      const range = `'${targetSheetTitle}'!A:ZZ`;
      console.log(`[KB Healthcare Fetching Range]: ${range}`);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
      });
      rows = response.data.values || [];
    } catch (e1: any) {
      console.warn("[KB Healthcare Fetch Range Error]", e1?.message);
      try {
        const fallbackRange = `${targetSheetTitle}!A:ZZ`;
        const respFallback = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: fallbackRange,
        });
        rows = respFallback.data.values || [];
      } catch (e2: any) {
        console.warn("[KB Healthcare Fallback Error]", e2?.message);
        rows = [];
      }
    }

    console.log(`[KB Healthcare Loaded Rows Count]: ${rows.length}`);
    return res.json({ success: true, sheetTitle: targetSheetTitle, allSheetTitles, rows });
  } catch (error: any) {
    console.error("[KB Healthcare Load Error]", error?.message || error);
    return res.json({ success: false, sheetTitle: req.query.tabName || 'KB헬스케어대상자', allSheetTitles: [], rows: [] });
  }
});

// 공급사대사작업 시트 데이터 로드 API
app.get('/api/sheets/supplier-recon-data', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // 시트 메타데이터 조회
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    const allSheetTitles = sheetsList.map(s => s.properties?.title || '').filter(Boolean);

    const reqTabName = req.query.tabName ? String(req.query.tabName) : '';

    let targetSheetTitle = reqTabName;
    if (!targetSheetTitle) {
      const foundSheet = sheetsList.find(s => {
        const title = (s.properties?.title || '').replace(/\s+/g, '');
        return title === '공급사대사작업' || title.includes('공급사대사작업');
      }) || sheetsList.find(s => {
        const title = (s.properties?.title || '').replace(/\s+/g, '');
        return title.includes('유통사대사내역') || title.includes('공급사대사') || title.includes('유통사대사');
      });
      targetSheetTitle = foundSheet?.properties?.title || '공급사대사작업';
    }

    let rows: any[][] = [];
    try {
      const range = `${targetSheetTitle}!A:ZZ`;
      console.log(`[Supplier Recon Fetching Range]: ${range}`);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
      });
      rows = response.data.values || [];
    } catch (e1: any) {
      console.warn("[Supplier Recon Fetch Range Error]", e1?.message);
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: '공급사대사작업!A:ZZ',
      });
      rows = response.data.values || [];
    }

    console.log(`[Supplier Recon Loaded Rows Count]: ${rows.length}`);
    return res.json({ success: true, sheetTitle: targetSheetTitle, allSheetTitles, rows });
  } catch (error: any) {
    console.error("[Supplier Recon Load Error]", error?.message || error);
    return res.json({ success: false, sheetTitle: '공급사대사작업', allSheetTitles: [], rows: [] });
  }
});

// 수수료 일괄/단건 변경 및 '수수료변경이력' 탭 기록 API
app.post('/api/sheets/commission-log/batch-update', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { updates, reason, worker } = req.body as {
    updates: Array<{
      rowIdx: number;
      colIdx: number;
      oldValue?: string;
      newValue: string;
      contractNo?: string;
      rentalNo?: string;
      memName?: string;
      hqName?: string;
      fieldName?: string;
    }>;
    reason?: string;
    worker?: string;
  };

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: '업데이트할 항목이 없습니다.' });
  }

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // 대상 시트 이름 확인 (관리대장 등)
    let sheetName = (req.body as any).sheetName;
    if (!sheetName) {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
      const sheetsList = spreadsheet.data.sheets || [];
      const targetSheet = sheetsList.find(s => s.properties?.title === '관리대장') || 
                          sheetsList.find(s => s.properties?.title?.includes('회원현황')) ||
                          sheetsList[0];
      sheetName = targetSheet?.properties?.title || '관리대장';
    }

    const getColLetter = (n: number) => {
      let letter = '';
      while (n >= 0) {
        letter = String.fromCharCode((n % 26) + 65) + letter;
        n = Math.floor(n / 26) - 1;
      }
      return letter;
    };

    // 회원번호 맵(C열 전체) 캐싱하여 행 밀림 실시간 자동 보정
    let memNoRowMap: Map<string, number> | null = null;
    const hasContractNos = updates.some(u => u.contractNo);
    if (hasContractNos && (sheetName === '관리대장' || sheetName.includes('회원현황'))) {
      try {
        const allMemResp = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `'${sheetName}'!C:C`
        });
        const allRows = allMemResp.data.values || [];
        memNoRowMap = new Map();
        for (let r = 0; r < allRows.length; r++) {
          const m = String(allRows[r]?.[0] || '').trim();
          if (m) memNoRowMap.set(m, r + 1);
        }
      } catch (e) {
        console.warn('[commission-log] Could not preload C:C column:', e);
      }
    }

    // 1. 원본 시트 셀 업데이트 (실시간 행 위치 보정 적용)
    const validUpdatedItems: typeof updates = [];
    for (const u of updates) {
      let targetRow = Number(u.rowIdx);
      if (u.contractNo && memNoRowMap) {
        const cleanContractNo = String(u.contractNo).trim();
        const found = memNoRowMap.get(cleanContractNo);
        if (found) {
          targetRow = found;
        } else {
          console.warn(`[commission-log] contractNo '${cleanContractNo}' not found in sheet '${sheetName}'. Skipping to protect data!`);
          continue;
        }
      }

      const colLetter = getColLetter(u.colIdx);
      const targetRange = `'${sheetName}'!${colLetter}${targetRow}`;
      
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: targetRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[u.newValue]] }
        });
        validUpdatedItems.push({ ...u, rowIdx: targetRow });
      } catch (cellErr) {
        console.error(`[commission-log] Failed to update cell at ${targetRange}:`, cellErr);
      }
    }

    // 2. '수수료변경이력' 탭 확인 및 생성
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let logSheet = sheetsList.find(s => s.properties?.title === '수수료변경이력');

    if (!logSheet) {
      console.log("[CloudSync] Creating '수수료변경이력' sheet...");
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '수수료변경이력' } } }]
        }
      });
      const headers = [['변경일시', '계약번호', '렌탈계약번호', '회원명', '본부명', '변경항목', '변경 전 값', '변경 후 값', '변경 사유', '작업자']];
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: '수수료변경이력!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: headers }
      });
    }

    // 3. 로그 행 생성 및 Append
    const nowStr = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const itemsToLog = validUpdatedItems.length > 0 ? validUpdatedItems : updates;
    const logRows: any[][] = itemsToLog.map(u => [
      nowStr,
      u.contractNo || '-',
      u.rentalNo || '-',
      u.memName || '-',
      u.hqName || '-',
      u.fieldName || (u.colIdx === 14 ? '수수료지급일자' : u.colIdx === 19 ? '지급상태' : '수수료정보'),
      u.oldValue || '-',
      u.newValue || '-',
      reason || '일괄/단건 변경',
      worker || 'admin'
    ]);

    if (logRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '수수료변경이력!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: logRows }
      }).catch(e => console.warn('Log sheet append warn:', e));
    }

    // 4. 로컬 캐시 .commission_logs.json 저장
    const logCachePath = path.join(process.cwd(), '.commission_logs.json');
    let localLogs: any[] = [];
    if (fs.existsSync(logCachePath)) {
      try { localLogs = JSON.parse(fs.readFileSync(logCachePath, 'utf8')); } catch (e) {}
    }
    const newLogObjs = itemsToLog.map(u => ({
      timestamp: nowStr,
      contractNo: u.contractNo || '-',
      rentalNo: u.rentalNo || '-',
      memName: u.memName || '-',
      hqName: u.hqName || '-',
      fieldName: u.fieldName || (u.colIdx === 14 ? '수수료지급일자' : u.colIdx === 19 ? '지급상태' : '수수료정보'),
      oldValue: u.oldValue || '-',
      newValue: u.newValue || '-',
      reason: reason || '일괄/단건 변경',
      worker: worker || 'admin'
    }));
    localLogs.unshift(...newLogObjs);
    fs.writeFileSync(logCachePath, JSON.stringify(localLogs.slice(0, 1000), null, 2), 'utf8');

    res.json({ success: true, updatedCount: validUpdatedItems.length });
  } catch (error: any) {
    console.error("[Commission Log Batch Update Error]", error);
    return handleGoogleError(error, res);
  }
});

// 수수료 변경 이력 조회 API
app.get('/api/sheets/commission-log/list', async (req, res) => {
  const { contractNo, rentalNo } = req.query;
  const logCachePath = path.join(process.cwd(), '.commission_logs.json');
  let localLogs: any[] = [];
  if (fs.existsSync(logCachePath)) {
    try { localLogs = JSON.parse(fs.readFileSync(logCachePath, 'utf8')); } catch (e) {}
  }

  if (contractNo || rentalNo) {
    const cStr = String(contractNo || '').trim().toLowerCase();
    const rStr = String(rentalNo || '').trim().toLowerCase();
    const filtered = localLogs.filter(l => {
      const matchC = cStr && String(l.contractNo || '').toLowerCase().includes(cStr);
      const matchR = rStr && String(l.rentalNo || '').toLowerCase().includes(rStr);
      return matchC || matchR;
    });
    return res.json({ logs: filtered });
  }

  res.json({ logs: localLogs.slice(0, 200) });
});

app.post('/api/sheets/saveCertificateDispatch', async (req, res) => {
  const auth = await getAuthenticatedClient(req, res);
  if (!auth) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { rows } = req.body;
  if (!rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: '유효하지 않은 데이터입니다.' });
  }

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let dispatchSheet = sheetsList.find(s => s.properties?.title === '증서발송리스트');
    let sheetInternalId: number | null | undefined = dispatchSheet?.properties?.sheetId;

    if (!dispatchSheet) {
      console.log("[CloudSync] Creating '증서발송리스트' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '증서발송리스트' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;

      const headers = [['발송날짜', '구분', '회원명', '공란', '휴대폰번호', '*회원명', '*회원번호1', '*생년월일', '*가입일자', '*가입상품', '*월불입금1', '*월불입금2', '우편번호', '*주소', '*담당자', '*담당자전화번호', '회원번호2', '회원번호3', '회원번호4']];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '증서발송리스트!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: headers }
      });

      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: '증서발송리스트!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Certificate Dispatch Save Error]", error);
    return handleGoogleError(error, res);
  }
});

// 유통사 대사 내역 조회 API
app.get('/api/sheets/reconciliation/fetch-enex', async (req, res) => {
  try {
    const auth = await getAuthenticatedClient(req, res);
    if (!auth) return res.status(401).json({ success: false, message: '인증되지 않았습니다.' });
    const sheets = google.sheets({ version: 'v4', auth });
    
    const metaData = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID
    });
    const sheetExists = metaData.data.sheets?.some(s => s.properties?.title === '에넥스수수료');
    
    if (!sheetExists) {
      return res.status(404).json({ success: false, message: '에넥스수수료 시트가 존재하지 않습니다.' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: '에넥스수수료',
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const headers = rows[0];
    console.log("Enex Headers: ", headers);
    const data = rows.slice(1).map(row => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });
    
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching enex data:', error);
    res.status(500).json({ success: false, error: '에넥스수수료 데이터를 불러오는데 실패했습니다.' });
  }
});

app.get('/api/sheets/reconciliation/load', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '유통사대사내역',
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      return res.json({ history: [] });
    }

    const firstRowHeaders = (rows[0] || []).map((h: any) => (String(h) || '').trim());
    const hasPayDateHeader = firstRowHeaders.includes('수수료지급일자');

    // 1행 헤더에 수수료지급일자가 없다면 구글 시트 1행 헤더 마이그레이션
    if (!hasPayDateHeader) {
      const targetHeaders = [['정산기준일', '수수료지급일자', '계약ID', '고객명', '본부명', '상품명', '계약일자', '배송일자', '구좌수', '거래처입금액', '내부지급액합계', '최종순수익', '비고']];
      sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: '유통사대사내역!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: targetHeaders }
      }).catch(err => console.error("[Sheet Header Migration Error]", err));
    }

    const history = rows.slice(1).map((row: string[]) => {
      // 행 데이터 개수가 13개 이상이거나, 신규 13개 헤더 기반으로 저장된 행 처리
      if (row.length >= 13 || (hasPayDateHeader && row.length >= 12)) {
        return {
          '정산기준일': row[0] || '',
          '수수료지급일자': row[1] || '',
          '지급일자': row[1] || '',
          '계약ID': row[2] || '',
          '계약ID(렌탈번호)': row[2] || '',
          '고객명': row[3] || '',
          '본부명': row[4] || '',
          '상품명': row[5] || '',
          '계약일자': row[6] || '',
          '배송일자': row[7] || '',
          '내부 배송일자': row[7] || '',
          '구좌수': row[8] || '1',
          '거래처입금액': row[9] || '0',
          '내부지급액합계': row[10] || '0',
          '최종순수익': row[11] || '0',
          '비고': row[12] || ''
        };
      } else {
        // 예전 12개 컬럼 구조: [정산기준일, 계약ID, 고객명, 본부명, 상품명, 계약일자, 배송일자, 구좌수, 거래처입금액, 내부지급액합계, 최종순수익, 비고]
        return {
          '정산기준일': row[0] || '',
          '수수료지급일자': '',
          '지급일자': '',
          '계약ID': row[1] || '',
          '계약ID(렌탈번호)': row[1] || '',
          '고객명': row[2] || '',
          '본부명': row[3] || '',
          '상품명': row[4] || '',
          '계약일자': row[5] || '',
          '배송일자': row[6] || '',
          '내부 배송일자': row[6] || '',
          '구좌수': row[7] || '1',
          '거래처입금액': row[8] || '0',
          '내부지급액합계': row[9] || '0',
          '최종순수익': row[10] || '0',
          '비고': row[11] || ''
        };
      }
    }).filter((h: any) => h['계약ID'] || h['계약ID(렌탈번호)']);

    res.json({ history });
  } catch (error: any) {
    if (error.response?.status === 400 || error.message?.toLowerCase().includes('not found')) {
      return res.json({ history: [] });
    }
    console.error("[Reconciliation Load Error]", error.message);
    return handleGoogleError(error, res);
  }
});

// 유통사 대사 내역 저장 API
app.post('/api/sheets/reconciliation/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { rows } = req.body as { rows: any[][] };
  if (!rows || rows.length === 0) return res.status(400).json({ error: 'No data to save' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let historySheet = sheetsList.find(s => s.properties?.title === '유통사대사내역');
    let sheetInternalId: number | null | undefined = historySheet?.properties?.sheetId;
    
    if (!historySheet) {
      console.log("[Reconciliation] Creating '유통사대사내역' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '유통사대사내역' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      
      const headers = [['정산기준일', '수수료지급일자', '계약ID', '고객명', '본부명', '상품명', '계약일자', '배송일자', '구좌수', '거래처입금액', '내부지급액합계', '최종순수익', '비고']];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '유통사대사내역!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: headers }
      });
      
      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
    } else {
      // 1행 헤더가 13개 신규 헤더인지 확인 후 마이그레이션
      try {
        const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: '유통사대사내역!A1:M1'
        });
        const firstHeaders = headerRes.data.values?.[0] || [];
        if (!firstHeaders.includes('수수료지급일자')) {
          const targetHeaders = [['정산기준일', '수수료지급일자', '계약ID', '고객명', '본부명', '상품명', '계약일자', '배송일자', '구좌수', '거래처입금액', '내부지급액합계', '최종순수익', '비고']];
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: '유통사대사내역!A1',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: targetHeaders }
          });
        }
      } catch (err) {
        console.error("[Sheet Header Migration Check Error]", err);
      }
    }

    // Append rows
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: '유통사대사내역!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'OVERWRITE',
      requestBody: { values: rows }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Reconciliation Save Error]", error);
    return handleGoogleError(error, res);
  }
});

// === 영업조직 특이사항 및 보고사항 API ===
app.get('/api/sheets/branch-notes', async (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'date 파라미터가 유효하지 않습니다.' });
  }

  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let noteSheet = sheetsList.find(s => s.properties?.title === '영업조직특이사항');

    if (!noteSheet) {
      return res.json({ notes: [] });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '영업조직특이사항!A:D',
    });

    const rows = response.data.values || [];
    const notes = [];
    for (let i = 1; i < rows.length; i++) {
      const [rDate, orgName, note, report] = rows[i];
      if (rDate === date) {
        notes.push({
          orgName: orgName || '',
          note: note || '',
          report: report || ''
        });
      }
    }

    res.json({ notes });
  } catch (error: any) {
    console.error("[BranchNotes Get Error]", error);
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/branch-notes/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { date, notes } = req.body as { date: string; notes: { orgName: string; note: string; report: string }[] };
  if (!date || !notes) {
    return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
  }

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let noteSheet = sheetsList.find(s => s.properties?.title === '영업조직특이사항');
    let sheetInternalId: number | null | undefined = noteSheet?.properties?.sheetId;

    if (!noteSheet) {
      console.log("[CloudSync] Creating '영업조직특이사항' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '영업조직특이사항' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;

      const headers = [['날짜', '영업조직명', '특이사항', '보고사항']];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '영업조직특이사항!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: headers }
      });

      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
    }

    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '영업조직특이사항!A:D',
    });

    const existingRows = getRes.data.values || [];
    const headers = existingRows[0] || ['날짜', '영업조직명', '특이사항', '보고사항'];

    const newRows = [headers];
    for (let i = 1; i < existingRows.length; i++) {
      if (existingRows[i][0] !== date) {
        newRows.push(existingRows[i]);
      }
    }

    for (const n of notes) {
      if (n.orgName && n.orgName.trim()) {
        newRows.push([date, n.orgName, n.note || '', n.report || '']);
      }
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: '영업조직특이사항!A:D',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: '영업조직특이사항!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newRows }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[BranchNotes Save Error]", error);
    return handleGoogleError(error, res);
  }
});

// === 수수료 관련 특이사항 API ===
app.get('/api/sheets/commission-notes', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let targetSheet = sheetsList.find(s => s.properties?.title === '수수료특이사항');

    if (!targetSheet) {
      return res.json({ notes: [] });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '수수료특이사항!A:I',
    });

    const rows = response.data.values || [];
    const notes = [];
    for (let i = 1; i < rows.length; i++) {
      const [id, createdAt, type, target, amount, origDate, newDate, content, author] = rows[i];
      if (id || type || content) {
        notes.push({
          id: id || `cn_${i}`,
          createdAt: createdAt || '',
          type: type || '선지급',
          target: target || '',
          amount: amount || '',
          origDate: origDate || '',
          newDate: newDate || '',
          content: content || '',
          author: author || '',
          rowIndex: i + 1
        });
      }
    }

    res.json({ notes });
  } catch (error: any) {
    console.error("[CommissionNotes Get Error]", error);
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/commission-notes/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { type, target, amount, origDate, newDate, content, author } = req.body;
  if (!content) {
    return res.status(400).json({ error: '내용을 입력해주세요.' });
  }

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let targetSheet = sheetsList.find(s => s.properties?.title === '수수료특이사항');
    let sheetInternalId: number | null | undefined = targetSheet?.properties?.sheetId;

    if (!targetSheet) {
      console.log("[CloudSync] Creating '수수료특이사항' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: '수수료특이사항' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;

      const headers = [['ID', '등록일시', '구분', '관련대상', '수수료금액', '기존날짜', '수정날짜', '특이사항내용', '작성자']];
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: '수수료특이사항!A1',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: headers }
      });

      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.15, green: 0.23, blue: 0.37 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newId = `cn_${Date.now()}`;
    const newRow = [newId, nowStr, type || '선지급', target || '', amount || '', origDate || '', newDate || '', content || '', author || '관리자'];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: '수수료특이사항!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [newRow] }
    });

    res.json({ success: true, note: { id: newId, createdAt: nowStr, type, target, amount, origDate, newDate, content, author } });
  } catch (error: any) {
    console.error("[CommissionNotes Save Error]", error);
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/commission-notes/delete', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'ID가 전달되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '수수료특이사항!A:I',
    });

    const rows = response.data.values || [];
    const newRows = [rows[0] || ['ID', '등록일시', '구분', '관련대상', '수수료금액', '기존날짜', '수정날짜', '특이사항내용', '작성자']];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] !== id) {
        newRows.push(rows[i]);
      }
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: '수수료특이사항!A:I',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: '수수료특이사항!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: newRows }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[CommissionNotes Delete Error]", error);
    return handleGoogleError(error, res);
  }
});

// ================= VOC 관리 구글 시트 연동 API =================
app.get('/api/sheets/voc', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let vocSheet = sheetsList.find(s => s.properties?.title === 'VOC관리' || s.properties?.title === 'VOC 관리');

    if (!vocSheet) {
      return res.json({ vocList: [] });
    }

    const sheetName = vocSheet.properties?.title || 'VOC관리';
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:U`,
    });

    const rows = response.data.values || [];
    const vocList = [];
    for (let i = 1; i < rows.length; i++) {
      const [
        id, regDate, customerName, phone, hqName, branchName, category, status,
        title, content, processResult, manager, completeDate,
        memNo, allMemNos, rentalNo, rentalProd, contractDate, statusB, empInfo, commentsJson
      ] = rows[i];

      if (id || customerName || title) {
        let comments = [];
        if (commentsJson) {
          try {
            comments = JSON.parse(commentsJson);
          } catch (e) {
            comments = [];
          }
        }

        vocList.push({
          id: id || `VOC-${i}`,
          regDate: regDate || '',
          customerName: customerName || '',
          phone: phone || '',
          hqName: hqName || '',
          branchName: branchName || '',
          category: category || '기타',
          status: (status as any) || '접수',
          title: title || '',
          content: content || '',
          processResult: processResult || '',
          manager: manager || '',
          completeDate: completeDate || '',
          memNo: memNo || '',
          allMemNos: allMemNos || memNo || '',
          rentalNo: rentalNo || '',
          rentalProd: rentalProd || '',
          contractDate: contractDate || '',
          statusB: statusB || '',
          empInfo: empInfo || '',
          comments: Array.isArray(comments) ? comments : []
        });
      }
    }

    res.json({ vocList });
  } catch (error: any) {
    console.error("[VOC Get Error]", error);
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/voc/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { vocList } = req.body as { vocList: any[] };
  if (!vocList || !Array.isArray(vocList)) {
    return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
  }

  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    let vocSheet = sheetsList.find(s => s.properties?.title === 'VOC관리' || s.properties?.title === 'VOC 관리');
    let sheetInternalId: number | null | undefined = vocSheet?.properties?.sheetId;
    let targetSheetTitle = vocSheet?.properties?.title || 'VOC관리';

    if (!vocSheet) {
      console.log("[CloudSync] Creating 'VOC관리' sheet...");
      const newSheetResponse = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'VOC관리' } } }]
        }
      });
      sheetInternalId = newSheetResponse.data.replies?.[0].addSheet?.properties?.sheetId;
      targetSheetTitle = 'VOC관리';

      if (sheetInternalId != null) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: { sheetId: sheetInternalId, startRowIndex: 0, endRowIndex: 1 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.15, green: 0.25, blue: 0.45 },
                      textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER'
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
                }
              }
            ]
          }
        });
      }
    }

    const headers = [
      'VOC ID', '접수일자', '고객명', '연락처', '본부명', '지사명', '접수유형', '처리상태',
      'VOC 제목', '상세내용', '처리내용/답변', '담당자', '완료일자',
      '선택회원번호', '보유전체회원번호목록', '렌탈번호', '렌탈상품명', '계약일자', '가입상태', '영업사원정보', '코멘트히스토리JSON'
    ];
    const rows = [headers];

    vocList.forEach(item => {
      const commentsStr = item.comments && item.comments.length > 0 ? JSON.stringify(item.comments) : '';
      rows.push([
        item.id || '',
        item.regDate || '',
        item.customerName || '',
        item.phone || '',
        item.hqName || '',
        item.branchName || '',
        item.category || '',
        item.status || '접수',
        item.title || '',
        item.content || '',
        item.processResult || '',
        item.manager || '',
        item.completeDate || '',
        item.memNo || '',
        item.allMemNos || item.memNo || '',
        item.rentalNo || '',
        item.rentalProd || '',
        item.contractDate || '',
        item.statusB || '',
        item.empInfo || '',
        commentsStr
      ]);
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `${targetSheetTitle}!A:U`,
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${targetSheetTitle}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[VOC Save Error]", error);
    return handleGoogleError(error, res);
  }
});

// Vite Middleware
async function start() {
  try {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/.settings_cache.json',
            '**/.google_tokens.json',
            '**/token.json',
            '**/*.log',
            '**/.system_generated/**'
          ],
        },
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('Vite initialization failed (expected on Netlify):', e);
  }
}


// In AI Studio or local dev, we need to listen
if (!process.env.NETLIFY) {
  start();
}
