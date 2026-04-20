export interface UserBrief {
  name: string;
  studentId: string;
  className: string;
}

export interface AuthSession {
  token: string;
  userBrief: UserBrief;
}
