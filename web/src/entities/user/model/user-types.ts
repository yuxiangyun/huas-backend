export interface UserProfile {
  name: string;
  studentId: string;
  className: string;
  identity: string;
  organizationCode: string;
}

export interface CalendarSubscriptionLink {
  url: string;
  studentId: string;
  sig: string;
}
