// ==========================================
// 더좋은라이프 ERP 공통 엑셀 스타일러 & 유틸리티 (xlsx-js-style 전용)
// ==========================================

// @ts-ignore
const getXLSX = () => (window as any).XLSX;

export function autoFitColWidths(rows: any[][], minW = 12, maxW = 50): { wch: number }[] {
  const widths = rows.reduce((acc, row) => {
    row.forEach((cell, i) => {
      let str = '';
      if (cell && typeof cell === 'object' && cell.v !== undefined) str = cell.v.toString();
      else if (cell !== null && cell !== undefined) str = cell.toString();
      // 한글 2.2배, 영문/숫자 1.1배 너비 계산
      const len = str.split('').reduce((a: number, c: string) => a + (c.charCodeAt(0) > 127 ? 2.2 : 1.1), 0);
      if (!acc[i] || len > acc[i]) acc[i] = len;
    });
    return acc;
  }, [] as number[]);
  return widths.map(w => ({ wch: Math.min(Math.max(Math.ceil(w + 4), minW), maxW) }));
}

export function applyTableExcelStyle(
  ws: any, 
  theme: 'BLUE' | 'PURPLE' | 'EMERALD' | 'SLATE' = 'BLUE'
) {
  const XLSX = getXLSX();
  if (!ws || !ws['!ref'] || !XLSX) return;

  const themes = {
    BLUE: { headerBg: "1E40AF", titleColor: "1E3A8A", subBg: "EEF2FF", lightBg: "EFF6FF" },
    PURPLE: { headerBg: "4C1D95", titleColor: "3B0764", subBg: "F3E8FF", lightBg: "FAF5FF" },
    EMERALD: { headerBg: "065F46", titleColor: "064E3B", subBg: "ECFDF5", lightBg: "F0FDF4" },
    SLATE: { headerBg: "1E293B", titleColor: "0F172A", subBg: "F1F5F9", lightBg: "F8FAFC" }
  };
  const curTheme = themes[theme] || themes.BLUE;

  const headerFont = { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "FFFFFF" } };
  const headerFill = { fgColor: { rgb: curTheme.headerBg } };
  const headerBorder = {
    top: { style: "thin", color: { rgb: "94A3B8" } },
    bottom: { style: "medium", color: { rgb: "0F172A" } },
    left: { style: "thin", color: { rgb: "94A3B8" } },
    right: { style: "thin", color: { rgb: "94A3B8" } }
  };

  const cellFont = { name: "맑은 고딕", sz: 9.5, color: { rgb: "1E293B" } };
  const cellBorder = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "thin", color: { rgb: "E2E8F0" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } }
  };

  const totalFont = { name: "맑은 고딕", sz: 10, bold: true, color: { rgb: "0F172A" } };
  const totalFill = { fgColor: { rgb: "F1F5F9" } };
  const totalBorder = {
    top: { style: "thin", color: { rgb: "475569" } },
    bottom: { style: "double", color: { rgb: "0F172A" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } }
  };

  const range = XLSX.utils.decode_range(ws['!ref']);
  const rowHeights: { hpt: number }[] = [];

  const headerKeywords = [
    '공급사명', '공급사', '수수료 수령처', '수령처', '관련 공급사 (기준)', '관련 공급사 (나열)', '관련 공급사', 
    '렌탈계약번호', '계약ID', '구분', '순번', 'No', '본부', '본부명', '지사', '사원명', '영업사원', '항목명', '수령처명',
    '계약일자', '배송일자', '배송완료일', '설치확인일자', '설치확인서 등록여부', '설치확인일자/마감월', '고객명', '회원명', '회원번호',
    '상품명', '제품명', '매칭 제품명', '구좌수', '수량', '상품개수', '입금월', '세금계산서작성일(W열)',
    '리치웰페어입금액', '리치웰페어입금액(I열)', '공급물품대금', '공급단가 (VAT포함)', '물품공급가',
    '공급수수료', '수수료 단가 (VAT포함)', '지급 수수료 (VAT포함)', '총 지급 수수료 (VAT포함)', '공급가액', '부가세 (10%)',
    '최종순수익', '실질 순수익 [D]', '건별순익', '비고'
  ];

  let headerEncountered = false;

  for (let R = range.s.r; R <= range.e.r; ++R) {
    let rowH = 21; // 기본 데이터 행 높이

    let isHeader = false;
    let isTotal = false;
    let isSection = false;
    let filledCellCount = 0;

    // 행 내의 셀들 검사하여 헤더/합계 여부 확인
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const val = ws[addr] ? String(ws[addr].v || '').trim() : '';
      if (val !== '') filledCellCount++;

      if (headerKeywords.includes(val)) {
        isHeader = true;
      }
      if (val === '합계' || val === '총합계' || val === '총계' || val.includes('소계') || val === '공급사 소계' || val.includes('합계금액')) {
        isTotal = true;
      }
      if (val.startsWith('[') && (val.endsWith(']') || val.includes(']'))) {
        isSection = true;
      }
    }

    // 만약 1개 셀만 헤더 키워드와 우연히 같고 전체 행에 셀이 1개뿐이면 타이틀이나 섹션일 수 있음
    if (isHeader && filledCellCount <= 1 && !headerEncountered && R === 0) {
      isHeader = false;
    }

    if (isHeader) {
      // 헤더 행
      headerEncountered = true;
      rowH = 26;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font: headerFont,
          fill: headerFill,
          alignment: { vertical: "center", horizontal: "center", wrapText: true },
          border: headerBorder
        };
      }
    } else if (R === 0 && !headerEncountered) {
      // 대제목 (타이틀)
      rowH = 28;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font: { name: "맑은 고딕", sz: 14, bold: true, color: { rgb: curTheme.titleColor } },
          alignment: { vertical: "center", horizontal: "left" }
        };
      }
    } else if (R <= 3 && !headerEncountered && !isSection && !isTotal) {
      // 서브 안내 정보 (헤더 행이 나타나기 전 상단 안내문)
      rowH = 18;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font: { name: "맑은 고딕", sz: 9, color: { rgb: "64748B" } },
          alignment: { vertical: "center", horizontal: "left" }
        };
      }
    } else if (isSection) {
      // 섹션 구분 바
      rowH = 25;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = {
          font: { name: "맑은 고딕", sz: 11, bold: true, color: { rgb: curTheme.titleColor } },
          fill: { fgColor: { rgb: curTheme.subBg } },
          alignment: { vertical: "center", horizontal: "left" },
          border: cellBorder
        };
      }
    } else if (isTotal) {
      // 합계/소계 행
      rowH = 24;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        const isNum = ws[addr].t === 'n' || (typeof ws[addr].v === 'number');
        ws[addr].s = {
          font: totalFont,
          fill: totalFill,
          alignment: { vertical: "center", horizontal: isNum ? "right" : "center" },
          border: totalBorder
        };
        if (isNum && !ws[addr].z) {
          ws[addr].z = '#,##0';
        }
      }
    } else {
      // 일반 데이터 행
      rowH = 21;
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;

        const isNum = ws[addr].t === 'n' || (typeof ws[addr].v === 'number');
        const strVal = String(ws[addr].v || '').trim();

        // 중앙 정렬할 항목 판별
        const isCenter = !isNum && (
          /^\d{4}[-./]\d{2}[-./]\d{2}$/.test(strVal) ||
          /^\d{4}[-./]\d{2}$/.test(strVal) ||
          /^\d{3}-\d{2}-\d{5}$/.test(strVal) ||
          strVal === '등록' || strVal === '미등록' || strVal === '배송완료' ||
          (/^\d+$/.test(strVal) && strVal.length <= 4) ||
          strVal.includes('매월') || strVal.endsWith('일') ||
          strVal === '-' || strVal === '정상'
        );

        ws[addr].s = {
          font: cellFont,
          alignment: { 
            vertical: "center", 
            horizontal: isNum ? "right" : (isCenter ? "center" : "left") 
          },
          border: cellBorder
        };

        if (isNum && !ws[addr].z) {
          ws[addr].z = '#,##0';
        }
      }
    }

    rowHeights.push({ hpt: rowH });
  }

  ws['!rows'] = rowHeights;
}
