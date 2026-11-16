const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function formatVietnamDateTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: VIETNAM_TIME_ZONE,
  }).format(new Date(value));
}

export function formatVietnamDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeZone: VIETNAM_TIME_ZONE,
  }).format(new Date(value));
}

export function formatVietnamTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeStyle: 'medium',
    timeZone: VIETNAM_TIME_ZONE,
  }).format(new Date(value));
}
