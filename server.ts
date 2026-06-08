import express from 'express';
import path from 'path';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

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

  const baseUrl = process.env.APP_URL || process.env.URL || 'http://localhost:3000';
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
    const baseUrl = process.env.APP_URL || process.env.URL || 'http://localhost:3000';
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
  const tokens = req.cookies.google_tokens;
  if (!tokens) return null;
  
  const client = getOAuthClient();
  try {
    const parsedTokens = JSON.parse(tokens);
    client.setCredentials(parsedTokens);
    
    // If the token is about to expire or expired, and we have a refresh token, 
    // the library will try to refresh it on the first request.
    // However, if the client_id/secret changed, this refresh will fail with unauthorized_client.
    
    // We can't easily "test" it without making a request, but we can catch errors in the handlers.
    return client;
  } catch (e) {
    if (res) res.clearCookie('google_tokens');
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
    res.cookie('google_tokens', JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Google Sheets Connected! You can close this window.</p>
        </body>
      </html>
    `);
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
  res.json({ authenticated: !!req.cookies.google_tokens });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('google_tokens');
  res.json({ success: true });
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

  const { settings } = req.body as { settings: any[] };
  let sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (sheetId && sheetId.includes('spreadsheets/d/')) {
    sheetId = sheetId.split('spreadsheets/d/')[1].split('/')[0];
  }
  
  if (!sheetId) return res.status(400).json({ error: 'GOOGLE_SHEET_ID missing' });

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
    // Header: ID, 본부명, 은행, 계좌, 예금주, 지급방식, 오버라이딩Y/N, 영업%, 팀장%, 지사%, 본부%, 상품명, 전체수수료, 판매수수료, 판매촉진비, 구간1건, 단가1, 구간2건, 단가2, 구간3건, 단가3
    const headers = [
      '본부ID', '본부명', '정산유형', '은행', '계좌번호', '예금주', '지급방식', '오버라이딩활성', 
      '비율(영업)', '비율(팀장)', '비율(지사)', '비율(본부)', 
      '상품명', '전체수수료', '판매수수료', '판매촉진비', '구간1건', '구간1단가', '구간2건', '구간2단가', '구간3건', '구간3단가'
    ];

    const rows: any[][] = [headers];

    settings.forEach((hq: any) => {
      const baseInfo = [
        hq.id,
        hq.hqName,
        hq.settlementType || '사업자',  // 정산유형 추가
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
            p.tier1Count || 0,
            p.tier1Price || 0,
            p.tier2Count || 0,
            p.tier2Price || 0,
            p.tier3Count || 0,
            p.tier3Price || 0
          ]);
        });
      } else {
        // HQ with no products
        rows.push([
          ...baseInfo,
          '-', 0, 0, 0, 0, 0, 0, 0, 0, 0
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
    res.json({ success: true });
  } catch (error: any) {
    console.error("[CloudSync] Save error:", error.message);
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
    const tier1CountCol = col('구간1건');
    const tier1PriceCol = col('구간1단가');
    const tier2CountCol = col('구간2건');
    const tier2PriceCol = col('구간2단가');
    const tier3CountCol = col('구간3건');
    const tier3PriceCol = col('구간3단가');

    console.log(`[CloudSync] Header detected: id=${idCol}, settlementType=${settlementTypeCol}, bank=${bankCol}`);

    const hqMap = new Map<string, any>();
    
    rows.slice(1).forEach((row: string[]) => {
      const id = idCol >= 0 ? row[idCol] : row[0];
      if (!id) return;

      if (!hqMap.has(id)) {
        hqMap.set(id, {
          id,
          hqName: hqNameCol >= 0 ? (row[hqNameCol] || '') : (row[1] || ''),
          settlementType: settlementTypeCol >= 0 ? (row[settlementTypeCol] || '사업자') : '사업자',
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
        hqMap.get(id).productRules.push({
          productName,
          totalAmount: totalAmountCol >= 0 ? (Number(row[totalAmountCol]) || 0) : 0,
          salesAmount: salesAmountCol >= 0 ? (Number(row[salesAmountCol]) || 0) : 0,
          tier1Count: tier1CountCol >= 0 ? (Number(row[tier1CountCol]) || 0) : 0,
          tier1Price: tier1PriceCol >= 0 ? (Number(row[tier1PriceCol]) || 0) : 0,
          tier2Count: tier2CountCol >= 0 ? (Number(row[tier2CountCol]) || 0) : 0,
          tier2Price: tier2PriceCol >= 0 ? (Number(row[tier2PriceCol]) || 0) : 0,
          tier3Count: tier3CountCol >= 0 ? (Number(row[tier3CountCol]) || 0) : 0,
          tier3Price: tier3PriceCol >= 0 ? (Number(row[tier3PriceCol]) || 0) : 0,
        });
      }
    });

    console.log(`[CloudSync] Loaded ${hqMap.size} HQs from cloud.`);
    res.json({ settings: Array.from(hqMap.values()) });
  } catch (error: any) {
    if (error.response?.status === 400 || error.message?.toLowerCase().includes('not found')) {
      return res.json({ settings: null });
    }
    console.error("[CloudSync] Load error:", error.message);
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
    
    // Get sheet name
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetsList = spreadsheet.data.sheets || [];
    const targetSheet = sheetsList.find(s => s.properties?.title === '관리대장') || 
                        sheetsList.find(s => s.properties?.title?.includes('회원현황')) ||
                        sheetsList[0];
    const sheetName = targetSheet?.properties?.title || 'Sheet1';

    // colIdx to letter
    const getColLetter = (n: number) => {
      let letter = '';
      while (n >= 0) {
        letter = String.fromCharCode((n % 26) + 65) + letter;
        n = Math.floor(n / 26) - 1;
      }
      return letter;
    };

    const data = updates.map(u => ({
      range: `${sheetName}!${getColLetter(u.colIdx)}${u.rowIdx}`,
      values: [[u.newValue]]
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: data
      }
    });

    res.json({ success: true });
  } catch (error: any) {
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
      range = `${sheetName}!A:AC`;
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
      range: `${sheetName}!A:Z`,
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
