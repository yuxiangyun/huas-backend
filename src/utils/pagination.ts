import { AppError, ErrorCode } from './errors';

export function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, `${field} 必须是正安全整数`);
  }
  return value;
}

export function resolvePagination(
  options: { page?: number; pageSize?: number },
  defaultPageSize: number,
  maxPageSize: number,
) {
  const page = positiveSafeInteger(options.page ?? 1, 'page');
  const pageSize = Math.min(positiveSafeInteger(options.pageSize ?? defaultPageSize, 'pageSize'), maxPageSize);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new AppError(ErrorCode.PARAM_ERROR, '分页范围过大');
  }
  return { page, pageSize, offset };
}
