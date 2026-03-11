import { All, Controller, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Public } from "../common/decorators/public.decorator.js";
import { auth } from "./auth.js";

@Public()
@Controller("auth")
export class AuthController {
  @All("*")
  async handleAuth(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const baseUrl = process.env.BACKOFFICE_API_BASE_URL;
    const url = baseUrl
      ? `${baseUrl}${req.url}`
      : `${req.protocol}://${req.hostname}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      init.body = JSON.stringify(req.body);
      headers.set("content-type", "application/json");
    }

    const fetchRequest = new Request(url, init);
    const response = await auth.handler(fetchRequest);

    reply.status(response.status);

    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    const body = await response.text();
    if (body) {
      await reply.send(body);
    } else {
      await reply.send();
    }
  }
}
