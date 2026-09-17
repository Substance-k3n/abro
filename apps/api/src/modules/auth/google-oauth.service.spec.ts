import { GoogleOAuthService } from './google-oauth.service';

/**
 * Only the pure parts (isConfigured/buildAuthUrl) are unit-tested here.
 * exchangeCode() makes real HTTP calls to Google's OAuth endpoints and has
 * no mockable seam in this codebase (no HTTP-mocking library, no fetch
 * wrapper) -- exercising it is deferred to AuthService's integration tests,
 * which substitute a hand-written GoogleOAuthService subclass instead of
 * touching the network. See docs/BACKEND_PLAN.md item 1 for this call.
 */
describe('GoogleOAuthService', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('isConfigured', () => {
    it('is false when any of the three env vars is missing', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CALLBACK_URL;
      expect(new GoogleOAuthService().isConfigured()).toBe(false);

      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      delete process.env.GOOGLE_CALLBACK_URL;
      expect(new GoogleOAuthService().isConfigured()).toBe(false);
    });

    it('is true when all three env vars are set', () => {
      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';
      process.env.GOOGLE_CALLBACK_URL = 'https://example.com/callback';
      expect(new GoogleOAuthService().isConfigured()).toBe(true);
    });
  });

  describe('buildAuthUrl', () => {
    it('embeds client_id, callback, state, and the openid/email/profile scope', () => {
      process.env.GOOGLE_CLIENT_ID = 'my-client-id';
      process.env.GOOGLE_CALLBACK_URL = 'https://example.com/callback';

      const url = new URL(new GoogleOAuthService().buildAuthUrl('the-state'));

      expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url.searchParams.get('client_id')).toBe('my-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback');
      expect(url.searchParams.get('state')).toBe('the-state');
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(url.searchParams.get('response_type')).toBe('code');
    });
  });
});
