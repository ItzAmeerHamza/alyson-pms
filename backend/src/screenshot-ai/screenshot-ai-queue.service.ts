import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ScreenshotAiJobMessage } from './screenshot-ai.types';

function resolveQueueUrlForVpcEndpoint(queueUrl: string, endpointUrl: string): string {
  try {
    const endpointHost = new URL(endpointUrl).hostname;
    const parsed = new URL(queueUrl);
    parsed.hostname = endpointHost;
    return parsed.toString();
  } catch {
    return queueUrl;
  }
}

@Injectable()
export class ScreenshotAiQueueService {
  private readonly logger = new Logger(ScreenshotAiQueueService.name);
  private readonly client: SQSClient | null;
  private readonly queueUrl: string | null;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const rawQueueUrl = this.config.get<string>('SCREENSHOT_AI_QUEUE_URL') ?? null;
    this.enabled = this.config.get<string>('SCREENSHOT_AI_ENABLED') === 'true';
    const region = this.config.get<string>('AWS_REGION');
    const vpcEndpointUrl = this.config.get<string>('SQS_VPC_ENDPOINT_URL') ?? null;

    if (region && rawQueueUrl) {
      if (vpcEndpointUrl) {
        this.client = new SQSClient({
          region,
          endpoint: vpcEndpointUrl,
          useQueueUrlAsEndpoint: false,
        });
        this.queueUrl = resolveQueueUrlForVpcEndpoint(rawQueueUrl, vpcEndpointUrl);
      } else {
        this.client = new SQSClient({ region });
        this.queueUrl = rawQueueUrl;
      }
    } else {
      this.client = null;
      this.queueUrl = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled && Boolean(this.client && this.queueUrl);
  }

  async enqueue(job: ScreenshotAiJobMessage): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug(`AI pipeline disabled — skip enqueue ${job.screenshotId}`);
      return false;
    }

    if (!this.client || !this.queueUrl) {
      this.logger.warn(
        `SCREENSHOT_AI_QUEUE_URL not configured — screenshot ${job.screenshotId} not enqueued`,
      );
      return false;
    }

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(job),
        MessageAttributes: {
          source: { DataType: 'String', StringValue: job.source },
          screenshotId: { DataType: 'String', StringValue: job.screenshotId },
        },
      }),
    );

    return true;
  }

  async enqueueMany(jobs: ScreenshotAiJobMessage[]): Promise<number> {
    let sent = 0;
    for (const job of jobs) {
      if (await this.enqueue(job)) sent += 1;
    }
    return sent;
  }
}
