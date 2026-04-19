export interface UserBrief {
  name: string;
  studentId: string;
  className: string;
}

export interface AuthCapabilities {
  portal: boolean;
  jw: boolean;
}

export interface AuthSession {
  token: string;
  userBrief: UserBrief;
  capabilities?: AuthCapabilities;
}
