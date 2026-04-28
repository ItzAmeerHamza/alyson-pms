import { Resolver, Subscription, Query, Args, ObjectType, Field } from '@nestjs/graphql';
import { Injectable } from '@nestjs/common';
import { PubSubService } from '../common/pubsub.service';

@ObjectType()
export class ScreenshotCaptured {
  @Field()
  id: string;

  @Field()
  image_url: string;

  @Field()
  captured_at: string;

  @Field({ nullable: true })
  activity_percent?: number;

  @Field()
  userId: string;
}

@Injectable()
@Resolver()
export class ScreenshotsResolver {
  constructor(private pubSubService: PubSubService) {}

  @Query(() => String)
  health(): string {
    return 'GraphQL API is running';
  }

  @Subscription(() => ScreenshotCaptured, {
    filter: (payload, variables) => {
      // If userId is provided, only send to that user
      if (variables.userId) {
        return payload.screenshotCaptured.userId === variables.userId;
      }
      return true;
    },
  })
  screenshotCaptured(@Args('userId', { nullable: true }) userId?: string) {
    return this.pubSubService.asyncIterator<{ screenshotCaptured: ScreenshotCaptured }>('SCREENSHOT_CAPTURED');
  }

  // Method to publish screenshot events
  async publishScreenshotCaptured(screenshot: any) {
    const payload = {
      screenshotCaptured: {
        id: screenshot.id,
        image_url: screenshot.image_url,
        captured_at: screenshot.captured_at,
        activity_percent: screenshot.activity_percent,
        userId: screenshot.user_id,
      },
    };

    await this.pubSubService.publish('SCREENSHOT_CAPTURED', payload);
  }
} 