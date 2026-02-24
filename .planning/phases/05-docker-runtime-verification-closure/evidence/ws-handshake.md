## WebSocket handshake verification

- Timestamp (UTC): 2026-02-24T00:00:00Z
- App URL: `http://localhost:44285/`
- Expected WS URL: `ws://localhost:6767/ws?clientSessionKey=web-client`
- Observed result: handshake failed
- HTTP 101 seen: no

### Evidence

- Browser snapshot showed reconnect overlay with:
  - `endpoint: localhost:6767`
  - `ws: ws://localhost:6767/ws?clientSessionKey=web-client`
  - `reason: WebSocket closed unexpectedly (1006)`
- Browser console/network events showed:
  - `WebSocket connection ... failed`
  - `ERR_CONNECTION_REFUSED`

### Conclusion

The required `101 Switching Protocols` upgrade was not observed. This checkpoint fails and should not be approved.
