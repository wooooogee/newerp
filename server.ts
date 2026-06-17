import express from 'express';
import path from 'path';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT) || 3002;

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

  const { settings, globalIncentives, maintenanceRules } = req.body as { settings: any[], globalIncentives?: any[], maintenanceRules?: any[] };
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
    // Header: ID, 본부명, 은행, 계좌, 예금주, 지급방식, 오버라이딩Y/N, 영업%, 팀장%, 지사%, 본부%, 상품명, 전체수수료, 판매수수료, 판매촉진비, 오버라이딩적용, 구간1건, 단가1, 구간2건, 단가2, 구간3건, 단가3, 상품영업, 상품팀장, 상품지사, 상품본부
    const headers = [
      '본부ID', '본부명', '정산유형', '은행', '계좌번호', '예금주', '지급방식', '오버라이딩활성', 
      '비율(영업)', '비율(팀장)', '비율(지사)', '비율(본부)', 
      '상품명', '전체수수료', '판매수수료', '판매촉진비', '오버라이딩적용', '구간1건', '구간1단가', '구간2건', '구간2단가', '구간3건', '구간3단가',
      '상품영업', '상품팀장', '상품지사', '상품본부'
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
            p.overriding?.hqManager ?? hq.overriding?.hqManager ?? 0
          ]);
        });
      } else {
        // HQ with no products
        rows.push([
          ...baseInfo,
          '-', 0, 0, 0, 'Y', 0, 0, 0, 0, 0, 0,
          hq.overriding?.salesperson ?? 0, hq.overriding?.teamLeader ?? 0, hq.overriding?.branchManager ?? 0, hq.overriding?.hqManager ?? 0
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
        'ID', '수급자명', '지급일(일)', '대상본부', '대상상품', '기준일자', '건당수수료', '최소보장금액'
      ];
      
      const incentiveRows: any[][] = [incentiveHeaders];
      globalIncentives.forEach((rule: any) => {
        incentiveRows.push([
          rule.id || '',
          rule.targetName || '',
          rule.payDay || 1,
          rule.targetHq || '',
          (rule.targetProducts || []).join(', '),
          rule.baseDateType || 'DELIVERY',
          rule.commissionPerUnit || 0,
          rule.minimumGuarantee || 0
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
          } : undefined
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

        globalIncentives = incRows.slice(1).map((row: string[]) => {
          const productsStr = iTargetProducts >= 0 ? (row[iTargetProducts] || '') : '';
          const targetProducts = productsStr ? productsStr.split(',').map(s => s.trim()).filter(s => s) : ['ALL'];
          return {
            id: iId >= 0 ? row[iId] : Date.now().toString() + Math.random(),
            targetName: iTargetName >= 0 ? row[iTargetName] : '',
            payDay: iPayDay >= 0 ? (parseInt(row[iPayDay]) || 1) : 1,
            targetHq: iTargetHq >= 0 ? row[iTargetHq] : '',
            targetProducts,
            baseDateType: iBaseDateType >= 0 ? row[iBaseDateType] : 'DELIVERY',
            commissionPerUnit: iCommissionPerUnit >= 0 ? (parseInt(row[iCommissionPerUnit]) || 0) : 0,
            minimumGuarantee: iMinimumGuarantee >= 0 ? (parseInt(row[iMinimumGuarantee]) || 0) : 0
          };
        }).filter((r: any) => r.targetName);
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

    res.json({ settings: Array.from(hqMap.values()), globalIncentives, maintenanceRules });
  } catch (error: any) {
    if (error.response?.status === 400 || error.message?.toLowerCase().includes('not found')) {
      return res.json({ settings: null, globalIncentives: [], maintenanceRules: [] });
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

    const headers = (rows[0] || []).map((h: any) => (String(h) || '').trim());
    const history = rows.slice(1).map((row: string[]) => {
      const obj: any = {};
      headers.forEach((h: string, idx: number) => {
        obj[h] = row[idx] || '';
      });
      return obj;
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
      
      const headers = [['정산기준일', '계약ID', '고객명', '본부명', '지사명', '사원명', '상품명', '거래처배송일', '내부배송일자', '수수료지급일자', '구좌수', '거래처입금액', '내부지급액합계', '최종순수익', '비고']];
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
