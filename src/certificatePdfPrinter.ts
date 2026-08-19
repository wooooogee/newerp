import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface CertPrintItem {
  id?: number | string;
  memName: string;      // 회원명
  phone: string;        // 휴대폰번호
  memNo1: string;       // 회원번호1
  birthDate: string;    // 생년월일 (YYMMDD 또는 YYYY-MM-DD)
  contractDate: string; // 가입일자
  prodName: string;     // 가입상품명
  monthlyPay1: string;  // 월불입금1 (예: 2,000원*1~60회)
  monthlyPay2: string;  // 월불입금2 (예: 20,000원*61~210회)
  zipCode: string;      // 우편번호
  address: string;      // 주소
  empName: string;      // 담당자
  empPhone: string;     // 담당자전화번호
  memNo2?: string;      // 회원번호2
  memNo3?: string;      // 회원번호3
  memNo4?: string;      // 회원번호4
}

/**
 * 긴 주소 텍스트를 지정한 글자 수 기준으로 2줄로 안전하게 나누는 헬퍼 함수
 */
function splitAddressIntoTwoLines(addr: string, maxLen: number = 19): [string, string] {
  const clean = String(addr || '').trim();
  if (clean.length <= maxLen) {
    return [clean, ''];
  }

  const spaceIdx = clean.lastIndexOf(' ', maxLen);
  if (spaceIdx > 8) {
    return [clean.slice(0, spaceIdx), clean.slice(spaceIdx + 1)];
  }

  return [clean.slice(0, maxLen), clean.slice(maxLen)];
}

/**
 * 콤마(,), 줄바꿈, 탭, 공백 등으로 묶여 들어온 회원번호 문자열을 개별 회원번호 배열로 정밀 파싱
 */
function parseMemberNumbers(items: (string | undefined)[]): string[] {
  const result: string[] = [];
  const set = new Set<string>();

  items.forEach(raw => {
    if (!raw) return;
    const str = String(raw).trim();
    if (!str || str.toUpperCase() === 'UNDEFINED' || str.toUpperCase() === 'NULL') return;

    const tokens = str.split(/[\s,\t\r\n]+/);
    tokens.forEach(tok => {
      const cleanTok = tok.trim();
      if (cleanTok && cleanTok.toUpperCase() !== 'UNDEFINED' && cleanTok.toUpperCase() !== 'NULL') {
        if (!set.has(cleanTok)) {
          set.add(cleanTok);
          result.push(cleanTok);
        }
      }
    });
  });

  return result;
}

/**
 * 회원 가입 상품명에 맞춰 업로드된 6종류 PDF 템플릿 파일 경로를 정확하게 매칭
 */
function getTemplatePathForProduct(prodName: string): string {
  const cleanProd = String(prodName || '').replace(/\s+/g, '');

  if (cleanProd.includes('540플러스') || cleanProd.includes('540PLUS')) {
    return '/templates/template_540plus.pdf';
  }
  if (cleanProd.includes('540')) {
    return '/templates/template_540.pdf';
  }
  if (cleanProd.includes('698') || cleanProd.includes('하이브리드')) {
    return '/templates/template_698.pdf';
  }
  if (cleanProd.includes('골드') || cleanProd.includes('헬스케어골드')) {
    return '/templates/template_gold.pdf';
  }
  if (cleanProd.includes('실버') || cleanProd.includes('헬스케어실버')) {
    return '/templates/template_silver.pdf';
  }
  if (cleanProd.includes('올인원') || cleanProd.includes('헬스케어올인원')) {
    return '/templates/template_allinone.pdf';
  }

  return '/templates/certificate_template.pdf';
}

