import { All, Controller, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Public } from "../common/decorators/public.decorator.js";
import { getAuth } from "./auth.js";

@Public()
@Controller("auth")
export class AuthController {
  @All("*")
  async handleAuth(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const baseUrl = process.env.BACKOFFICE_API_BASE_URL?.replace(/\/+$/, "");
    const isProd = process.env.NODE_ENV === "production";
    if (!baseUrl && isProd) {
      throw new Error("BACKOFFICE_API_BASE_URL is required in production");
    }

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
    const response = await getAuth().handler(fetchRequest);

    reply.status(response.status);

    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];
    if (setCookies.length) {
      reply.header("set-cookie", setCookies);
    }

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        return;
      }
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
