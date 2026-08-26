// P017: when getRoot() degrades (e.g. the upstream API root returns 403, so no
// search-* rels are advertised), dynamic discovery never registers the tool.
// client.callTool() on an unregistered tool returns an MCP error STRING content
// ("MCP error -32602: Tool ... not found"), not a {status, headers, body} envelope.
// JSON.parse on that string throws the cryptic "Unexpected token 'M'" stack that
// masks the real cause - upstream of P007's envelope.status branch, which never runs.
// This helper detects the non-envelope shape and throws a message that NAMES the cause.
export function parseEnvelopeOrExplain(text, toolName) {
  const trimmed = (text ?? '').trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(
      `Upstream tool '${toolName}' did not return a JSON envelope (got: ${JSON.stringify(text)}). ` +
        `Likely cause: '${toolName}' was not registered because getRoot() advertised no rels - ` +
        `check the RAPIDAPI_KEY subscription state (a 403 from the API root degrades dynamic tool ` +
        `discovery; see P012). This is the unregistered-tool sibling of P007's non-200 path.`,
    );
  }
  return JSON.parse(trimmed);
}
