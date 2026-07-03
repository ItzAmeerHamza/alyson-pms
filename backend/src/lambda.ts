import type { Handler } from 'aws-lambda';
import { configure } from '@codegenie/serverless-express';
import { createApp } from './create-app';

let cachedHandler: Handler;

export const handler: Handler = async (event, context, callback) => {
  if (!cachedHandler) {
    const app = await createApp();
    const expressApp = app.getHttpAdapter().getInstance();
    cachedHandler = configure({ app: expressApp });
  }
  return cachedHandler(event, context, callback);
};
