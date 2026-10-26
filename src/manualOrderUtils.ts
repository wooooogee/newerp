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
 * 로컬스토리지와 클라우드 수기발주 저장소를 비파괴적으로 안전하게 병합 (Deep Non-Destructive Merge)
 * - 클라우드 데이터 로드 시 로컬에 이미 등록된 '등록' 상태나 확인서 일자/마감월이 누락/미등록으로 리셋되지 않도록 완벽 보존
 */
export function mergeManualOrderStores(
  baseStore: Record<string, ManualOrderInfo> = {},
  incomingStore: Record<string, ManualOrderInfo> = {}
): Record<string, ManualOrderInfo> {
  const merged: Record<string, ManualOrderInfo> = {};

  // 1. baseStore 복사
  Object.entries(baseStore || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object') {
      merged[k] = { ...v };
    }
  });

  // 2. incomingStore 안전 병합
  Object.entries(incomingStore || {}).forEach(([key, incoming]) => {
    if (!incoming || typeof incoming !== 'object') return;
    const existing = merged[key];

    if (!existing) {
      merged[key] = { ...incoming };
      return;
    }

    // 기본 배송정보는 들어오는 쪽의 값이 비어있지 않으면 우선 적용
    const orderDate = incoming.orderDate?.trim() || existing.orderDate || '';
    const deliveryDate = incoming.deliveryDate?.trim() || existing.deliveryDate || '';
    const courier = incoming.courier?.trim() || existing.courier || '';
    const trackingNo = incoming.trackingNo?.trim() || existing.trackingNo || '';
    const deliveryState = incoming.deliveryState?.trim() || existing.deliveryState || '';

    // 설치확인서 관련 필드 병합:
    // 들어오는 쪽(incoming)에서 명시적으로 변경(등록 또는 미등록)한 경우 최우선 반영!
    let installCertStatus: '등록' | '미등록' = '미등록';
    let installCertDate = '';
    let installCertMonth = '';

    if (incoming.installCertStatus === '미등록') {
      // 사용자가 명시적으로 '미등록'으로 해제한 경우, 기존 등록값을 초기화
      installCertStatus = '미등록';
      installCertDate = '';
      installCertMonth = '';
    } else if (incoming.installCertStatus === '등록') {
      installCertStatus = '등록';
      installCertDate = incoming.installCertDate?.trim() || existing.installCertDate || '';
      installCertMonth = incoming.installCertMonth?.trim() || existing.installCertMonth || (installCertDate ? installCertDate.substring(0, 7) : '');
    } else if (existing.installCertStatus === '미등록') {
      installCertStatus = '미등록';
      installCertDate = '';
      installCertMonth = '';
    } else if (existing.installCertStatus === '등록') {
      installCertStatus = '등록';
      installCertDate = incoming.installCertDate?.trim() || existing.installCertDate || '';
      installCertMonth = incoming.installCertMonth?.trim() || existing.installCertMonth || (installCertDate ? installCertDate.substring(0, 7) : '');
    } else if (incoming.installCertDate || existing.installCertDate) {
      installCertDate = incoming.installCertDate?.trim() || existing.installCertDate || '';
      installCertMonth = incoming.installCertMonth?.trim() || existing.installCertMonth || (installCertDate ? installCertDate.substring(0, 7) : '');
      installCertStatus = (installCertDate || installCertMonth) ? '등록' : '미등록';
    }

    if (!installCertMonth && installCertDate) {
      installCertMonth = installCertDate.substring(0, 7);
    }

    merged[key] = {
      orderDate,
      deliveryDate,
      courier,
      trackingNo,
      deliveryState,
      installCertStatus,
      installCertDate,
      installCertMonth,
    };
  });

  return merged;
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
  // 수수료일자 기준(PAY_DATE)인 규칙은 수기발주 마감월 익월 전환을 강제하지 않고 실제 수수료일자 매칭을 따름
  if (rule.baseDateType === 'PAY_DATE') return false;
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

  // 취소/해약/반품/철회 또는 발주취소 상태인 경우 수수료/수기발주 정산 대상에서 완전 제외
  const isCancelled = 
    item.status?.includes('취소') ||
    item.status?.includes('해약') ||
    item.status?.includes('반품') ||
    item.status?.includes('철회') ||
    item.deliveryStatus?.includes('취소') ||
    manualInfo?.deliveryState === '발주취소' ||
    manualInfo?.deliveryState?.includes('취소');

  if (isCancelled) {
    return {
      isTargetOrder: false,
      isCertRegistered: false,
      certMonth: '',
      expectedPayoutMonth: '',
      isHold: false,
      holdReason: '주문 취소/해약 건 (정산 제외)',
    };
  }

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
