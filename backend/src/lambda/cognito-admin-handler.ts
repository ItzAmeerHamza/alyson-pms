import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import {
  adminCreateUser,
  adminDeleteUser,
  adminGetUser,
} from '../users/cognito-admin.ops';

/**
 * Non-VPC Lambda: AdminCreateUser/AdminGetUser/AdminDeleteUser over the public Cognito API.
 *
 * The Palisade user pool has Managed Login (domain), which AWS rejects over
 * cognito-idp PrivateLink. The API Lambda (in VPC, no NAT) invokes this function
 * via a Lambda interface VPC endpoint (PrivateDnsEnabled=false).
 */

type CreateEvent = {
  action: 'create';
  email: string;
  firstName: string;
  lastName: string;
};

type GetEvent = {
  action: 'get';
  username: string;
};

type DeleteEvent = {
  action: 'delete';
  username: string;
};

type CognitoAdminEvent = CreateEvent | GetEvent | DeleteEvent;

let client: CognitoIdentityProviderClient | null = null;

function getClient(): CognitoIdentityProviderClient {
  if (!client) {
    const region = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-west-2';
    client = new CognitoIdentityProviderClient({ region });
  }
  return client;
}

function getUserPoolId(): string {
  const id = (process.env.COGNITO_USER_POOL_ID || '').trim();
  if (!id) {
    throw new Error('COGNITO_USER_POOL_ID is required');
  }
  return id;
}

export const handler = async (event: CognitoAdminEvent) => {
  const cognito = getClient();
  const userPoolId = getUserPoolId();

  if (event?.action === 'create') {
    const email = String(event.email || '').trim().toLowerCase();
    const firstName = String(event.firstName || '').trim();
    const lastName = String(event.lastName || '').trim();
    if (!email || !firstName || !lastName) {
      return { ok: false, code: 'ERROR', message: 'email, firstName, and lastName are required' };
    }
    console.log(`cognito-admin create starting for ${email}`);
    const result = await adminCreateUser(cognito, userPoolId, { email, firstName, lastName });
    if (result.ok === true) {
      console.log(`cognito-admin create ok for ${email}`);
    } else {
      console.error(`cognito-admin create failed for ${email}: ${result.code} ${result.message}`);
    }
    return result;
  }

  if (event?.action === 'get') {
    const username = String(event.username || '').trim().toLowerCase();
    if (!username) {
      return { ok: false, code: 'ERROR', message: 'username is required' };
    }
    console.log(`cognito-admin get starting for ${username}`);
    const result = await adminGetUser(cognito, userPoolId, username);
    if (result.ok === false) {
      console.error(`cognito-admin get failed for ${username}: ${result.code} ${result.message}`);
    }
    return result;
  }

  if (event?.action === 'delete') {
    const username = String(event.username || '').trim();
    if (!username) {
      return { ok: false, code: 'ERROR', message: 'username is required' };
    }
    const result = await adminDeleteUser(cognito, userPoolId, username);
    if (result.ok === false) {
      console.error(`cognito-admin delete failed for ${username}: ${result.message}`);
    }
    return result;
  }

  return { ok: false, code: 'ERROR', message: 'Unknown action' };
};