export async function printCertificatesPdf(items: CertPrintItem[]) {
  if (!items || items.length === 0) {
    alert('인쇄할 우편 발송 대상이 선택되지 않았습니다.');
    return;
  }

  try {
    const outPdf = await PDFDocument.create();
    outPdf.registerFontkit(fontkit);

    let font: any = null;
    try {
      const fontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Bold.ttf';
      const fontRes = await fetch(fontUrl);
      if (fontRes.ok) {
        const fontBytes = await fontRes.arrayBuffer();
        font = await outPdf.embedFont(fontBytes);
      }
    } catch (err) {
      console.error('한글 폰트 로드 실패:', err);
    }

    const templateCacheMap = new Map<string, ArrayBuffer>();

    for (const item of items) {
      const memberNos = parseMemberNumbers([item.memNo1, item.memNo2, item.memNo3, item.memNo4]);
      if (memberNos.length === 0) {
        memberNos.push(item.memNo1 || '');
      }

      const tplPath = getTemplatePathForProduct(item.prodName);
      if (!templateCacheMap.has(tplPath)) {
        let res = await fetch(tplPath);
        if (!res.ok) {
          res = await fetch('/templates/certificate_template.pdf');
        }
        if (res.ok) {
          const bytes = await res.arrayBuffer();
          templateCacheMap.set(tplPath, bytes);
        }
      }

      const tplBytes = templateCacheMap.get(tplPath) || templateCacheMap.get('/templates/certificate_template.pdf');
      if (!tplBytes) {
        throw new Error('템플릿 PDF 파일을 불러올 수 없습니다.');
      }

      const tplPdf = await PDFDocument.load(tplBytes);

      // ----------------------------------------------------
      // [PAGE 1] 봉투 & 안내 (사람당 1장)
      // ----------------------------------------------------
      const [p1] = await outPdf.copyPages(tplPdf, [0]);

      p1.drawRectangle({
        x: 280,
        y: 575,
        width: 310,
        height: 155,
        color: rgb(1, 1, 1),
      });

      if (font) {
        const [p1Addr1, p1Addr2] = splitAddressIntoTwoLines(item.address || '', 22);

        p1.drawText(p1Addr1, { x: 295, y: 686, size: 12, font, color: rgb(0, 0, 0) });
        if (p1Addr2) {
          p1.drawText(p1Addr2, { x: 295, y: 670, size: 12, font, color: rgb(0, 0, 0) });
        }

        p1.drawText(item.memName || '', { x: 370, y: 630, size: 18, font, color: rgb(0, 0, 0) });
        p1.drawText('회원님 귀하', { x: 460, y: 630, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
        p1.drawText(item.zipCode || '', { x: 460, y: 616.5, size: 14.5, font, color: rgb(0, 0, 0) });
      }
      outPdf.addPage(p1);

      // ----------------------------------------------------
      // [PAGE 2] 회원증서 (구좌수 / 회원번호 개수만큼 N장 생성)
      // ----------------------------------------------------
      for (const memNo of memberNos) {
        const [pCert] = await outPdf.copyPages(tplPdf, [1]);

        const [addrLine1, addrLine2] = splitAddressIntoTwoLines(item.address || '', 19);

        if (font) {
          // --- 좌측 데이터 값 ---
          pCert.drawText(item.memName || '', { x: 125, y: 749, size: 11.5, font, color: rgb(0, 0, 0) });
          pCert.drawText(memNo || '', { x: 125, y: 722, size: 11.5, font, color: rgb(0, 0, 0) });
          pCert.drawText(item.birthDate || '', { x: 125, y: 695, size: 10.5, font, color: rgb(0, 0, 0) });

          pCert.drawText(addrLine1, { x: 125, y: 668, size: 9, font, color: rgb(0, 0, 0) });
          if (addrLine2) {
            pCert.drawText(addrLine2, { x: 125, y: 655, size: 9, font, color: rgb(0, 0, 0) });
          }

          // --- 우측 데이터 값 (요구사항 3: x = 438 pt 로 아주 조금만 왼쪽으로 이동하여 황금 비율 피팅!) ---
          pCert.drawText(item.prodName || '', { x: 438, y: 749, size: 10, font, color: rgb(0, 0, 0) });
          pCert.drawText(item.contractDate || '', { x: 438, y: 722, size: 10, font, color: rgb(0, 0, 0) });
          pCert.drawText(item.monthlyPay1 || '', { x: 438, y: 700, size: 8.5, font, color: rgb(0, 0, 0) });
          pCert.drawText(item.monthlyPay2 || '', { x: 438, y: 687, size: 8.5, font, color: rgb(0, 0, 0) });

          pCert.drawText(item.empName || '', { x: 438, y: 668, size: 10, font, color: rgb(0, 0, 0) });
          pCert.drawText(item.empPhone || '', { x: 438, y: 653, size: 8.5, font, color: rgb(0, 0, 0) });
        }
        outPdf.addPage(pCert);
      }

      // ----------------------------------------------------
      // [PAGE 5] 약관 & 청약철회 신청서 (사람당 1장)
      // ----------------------------------------------------
      const pageIndex5 = tplPdf.getPageCount() >= 5 ? 4 : tplPdf.getPageCount() - 1;
      const [p5] = await outPdf.copyPages(tplPdf, [pageIndex5]);
      outPdf.addPage(p5);

      // ----------------------------------------------------
      // 양면 인쇄(Duplex Printing) 대응 짝수 페이지 자동 패딩
      // ----------------------------------------------------
      const personTotalPages = 1 + memberNos.length + 1;
      if (personTotalPages % 2 !== 0) {
        outPdf.addPage([595.28, 841.89]);
      }
    }

    const pdfBytes = await outPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    const printWindow = window.open(blobUrl, '_blank');
    if (!printWindow) {
      alert('팝업 차단이 설정되어 있습니다. 팝업 허용 후 다시 시도해 주세요.');
    }
  } catch (error) {
    console.error('PDF Generation Error:', error);
    alert('원본 PDF 양식 기반 인쇄 생성 중 오류가 발생했습니다.');
  }
}
