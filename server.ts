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

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해 주세요.' });
  }

  const adminId = process.env.ADMIN_ID?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

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

  // 하드코딩된 특정 관리자 계정
  if (username === 'a250027' && password === '880805') {
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
          });

          const rows = response.data.values;
          if (rows && rows.length > 1) {
            // 헤더 건너뛰고 매칭되는 계정 탐색 (구분, 조직명, 아이디, 비밀번호)
            const matchedRows = rows.slice(1).filter(row => {
              const rowId = String(row[2] || '').trim();
              const rowPw = String(row[3] || '').trim();
              return rowId === username && rowPw === password;
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
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: '조직계정설정!A:D',
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
    let updatedRows = [...rows];

    // 헤더(index 0) 제외 후 검색
    for (let i = 1; i < updatedRows.length; i++) {
      const rowOrgName = String(updatedRows[i][1] || '').trim().toLowerCase();
      const rowId = String(updatedRows[i][2] || '').trim().toLowerCase();
      const rowPw = String(updatedRows[i][3] || '').trim();

      // C열(아이디) 또는 B열(조직명/사원명)로 계정 대조
      if (rowId === targetUser || rowOrgName === targetUser) {
        if (rowPw !== targetPw) {
          console.log(`[PASSWORD MISMATCH] User: ${targetUser}, Input PW: "${targetPw}", Sheet PW: "${rowPw}"`);
          pwMismatchCount++;
          continue;
        }
        // 비밀번호 (D열) 업데이트
        updatedRows[i][3] = newPwStr;
        matchedCount++;
      }
    }

    if (matchedCount === 0) {
      if (pwMismatchCount > 0) {
        return res.status(400).json({ error: '현재 비밀번호가 일치하지 않습니다. 입력하신 비밀번호를 다시 확인해 주세요.' });
      }
      return res.status(404).json({ error: `등록된 계정 정보(${username})를 찾을 수 없습니다.` });
    }

    // 구글 시트에 업데이트 반영
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `조직계정설정!A1:D${updatedRows.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: updatedRows }
    });

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

app.post('/api/sheets/settings/save', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { settings, globalIncentives, maintenanceRules, manualOrderProducts, manualOrderStores, reportSettings } = req.body as {
    settings: any[];
    globalIncentives?: any[];
    maintenanceRules?: any[];
    manualOrderProducts?: string[];
    manualOrderStores?: Record<string, any>;
    reportSettings?: Record<string, any>;
  };
  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  // 로컬 파일 캐시 백업 동기 저장
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
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
  } catch (e) {
    console.error("[CloudSync] Local cache write error:", e);
  }

  console.log(`[CloudSync] Saving pretty settings to sheet: ${sheetId}`);

  try {
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
        'ID', '수급자명', '지급일(일)', '대상본부', '대상상품', '기준일자', '건당수수료', '최소보장금액', '수당종류', '대상본부배열', '할부사용여부', '할부룰', '대상제품배열', '정산유형', '발행사업자명', '사업자번호'
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
          JSON.stringify(rule.targetHqs || ['ALL']),
          rule.useInstallments ? 'Y' : 'N',
          JSON.stringify(rule.installments || []),
          JSON.stringify(rule.targetItems || ['ALL']),
          rule.taxType || 'DEFAULT',
          rule.taxBusinessName || '',
          rule.taxBusinessNo || ''
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

    // -- Handle manualOrderProducts & manualOrderStores & reportSettings --
    if (manualOrderProducts || manualOrderStores || reportSettings) {
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

      if (manualOrderProducts) {
        extraRows.push(['MANUAL_ORDER_PRODUCTS', JSON.stringify(manualOrderProducts), nowStr]);
      }
      if (manualOrderStores) {
        extraRows.push(['MANUAL_ORDER_STORES', JSON.stringify(manualOrderStores), nowStr]);
      }
      if (reportSettings) {
        extraRows.push(['REPORT_SETTINGS', JSON.stringify(reportSettings), nowStr]);
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
      console.log("[CloudSync] Extra settings (manual orders & report) saved successfully.");
    }

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
    });

    const rows = response.data.values || [];
    // 첫 행이 헤더라면 스킵
    const members = [];
    for (let i = 0; i < rows.length; i++) {
      if (i === 0 && rows[i][0] === '구분') continue; // 헤더 스킵
      const [role, orgName, username, password] = rows[i];
      if (!username) continue; // 아이디가 없으면 스킵
      members.push({ role: role || '', orgName: orgName || '', username: username || '', password: password || '' });
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

    // 헤더 포함
    const rows = [['구분', '조직명', '아이디', '비밀번호']];
    members.forEach(m => {
      rows.push([m.role || '', m.orgName || '', m.username || '', m.password || '']);
    });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: '조직계정설정!A:D'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: '조직계정설정!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });

    if (aSheetId != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [
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
    }

    res.json({ success: true });
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

        globalIncentives = incRows.slice(1).map((row: string[]) => {
          const productsStr = iTargetProducts >= 0 ? (row[iTargetProducts] || '') : '';
          const targetProducts = productsStr ? productsStr.split(',').map(s => s.trim()).filter(s => s) : ['ALL'];
          
          let targetHqs = ['ALL'];
          if (iTargetHqs >= 0 && row[iTargetHqs]) {
            try { targetHqs = JSON.parse(row[iTargetHqs]); } catch(e){}
          } else if (iTargetHq >= 0 && row[iTargetHq]) {
             targetHqs = [row[iTargetHq]];
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

    // -- Load extra settings (manualOrderProducts, manualOrderStores, reportSettings) --
    let manualOrderProducts: string[] | null = null;
    let manualOrderStores: Record<string, any> | null = null;
    let reportSettings: Record<string, any> | null = null;

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
          } catch (e) {
            console.error(`[CloudSync] Parse ${key} error:`, e);
          }
        });
        console.log(`[CloudSync] Loaded extra settings (manual orders & report) from cloud.`);
      }
    } catch (e: any) {
      console.log("[CloudSync] '수기발주및기타설정' sheet might not exist yet.");
    }

    // 로컬 파일 캐시 백업 병합 (구글시트에 데이터가 없는 항목이 있으면 백업에서 채움)
    try {
      const cachePath = path.join(process.cwd(), '.settings_cache.json');
      if (fs.existsSync(cachePath)) {
        const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (!manualOrderProducts && cacheData.manualOrderProducts) manualOrderProducts = cacheData.manualOrderProducts;
        if (!manualOrderStores && cacheData.manualOrderStores) manualOrderStores = cacheData.manualOrderStores;
        if (!reportSettings && cacheData.reportSettings) reportSettings = cacheData.reportSettings;
      }
    } catch (e) {}

    res.json({
      settings: Array.from(hqMap.values()),
      globalIncentives,
      maintenanceRules,
      manualOrderProducts,
      manualOrderStores,
      reportSettings
    });
  } catch (error: any) {
    if (error.response?.status === 400 || error.message?.toLowerCase().includes('not found')) {
      // 구글시트 조회가 안 될 경우 로컬 디스크 캐시 복구 시도
      try {
        const cachePath = path.join(process.cwd(), '.settings_cache.json');
        if (fs.existsSync(cachePath)) {
          const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
          return res.json({
            settings: cacheData.settings || null,
            globalIncentives: cacheData.globalIncentives || [],
            maintenanceRules: cacheData.maintenanceRules || [],
            manualOrderProducts: cacheData.manualOrderProducts || null,
            manualOrderStores: cacheData.manualOrderStores || null,
            reportSettings: cacheData.reportSettings || null
          });
        }
      } catch (e) {}
      return res.json({ settings: null, globalIncentives: [], maintenanceRules: [], manualOrderProducts: null, manualOrderStores: null, reportSettings: null });
    }
    console.error("[CloudSync] Load error:", error.message);
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

app.post('/api/sheets/update', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { rowIdx, colIdx, newValue } = req.body;
  let sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

  if (sheetId.includes('spreadsheets/d/')) {
    const match = sheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) sheetId = match[1];
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // Get sheet name
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    const targetSheet = sheetsList.find(s => s.properties?.title === '관리대장') || 
                        sheetsList.find(s => s.properties?.title?.includes('회원현황')) ||
                        sheetsList[0];
    const sheetName = targetSheet?.properties?.title || 'Sheet1';

    // colIdx to letter (0 -> A, 1 -> B, ...)
    const getColLetter = (n: number) => {
      let letter = '';
      while (n >= 0) {
        letter = String.fromCharCode((n % 26) + 65) + letter;
        n = Math.floor(n / 26) - 1;
      }
      return letter;
    };

    const range = `${sheetName}!${getColLetter(colIdx)}${rowIdx}`;
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[newValue]]
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    return handleGoogleError(error, res);
  }
});

app.post('/api/sheets/batch-update', async (req, res) => {
  const client = await getAuthenticatedClient(req, res);
  if (!client) return res.status(401).json({ error: '인증되지 않았습니다.' });

  const { updates } = req.body as { updates: { rowIdx: number, colIdx: number, newValue: string }[] };
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

    console.log(`[batch-update] Updating ${updates.length} items in sheet: '${sheetName}'`);
    for (const u of updates) {
      const range = `'${sheetName}'!${getColLetter(u.colIdx)}${u.rowIdx}`;
      console.log(`[batch-update] Range: ${range}, Value: ${u.newValue}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[u.newValue]]
        }
      });
    }

    res.json({ success: true, updatedCount: updates.length });
  } catch (error: any) {
    console.error('[batch-update] Error:', error);
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

  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A:ZZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json([]);
    }

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

// Vite Middleware
async function start() {
  try {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
