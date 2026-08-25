import {
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoAdminCreateResult,
  CognitoAdminDeleteResult,
  CognitoAdminGetResult,
  adminCreateUser,
  adminDeleteUser,
  adminGetUser,
} from './cognito-admin.ops';

function isCreateFailure(
  result: CognitoAdminCreateResult,
): result is Extract<CognitoAdminCreateResult, { ok: false }> {
  return result.ok === false;
}

function isGetFailure(
  result: CognitoAdminGetResult,
): result is Extract<CognitoAdminGetResult, { ok: false }> {
  return result.ok === false;
}

function isDeleteFailure(
  result: CognitoAdminDeleteResult,
): result is Extract<CognitoAdminDeleteResult, { ok: false }> {
  return result.ok === false;
}

/**
 * Server-side Cognito user pool administration (create/delete pool users).
 *
 * Local / laptop: calls Cognito Admin APIs directly (public internet).
 *
 * VPC Lambda (no NAT): set COGNITO_ADMIN_FUNCTION_NAME to a non-VPC worker that
 * talks to Cognito publicly, and LAMBDA_VPC_ENDPOINT_URL to the Lambda interface
 * endpoint hostname (vpce-*.lambda.REGION.vpce.amazonaws.com) with
 * PrivateDnsEnabled=false — same Option A pattern as SQS_VPC_ENDPOINT_URL.
 *
 * Do not use cognito-idp PrivateLink for the Palisade pool: Managed Login /
 * user-pool domains are incompatible with Cognito VPC endpoints.
 * Never enable Private DNS on shared-VPC endpoints.
 */
@Injectable()
export class CognitoAdminService {
  private readonly logger = new Logger(CognitoAdminService.name);
  private readonly cognitoClient: CognitoIdentityProviderClient | null = null;
  private readonly lambdaClient: LambdaClient | null = null;
  private readonly adminFunctionName: string;
  private readonly userPoolId: string;
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const region =
      config.get<string>('COGNITO_REGION') || config.get<string>('AWS_REGION') || '';
    this.userPoolId = config.get<string>('COGNITO_USER_POOL_ID') || '';
    this.adminFunctionName = (config.get<string>('COGNITO_ADMIN_FUNCTION_NAME') || '').trim();

    if (!region || !this.userPoolId) {
      this.logger.warn(
        'Cognito admin disabled — COGNITO_REGION and COGNITO_USER_POOL_ID are required to provision users',
      );
      this.enabled = false;
      return;
    }

    // Local dev may use long-lived AKIA keys. Lambda injects role credentials via the
    // default provider chain, so only pass static creds when they are explicitly set.
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    const useStaticDevCredentials = Boolean(
      accessKeyId?.startsWith('AKIA') &&
        secretAccessKey &&
        !config.get<string>('AWS_SESSION_TOKEN'),
    );
    const staticCreds = useStaticDevCredentials
      ? { credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } }
      : {};

    if (this.adminFunctionName) {
      const lambdaEndpoint = (config.get<string>('LAMBDA_VPC_ENDPOINT_URL') || '').trim();
      if (lambdaEndpoint) {
        this.logger.log(
          `Cognito admin via Lambda ${this.adminFunctionName} (VPC endpoint, Private DNS off): ${lambdaEndpoint}`,
        );
      } else {
        this.logger.log(`Cognito admin via Lambda ${this.adminFunctionName} (public Lambda API)`);
      }
      this.lambdaClient = new LambdaClient({
        region,
        ...(lambdaEndpoint ? { endpoint: lambdaEndpoint } : {}),
        ...staticCreds,
      });
      this.enabled = true;
      return;
    }

    this.logger.log('Cognito admin using direct Cognito API (local / public path)');
    this.cognitoClient = new CognitoIdentityProviderClient({
      region,
      ...staticCreds,
    });
    this.enabled = true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Creates a Cognito pool user with a temporary password.
   * Cognito's default invite email is suppressed — Pulse sends its own SES mail.
   */
  async createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<{
    sub: string;
    username: string;
    created: boolean;
    temporaryPassword?: string;
  }> {
    if (!this.enabled) {
      throw new InternalServerErrorException('User provisioning is not configured');
    }

    this.logger.log(`AdminCreateUser starting for ${input.email}`);
    const result = this.lambdaClient
      ? await this.invokeAdmin<CognitoAdminCreateResult>({
          action: 'create',
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
        })
      : await adminCreateUser(this.cognitoClient!, this.userPoolId, input);

    if (isCreateFailure(result)) {
      if (result.code === 'USERNAME_EXISTS') {
        // Already in the pool — look up sub so Pulse can link without re-invite.
        const existing = await this.getUser(input.email);
        return { ...existing, created: false };
      }
      if (result.code === 'MISSING_IDENTIFIER') {
        throw new InternalServerErrorException('Cognito did not return a user identifier');
      }
      this.logger.error(`AdminCreateUser failed: ${result.message}`);
      throw new InternalServerErrorException('Failed to create user in the identity pool');
    }

    this.logger.log(`AdminCreateUser ok for ${input.email}`);
    return {
      sub: result.sub,
      username: result.username,
      created: true,
      temporaryPassword: result.temporaryPassword,
    };
  }

  /** Resolve an existing Cognito user by email/username (no invite email). */
  async getUser(emailOrUsername: string): Promise<{ sub: string; username: string }> {
    if (!this.enabled) {
      throw new InternalServerErrorException('User provisioning is not configured');
    }

    const username = emailOrUsername.trim().toLowerCase();
    const result = this.lambdaClient
      ? await this.invokeAdmin<CognitoAdminGetResult>({
          action: 'get',
          username,
        })
      : await adminGetUser(this.cognitoClient!, this.userPoolId, username);

    if (isGetFailure(result)) {
      if (result.code === 'NOT_FOUND') {
        throw new NotFoundException('User not found in Cognito');
      }
      this.logger.error(`AdminGetUser failed: ${result.message}`);
      throw new InternalServerErrorException('Failed to look up user in the identity pool');
    }

    return { sub: result.sub, username: result.username };
  }

  /** Best-effort rollback when the DB write fails after the Cognito user was created. */
  async deleteUser(username: string): Promise<void> {
    if (!this.enabled) return;
    try {
      const result = this.lambdaClient
        ? await this.invokeAdmin<CognitoAdminDeleteResult>({
            action: 'delete',
            username,
          })
        : await adminDeleteUser(this.cognitoClient!, this.userPoolId, username);

      if (isDeleteFailure(result)) {
        this.logger.error(
          `AdminDeleteUser rollback failed for ${username}: ${result.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `AdminDeleteUser rollback failed for ${username}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async invokeAdmin<T>(payload: Record<string, unknown>): Promise<T> {
    if (!this.lambdaClient || !this.adminFunctionName) {
      throw new BadRequestException('Cognito admin Lambda is not configured');
    }

    const out = await this.lambdaClient.send(
      new InvokeCommand({
        FunctionName: this.adminFunctionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(payload)),
      }),
    );

    const raw = out.Payload ? Buffer.from(out.Payload).toString('utf8') : '';
    if (out.FunctionError) {
      this.logger.error(`Cognito admin Lambda error (${out.FunctionError}): ${raw}`);
      throw new InternalServerErrorException('Failed to create user in the identity pool');
    }

    try {
      return JSON.parse(raw || '{}') as T;
    } catch {
      this.logger.error(`Cognito admin Lambda returned non-JSON: ${raw.slice(0, 500)}`);
      throw new InternalServerErrorException('Failed to create user in the identity pool');
    }
  }
}
