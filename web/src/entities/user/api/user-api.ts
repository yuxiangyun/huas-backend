import { apiRequest } from '@/shared/api/http-client';
import type { UserProfile } from '@/entities/user/model/user-types';

export async function getUserInfo(refresh = false) {
  const suffix = refresh ? '?refresh=true' : '';
  return apiRequest<UserProfile>(`/api/user${suffix}`);
}
