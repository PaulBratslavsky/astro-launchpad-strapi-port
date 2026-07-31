import type { APIRoute } from 'astro';
import { enableDraftMode, disableDraftMode } from '@/lib/draft';

/**
 * Preview / draft-mode entry point.
 *
 * GET /api/preview?secret=<PREVIEW_SECRET>&url=<target>&status=<draft|published>
 *
 * Matches the contract Strapi's admin builds in `config/admin.ts`, so the same
 * preview URL template works across every LaunchPad frontend.
 *
 * `status=published` disables draft mode instead of enabling it — that is how
 * the admin's "view the published version" toggle comes back.
 */
export const prerender = false;

export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const secret = url.searchParams.get('secret');
  const target = url.searchParams.get('url') ?? '/';
  const status = url.searchParams.get('status');

  const expected = import.meta.env.PREVIEW_SECRET ?? process.env.PREVIEW_SECRET;

  if (!expected) {
    return new Response('PREVIEW_SECRET is not configured on the server.', {
      status: 500,
    });
  }

  if (secret !== expected) {
    return new Response('Invalid token', { status: 401 });
  }

  if (status === 'published') {
    disableDraftMode(cookies);
  } else {
    enableDraftMode(cookies);
  }

  // Only same-origin paths — an open redirect here would be handed out by
  // Strapi's admin to anyone who can read the preview URL.
  const safeTarget = target.startsWith('/') ? target : '/';
  return redirect(safeTarget, 307);
};
