/// WebSocket Live client — connects to the Host WS contract described in
/// docs/specs/2026-07-18-native-app.md ("复用的 Host 契约"):
///
///   `ws://<host>:<port>/?token=<token>`
///   recv: {type:'state', slots:[{slotId,label,state,cmuxTarget,tmuxTarget}]}
///   recv: {type:'log', message}
///   send: {type:'subscribe'}
///   send: {type:'command', payload:{action, slotId}}
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:web_socket_channel/web_socket_channel.dart';

import '../model/slot.dart';

/// Live WS client with auto-reconnect (capped exponential backoff).
///
/// All incoming JSON is parsed defensively — a malformed frame is dropped
/// silently rather than crashing the stream. `sendCommand` is a no-op (not
/// an error) when the socket isn't currently connected, matching the "best
/// effort control channel" semantics of the toy Host.
class LiveClient {
  LiveClient({required this.host, required this.port, required this.token});

  final String host;
  final int port;
  final String token;

  static const Duration _initialBackoff = Duration(seconds: 1);
  static const Duration _maxBackoff = Duration(seconds: 30);

  final StreamController<List<SlotState>> _slotsController =
      StreamController<List<SlotState>>.broadcast();
  final StreamController<String> _logsController =
      StreamController<String>.broadcast();
  final StreamController<LiveConnection> _connectionController =
      StreamController<LiveConnection>.broadcast();

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  Timer? _reconnectTimer;
  Duration _backoff = _initialBackoff;

  bool _disposed = false;
  bool _connected = false;

  Stream<List<SlotState>> get slots => _slotsController.stream;
  Stream<String> get logs => _logsController.stream;
  Stream<LiveConnection> get connection => _connectionController.stream;

  /// Starts the connection (and the auto-reconnect loop). Safe to call once;
  /// subsequent calls after [dispose] are ignored.
  void connect() {
    if (_disposed) return;
    _openSocket();
  }

  void _openSocket() {
    if (_disposed) return;

    _emitConnection(LiveConnection.connecting);

    final uri = Uri(
      scheme: 'ws',
      host: host,
      port: port,
      path: '/',
      queryParameters: {'token': token},
    );

    try {
      final channel = WebSocketChannel.connect(uri);
      _channel = channel;
      _subscription = channel.stream.listen(
        _onData,
        onError: (Object _, StackTrace __) => _onDisconnected(),
        onDone: _onDisconnected,
        cancelOnError: true,
      );
      _onConnected();
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _onConnected() {
    if (_disposed) return;
    _connected = true;
    _backoff = _initialBackoff;
    _emitConnection(LiveConnection.connected);
    _send({'type': 'subscribe'});
  }

  void _onData(dynamic raw) {
    if (raw is! String) return;
    Map<String, dynamic> msg;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return;
      msg = decoded;
    } catch (_) {
      return;
    }

    try {
      final type = msg['type'];
      if (type == 'state') {
        final rawSlots = msg['slots'];
        if (rawSlots is! List) return;
        final parsed = <SlotState>[];
        for (final entry in rawSlots) {
          if (entry is Map<String, dynamic>) {
            try {
              parsed.add(SlotState.fromJson(entry));
            } catch (_) {
              // skip malformed slot entry, keep the rest
            }
          }
        }
        if (!_slotsController.isClosed) _slotsController.add(parsed);
      } else if (type == 'log') {
        final message = msg['message'];
        if (message is String && !_logsController.isClosed) {
          _logsController.add(message);
        }
      }
    } catch (_) {
      // Ignore any other malformed message shape.
    }
  }

  void _onDisconnected() {
    _subscription?.cancel();
    _subscription = null;
    _channel = null;
    final wasConnected = _connected;
    _connected = false;
    if (_disposed) return;
    if (wasConnected || _channel == null) {
      _emitConnection(LiveConnection.disconnected);
    }
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (_disposed) return;
    _reconnectTimer?.cancel();
    final delay = _backoff;
    _reconnectTimer = Timer(delay, () {
      if (_disposed) return;
      _openSocket();
    });
    final nextMicros = _backoff.inMicroseconds * 2;
    _backoff = Duration(
      microseconds: math.min(nextMicros, _maxBackoff.inMicroseconds),
    );
  }

  /// Sends a command for [slotId]. Silently dropped (no throw) if not
  /// currently connected — matches "explicit focus, best-effort control
  /// channel" semantics; the UI should reflect connection state separately.
  void sendCommand(SlotCommand action, int slotId) {
    if (!_connected || _channel == null) return;
    _send({
      'type': 'command',
      'payload': {'action': slotCommandToWire(action), 'slotId': slotId},
    });
  }

  void _send(Map<String, dynamic> payload) {
    final channel = _channel;
    if (channel == null) return;
    try {
      channel.sink.add(jsonEncode(payload));
    } catch (_) {
      // Best effort; a broken sink will also surface via onError/onDone.
    }
  }

  void _emitConnection(LiveConnection state) {
    if (!_connectionController.isClosed) _connectionController.add(state);
  }

  /// Closes the socket and stops reconnecting. Safe to call multiple times.
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _subscription?.cancel();
    _subscription = null;
    _channel?.sink.close();
    _channel = null;
    _connected = false;
    unawaited(_slotsController.close());
    unawaited(_logsController.close());
    unawaited(_connectionController.close());
  }
}
