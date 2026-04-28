
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { RequestHandler } from "./handlers/request.handler.ts";

// Main Handler
const handler = async (req: Request): Promise<Response> => {
  const requestHandler = new RequestHandler();

  if (req.method === "OPTIONS") {
    return requestHandler.handleOptions();
  }

  return requestHandler.handlePost(req);
};

serve(handler);
