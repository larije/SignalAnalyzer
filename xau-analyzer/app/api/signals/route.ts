// Analysis and history belong to the current browser. No server process is started.
export function GET() {
  return Response.json({ error: 'This endpoint has moved to browser-local analysis. Reload the dashboard.' }, { status: 410 });
}
