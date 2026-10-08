// 수기발주 대장 및 설치확인서 연동 유틸리티

export interface ManualOrderInfo {
  orderDate?: string;
  deliveryDate?: string;
  courier?: string;
  trackingNo?: string;
  deliveryState?: string;
  installCertStatus?: '등록' | '미등록';
  installCertDate?: string;
  installCertMonth?: string; // YYYY-MM
}

/**
 * 로컬스토리지 또는 메모리의 manualOrderStores에서 주문 건의 수기발주 정보를 매칭 조회
 */
export function getManualOrderInfo(
  item: any,
  store?: Record<string, ManualOrderInfo>
): ManualOrderInfo | null {
  if (!store || typeof store !== 'object') return null;

  const rawKeys = [
    item.rentalNo,
    item.contractNo,
    item.resNo,
    item.uniqueKey,
    item.memNo
  ];

  for (const k of rawKeys) {
    if (!k) continue;
    const strK = String(k).trim();
    if (!strK || strK === '-') continue;
    if (store[strK]) return store[strK];

    const digits = strK.replace(/[^0-9]/g, '');
    if (digits && store[digits]) return store[digits];
  }

  return null;
}

/**
 * 수기발주 대상 상품인지 판별
 */
export function isManualTargetProduct(
  prodName?: string,
  rentalProd?: string,
  targetProducts?: string[]
): boolean {
  if (!targetProducts || targetProducts.length === 0) return false;
  const cleanProd = (prodName || '').replace(/[\s()]/g, '').toLowerCase();
  const cleanRental = (rentalProd || '').replace(/[\s()]/g, '').toLowerCase();
  return targetProducts.some((p) => {
    const cleanP = (p || '').replace(/[\s()]/g, '').toLowerCase();
    if (!cleanP) return false;
    return (
      (cleanProd && (cleanProd.includes(cleanP) || cleanP.includes(cleanProd))) ||
      (cleanRental && (cleanRental.includes(cleanP) || cleanP.includes(cleanRental)))
    );
  });
}

/**
 * 마감월(YYYY-MM)의 익월(YYYY-MM) 계산 (예: '2026-10' -> '2026-11', '2026-12' -> '2027-01')
 */
export function getNextMonthStr(yearMonth: string): string {
  if (!yearMonth || !yearMonth.includes('-')) return '';
  const parts = yearMonth.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return '';
  const nextDate = new Date(y, m, 1); // JS Date: 0-indexed month이므로 m이 바로 익월
  const nextY = nextDate.getFullYear();
  const nextM = String(nextDate.getMonth() + 1).padStart(2, '0');
  return `${nextY}-${nextM}`;
}

/**
 * 공급수수료/특수수당 규칙인지 판별
 */
export function isSupplyCommissionRule(rule: any): boolean {
  if (!rule) return false;
  if (rule.baseDateType === 'DELIVERY') return true;
  if (!rule.targetName || rule.targetName.trim() === '' || rule.targetName === 'SELF_HQ' || rule.targetName === '판매본부' || rule.targetName === '해당본부' || rule.targetName === '본부') return true;
  if (rule.incentiveName && rule.incentiveName.includes('공급수수료')) return true;
  return false;
}

/**
 * 특수수당/공급수수료 대상 건의 설치확인서 기반 지급 자격 및 지급월 판정
 */
export function checkInstallCertEligibility(
  item: any,
  manualOrderStores?: Record<string, ManualOrderInfo>,
  targetProducts?: string[]
): {
  isTargetOrder: boolean;        // 수기발주 대상 주문인지 여부
  isCertRegistered: boolean;     // 설치확인서 등록 여부
  certMonth: string;             // 설치확인서 정산 마감월 (YYYY-MM)
  expectedPayoutMonth: string;   // 익월 지급 예정월 (YYYY-MM)
  isHold: boolean;               // 공급수수료 지급 보류 여부
  holdReason?: string;           // 보류 사유
} {
  const manualInfo = getManualOrderInfo(item, manualOrderStores);
  const isTarget = isManualTargetProduct(item.prodName, item.rentalProd, targetProducts) || !!manualInfo;

  if (!isTarget) {
    // 수기발주 관리 대상 상품이 아니면 통과
    return {
      isTargetOrder: false,
      isCertRegistered: true,
      certMonth: '',
      expectedPayoutMonth: '',
      isHold: false,
    };
  }

  // 배송상태 확인: 배송완료 상태여야 함 (수기발주 대장 상태 우선)
  const delState = manualInfo?.deliveryState || item.deliveryStatus || '';
  const isDelivered = delState.includes('완료') || delState === '배송완료';

  if (!isDelivered) {
    return {
      isTargetOrder: true,
      isCertRegistered: false,
      certMonth: '',
      expectedPayoutMonth: '',
      isHold: true,
      holdReason: '배송 미완료',
    };
  }

  // 설치확인서 등록 여부 확인
  const certStatus = manualInfo?.installCertStatus ?? '미등록';
  if (certStatus !== '등록') {
    return {
      isTargetOrder: true,
      isCertRegistered: false,
      certMonth: '',
      expectedPayoutMonth: '',
      isHold: true,
      holdReason: '설치확인서 미등록 (지급보류)',
    };
  }

  // 설치확인서 마감월 확인
  let certMonth = manualInfo?.installCertMonth || '';
  if (!certMonth && manualInfo?.installCertDate) {
    certMonth = manualInfo.installCertDate.substring(0, 7);
  }

  if (!certMonth) {
    return {
      isTargetOrder: true,
      isCertRegistered: true,
      certMonth: '',
      expectedPayoutMonth: '',
      isHold: true,
      holdReason: '설치확인서 마감월 미지정 (지급보류)',
    };
  }

  const expectedPayoutMonth = getNextMonthStr(certMonth);

  return {
    isTargetOrder: true,
    isCertRegistered: true,
    certMonth,
    expectedPayoutMonth,
    isHold: false,
  };
}
