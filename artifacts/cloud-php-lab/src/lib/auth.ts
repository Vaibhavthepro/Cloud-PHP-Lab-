// Helper to manage auth token and fetch injection
export const TOKEN_KEY = 'phplab_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Intercept window.fetch to automatically attach the Authorization header
// This ensures all hooks from @workspace/api-client-react work seamlessly
export function initAuthInterceptor() {
  const originalFetch = window.fetch;
  
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getToken();
    
    // Only attach token if it exists and we're hitting our API
    const urlStr = input instanceof Request ? input.url : input.toString();
    const isApiCall = urlStr.includes('/api/');
    
    if (token && isApiCall) {
      const headers = new Headers(init?.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      
      init = {
        ...init,
        headers,
      };
    }
    
    return originalFetch(input, init);
  };
}
