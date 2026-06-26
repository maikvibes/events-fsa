export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UserDeviceToken {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  createdAt: Date;
  updatedAt: Date;
}
