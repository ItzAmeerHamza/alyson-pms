export const cognitoRegion = import.meta.env.VITE_COGNITO_REGION as string;
export const cognitoUserPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string;
export const cognitoClientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string;

export const isCognitoAuthEnabled =
  import.meta.env.VITE_AUTH_PROVIDER === 'cognito' &&
  Boolean(cognitoRegion && cognitoUserPoolId && cognitoClientId);

export function assertCognitoConfig(): void {
  if (!isCognitoAuthEnabled) {
    throw new Error(
      'Cognito auth is not configured. Set VITE_AUTH_PROVIDER=cognito and VITE_COGNITO_* in web/.env',
    );
  }
}
