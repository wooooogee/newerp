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
 * 주소 텍스트를 지정한 최대 글자 수 기준으로 2줄로 안전하게 나누는 헬퍼 함수
 */
function splitAddressIntoTwoLines(addr: string, maxLen: number = 21): [string, string] {
  const clean = String(addr || '').trim();
  if (clean.length <= maxLen) {
    return [clean, ''];
  }

  // 공백 기준으로 자연스럽게 나누기 시도
  const spaceIdx = clean.lastIndexOf(' ', maxLen);
  if (spaceIdx > 10) {
    return [clean.slice(0, spaceIdx), clean.slice(spaceIdx + 1)];
  }

  return [clean.slice(0, maxLen), clean.slice(maxLen)];
}

/**
 * 회원 가입 상품명에 맞춰 업로드된 5종류 PDF 템플릿 파일 경로를 정확하게 매칭
 */
function getTemplatePathForProduct(prodName: string): string {
  const cleanProd = String(prodName || '').replace(/\s+/g, '');

  // 1. 더좋은프리미엄540플러스
  if (cleanProd.includes('540플러스') || cleanProd.includes('540PLUS')) {
    return '/templates/template_540plus.pdf';
  }
  // 2. 더좋은프리미엄540
  if (cleanProd.includes('540')) {
    return '/templates/template_540.pdf';
  }
  // 3. 더좋은하이브리드698
  if (cleanProd.includes('698') || cleanProd.includes('하이브리드')) {
    return '/templates/template_698.pdf';
  }
  // 4. 굿라이프헬스케어실버
  if (cleanProd.includes('실버') || cleanProd.includes('헬스케어실버')) {
    return '/templates/template_silver.pdf';
  }
  // 5. 굿라이프헬스케어올인원
  if (cleanProd.includes('올인원') || cleanProd.includes('헬스케어올인원')) {
    return '/templates/template_allinone.pdf';
  }

  // 기본 fallback 템플릿
  return '/templates/certificate_template.pdf';
}

export async function printCertificatesPdf(items: CertPrintItem[]) {
  if (!items || items.length === 0) {
    alert('인쇄할 우편 발송 대상이 선택되지 않았습니다.');
    return;
  }

  try {
    // 1. 한글 폰트(NanumGothic Bold) 로드
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

    // 템플릿 파일 캐시 맵
    const templateCacheMap = new Map<string, ArrayBuffer>();

    // 2. 선택된 회원(사람)마다 순서대로 독립 세트 [1p -> (2p * 구좌수) -> 5p] 생성
    for (const item of items) {
      // 보유 구좌 수 (회원번호 개수)
      const rawNos = [item.memNo1, item.memNo2, item.memNo3, item.memNo4];
      const memberNos = rawNos.filter(no => no && String(no).trim() !== '' && String(no).toUpperCase() !== 'UNDEFINED' && String(no).toUpperCase() !== 'NULL');
      if (memberNos.length === 0) {
        memberNos.push(item.memNo1 || '');
      }

      // 상품명에 따른 PDF 템플릿 가져오기
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

      // 1페이지 기존 템플릿 우측 주소/수령인 영역 흰색 마스크 패치로 가리기
      p1.drawRectangle({
        x: 270,
        y: 600,
        width: 310,
        height: 150,
        color: rgb(1, 1, 1),
      });

      if (font) {
        p1.drawText(item.address || '', { x: 275, y: 695, size: 12.5, font, color: rgb(0, 0, 0) });
        p1.drawText(item.memName || '', { x: 360, y: 650, size: 18, font, color: rgb(0, 0, 0) });
        p1.drawText('회원님 귀하', { x: 450, y: 650, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
        p1.drawText(item.zipCode || '', { x: 450, y: 622, size: 14.5, font, color: rgb(0, 0, 0) });
      }
      outPdf.addPage(p1);

      // ----------------------------------------------------
      // [PAGE 2] 회원증서 (구좌수 / 회원번호 개수만큼 N장)
      // ----------------------------------------------------
      for (const memNo of memberNos) {
        const [pCert] = await outPdf.copyPages(tplPdf, [1]);

        // 주소 2줄 분할 처리 (오른쪽 "담당" 칸 침범 방지)
        const [addrLine1, addrLine2] = splitAddressIntoTwoLines(item.address || '', 21);

        if (font) {
          // 회원명 (라벨 우측 빈 공간)
          pCert.drawText(item.memName || '', { x: 125, y: 746, size: 11.5, font, color: rgb(0, 0, 0) });
          // 가입상품
          pCert.drawText(item.prodName || '', { x: 400, y: 746, size: 10.5, font, color: rgb(0, 0, 0) });

          // 회원번호
          pCert.drawText(memNo || '', { x: 125, y: 718, size: 11.5, font, color: rgb(0, 0, 0) });
          // 가입일자
          pCert.drawText(item.contractDate || '', { x: 400, y: 718, size: 10.5, font, color: rgb(0, 0, 0) });

          // 생년월일
          pCert.drawText(item.birthDate || '', { x: 125, y: 691, size: 10.5, font, color: rgb(0, 0, 0) });
          // 월불입금 2줄
          pCert.drawText(item.monthlyPay1 || '', { x: 400, y: 696, size: 9, font, color: rgb(0, 0, 0) });
          pCert.drawText(item.monthlyPay2 || '', { x: 400, y: 683, size: 9, font, color: rgb(0, 0, 0) });

          // 주소 (2줄로 나누어 옆 칸 침범 안 하도록 안전 분할)
          pCert.drawText(addrLine1, { x: 125, y: 664, size: 9, font, color: rgb(0, 0, 0) });
          if (addrLine2) {
            pCert.drawText(addrLine2, { x: 125, y: 651, size: 9, font, color: rgb(0, 0, 0) });
          }

          // 담당자 / 전화번호
          pCert.drawText(item.empName || '', { x: 400, y: 666, size: 10.5, font, color: rgb(0, 0, 0) });
          pCert.drawText(item.empPhone || '', { x: 400, y: 651, size: 9, font, color: rgb(0, 0, 0) });
        }
        outPdf.addPage(pCert);
      }

      // ----------------------------------------------------
      // [PAGE 5] 약관 & 청약철회 신청서 (사람당 1장)
      // ----------------------------------------------------
      const pageIndex5 = tplPdf.getPageCount() >= 5 ? 4 : tplPdf.getPageCount() - 1;
      const [p5] = await outPdf.copyPages(tplPdf, [pageIndex5]);

      outPdf.addPage(p5);
    }

    // 3. 완성된 PDF 생성 및 브라우저 출력 열기
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
