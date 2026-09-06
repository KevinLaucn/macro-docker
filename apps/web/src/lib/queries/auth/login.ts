import { authServiceClient } from '@service-auth/client';

export function passwordLogin(args: { email: string; password: string }) {
  return authServiceClient.passwordLogin(args);
}

export function passwordlessCallback(args: { email: string; code: string }) {
  return authServiceClient.passwordlessCallback(args);
}

export function sessionLogin(args: { session_code: string }) {
  return authServiceClient.sessionLogin(args);
}
