export async function onRequest(context) {
  const response = await context.env.ASSETS.fetch(context.request);
  if (response.status === 404) {
    const url = new URL(context.request.url);
    url.pathname = '/index.html';
    return context.env.ASSETS.fetch(url);
  }
  return response;
}
