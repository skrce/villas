import type { APIRequestContext, Page } from "@playwright/test";

type Options = Parameters<APIRequestContext["get"]>[1];
export const businessUrl = (
  path: string,
  businessId = process.env.VILLAS_PROPERTY_ID,
) => {
  if (
    !businessId ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(businessId) ||
    !path.startsWith("/") ||
    path.startsWith("//")
  )
    throw new Error("Use an explicit test business and local page path.");
  return `/businesses/${businessId}${path}`;
};
export const businessRequest = (page: Page) => {
  const businessId = /^\/businesses\/([a-z0-9][a-z0-9-]{0,63})(?:\/|$)/.exec(
    new URL(page.url()).pathname,
  )?.[1];
  if (!businessId)
    throw new Error("Business API probes require a scoped page URL.");
  const scoped = (options: Options) => ({
    ...options,
    headers: { ...options?.headers, "X-Villas-Business": businessId },
  });
  return {
    get: (url: string, options?: Options) =>
      page.request.get(url, scoped(options)),
    post: (url: string, options?: Options) =>
      page.request.post(url, scoped(options)),
    put: (url: string, options?: Options) =>
      page.request.put(url, scoped(options)),
    delete: (url: string, options?: Options) =>
      page.request.delete(url, scoped(options)),
  };
};
