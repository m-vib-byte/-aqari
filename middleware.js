// The physical index.html is the protected app shell. Route only the public
// root before filesystem matching, without a browser redirect or backend call.
export const config = { matcher: '/' };

export default function middleware(request) {
  const target = new URL(request.url);
  if (target.pathname !== '/' || !['GET','HEAD'].includes(request.method)) {
    return new Response(null, { headers:{ 'x-middleware-next':'1' } });
  }
  target.pathname = '/login.html';
  return new Response(null, { headers:{
    'x-middleware-rewrite':target.href,
    'Cache-Control':'no-store, max-age=0, must-revalidate'
  } });
}
