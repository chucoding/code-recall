import i18n from '@/shared/config/i18n';

/**
 * 기술적 에러 메시지를 유저 친화적으로 변환 (i18n 적용)
 * 네트워크, API 오류 등 사용자 노출용 메시지 정규화
 */
export function formatFileErrorForUser(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('network') || lower.includes('network error')) return i18n.t('errors.network');
  if (lower.includes('timeout') || lower.includes('time out')) return i18n.t('errors.timeout');
  if (lower.includes('404') || lower.includes('not found')) return i18n.t('errors.notFound');
  if (lower.includes('403') || lower.includes('forbidden')) return i18n.t('errors.forbidden');
  if (lower.includes('500') || lower.includes('server')) return i18n.t('errors.serverError');
  return i18n.t('errors.fileLoadFailed');
}
